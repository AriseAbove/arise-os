/**
 * Pure junk classification for the Gmail Worker's inbox-triage capability.
 *
 * Rewritten 2026-08-28 to Sean's "Zero-Scan, High-Confidence Quarantine"
 * model: a message either bypasses triage entirely (fast-path safety), or
 * gets a deterministic junk-confidence score that buckets it into one of
 * three actions. There is no LLM in this decision — every score comes from
 * a fixed, auditable point value attached to a specific signal (host spam
 * flag, a narrow scam-phrase match, or a bare List-Unsubscribe header).
 * Sean asked for this precisely so the agent never "improvises": the same
 * input always produces the same score, every time, and the score is only
 * ever computed AFTER every fast-path exclusion below has already missed.
 *
 * Zero IO here on purpose: every signal is passed in already extracted, so
 * this is trivially unit-testable and the whole rule set can be read start
 * to finish without an IMAP client in the way.
 *
 *   >= 95  'trash'      — moved straight to Trash (capped per run)
 *   60-94  'quarantine' — moved to a dedicated Quarantine folder, silently,
 *                         and auto-released to Trash after N days if never
 *                         rescued (see lib/connectors/email-triage.ts)
 *   < 60   'protected'  — left exactly where it is, in the inbox
 *
 * The ordering is still the whole safety story: fast-path exclusions are
 * checked FIRST and win outright, no matter how many junk signals also
 * happen to match — a known contact, an existing thread, a starred
 * message, an attachment, or a client/project keyword in the subject never
 * gets scored at all, let alone moved.
 */

export type MailTriageVerdict = 'trash' | 'quarantine' | 'protected';

export type TriageInput = {
  fromAddress: string;
  fromName?: string | null;
  subject: string;
  /** RFC List-Unsubscribe header present on the message. */
  hasListUnsubscribe: boolean;
  /** The mail host's own spam classifier already flagged this (X-Spam-Flag: YES or equivalent). */
  hostSpamFlag: boolean;
  /** Any MIME part has an attachment disposition. */
  hasAttachments: boolean;
  /** \Flagged (starred) by a person. */
  flagged: boolean;
  /** Part of an existing thread (envelope In-Reply-To is set). */
  isThreadReply: boolean;
  /** Lowercased email addresses already known to the business (CRM/funnel contacts). */
  knownSenders: ReadonlySet<string>;
};

export type TriageVerdict = {
  verdict: MailTriageVerdict;
  /** 0-100 junk-confidence. Always 0 for a fast-path exclusion (it was
   * never scored — not "scored zero"). Deterministic: same input, same
   * number, every time. */
  confidence: number;
  reason: string;
};

/** >= this score: high-confidence junk, straight to Trash. */
export const TRASH_THRESHOLD = 95;
/** >= this score (and below TRASH_THRESHOLD): ambiguous, Quarantine. */
export const QUARANTINE_THRESHOLD = 60;

/** Subject-line phrases that mean "this is a real client/project message" —
 * checked before any junk signal, and winning outright when matched. */
const CLIENT_KEYWORDS = [
  '203k',
  '203(k)',
  'permit',
  'draw schedule',
  'estimate',
  'invoice',
  'walkthrough',
  'contract',
  'change order',
  'punch list',
  'proposal',
  // EPA RRP (lead-paint renovator) certification — a real, recurring
  // compliance requirement for a renovation contractor. Found 2026-08-31:
  // these reminders/updates route through shared Constant Contact sending
  // pools (e.g. shared1.ccsend.com) used by countless unrelated senders, so
  // a domain-trust entry would be far too broad — a subject-keyword match is
  // the narrow, deterministic way to catch this specific content instead.
  'rrp certification',
  'epa rrp',
];

/** High-precision scam phrasing — deliberately narrow. A missed scam stays
 * in the inbox for a human to see (safe); a false match trashes a real
 * email (not safe) — so this list only holds phrases with very low
 * legitimate-use rates, not generic marketing language. */
const SCAM_KEYWORDS = [
  'wire transfer immediately',
  'gift card',
  'you have won',
  'claim your prize',
  'claim your reward',
  'urgent payment required',
  'verify your account immediately',
];

/** Domains that must never be junk-scored, found from real production dry-run
 * data: the BULK_UNSUBSCRIBE_CONFIDENCE signal alone ("has a List-Unsubscribe
 * header, sender isn't a known CRM contact") was quarantining genuinely
 * important mail from these sources, none of which is ever junk:
 *   - the business's own domain — its WordPress site's contact-form and
 *     job-application notifications (info@/wordpress@/recruiter@) route
 *     through here and include real leads and document reminders (a client
 *     walkthrough notice, a signed BuildStrong SOW reminder, a 1099-NEC tax
 *     form all showed up misclassified in production)
 *   - Allo, the AI receptionist — its missed-call and call-answered alerts
 *     ARE the lead pipeline; one day of dry-run data caught 124 of these
 *   - healthchecks.io — this app's own uptime monitoring for AAC's infra
 *   - intuit.com — the identity/security stream for the QuickBooks account
 *     this business's books run through (found 2026-08-30/31: "New Device
 *     Log In," "A passkey was added to your Intuit Account," and "Your
 *     Intuit subscription was canceled" were all landing in quarantine,
 *     silent-safety-net-only, no auto-purge exception for a security alert)
 *   - legalshieldproviders.com — an active legal-service relationship
 *     ("Prepare for your call," "You've missed a call," a numbered service
 *     request thread), not marketing
 *   - qtbizsolutions.com — a real business-development contact (Briana
 *     Banks, BuildStrong Detroit Business Plan Process) whose calendar
 *     invites CC info@ariseaboveconstruction.com but who has no funnel/CRM
 *     record of her own (she's a program contact, not a sales lead), so the
 *     existing known-contact check alone can never catch her
 *   - roofr.com — real roofing-estimation software Sean uses; its "your
 *     password has been changed" security alert is exactly the kind of
 *     notice that should never silently age out (confirmed by Sean 2026-08-31)
 *   - adobesign.com — real e-signature platform Sean uses for contracts and
 *     warranties (e.g. a Greenlawn Cabinet Warranty awaiting signature);
 *     confirmed by Sean 2026-08-31
 * A domain match wins outright, same as every other fast-path exclusion —
 * checked before scoring, never itself scored. */
const TRUSTED_SENDER_DOMAINS = [
  'ariseaboveconstruction.com',
  'withallo.com',
  'healthchecks.io',
  'intuit.com',
  'legalshieldproviders.com',
  'qtbizsolutions.com',
  'roofr.com',
  'adobesign.com',
];

export function isTrustedDomain(fromAddress: string): boolean {
  const at = fromAddress.lastIndexOf('@');
  if (at === -1) return false;
  const domain = fromAddress.slice(at + 1).toLowerCase();
  return TRUSTED_SENDER_DOMAINS.some((trusted) => domain === trusted || domain.endsWith(`.${trusted}`));
}

/** Fixed point values per signal — the entire "confidence" story. Nothing
 * here is a guess or an average; each number is a deliberate policy choice
 * about how reliable that one signal is. Host-level spam flags and the
 * narrow scam-phrase list both clear the 95 trash threshold on their own;
 * a bare List-Unsubscribe with no prior contact (routine bulk marketing,
 * not necessarily malicious) lands in the 60-94 quarantine band instead of
 * being trashed outright. */
const HOST_SPAM_FLAG_CONFIDENCE = 97;
const SCAM_KEYWORD_CONFIDENCE = 96;
const BULK_UNSUBSCRIBE_CONFIDENCE = 75;
const NO_SIGNAL_CONFIDENCE = 0;

function findMatch(haystack: string, needles: readonly string[]): string | undefined {
  const lower = haystack.toLowerCase();
  return needles.find((needle) => lower.includes(needle));
}

/** The deterministic score itself, isolated so it's independently testable
 * from the bucket thresholds above it. */
export function junkConfidence(input: TriageInput): { score: number; signal: string | null } {
  if (input.hostSpamFlag) {
    return { score: HOST_SPAM_FLAG_CONFIDENCE, signal: 'host spam flag' };
  }
  const scamKeyword = findMatch(input.subject, SCAM_KEYWORDS);
  if (scamKeyword) {
    return { score: SCAM_KEYWORD_CONFIDENCE, signal: `scam phrase ("${scamKeyword}")` };
  }
  if (input.hasListUnsubscribe) {
    return { score: BULK_UNSUBSCRIBE_CONFIDENCE, signal: 'bulk sender (List-Unsubscribe), no prior contact' };
  }
  return { score: NO_SIGNAL_CONFIDENCE, signal: null };
}

export function classifyForTriage(input: TriageInput): TriageVerdict {
  const fromLower = input.fromAddress.trim().toLowerCase();

  // --- Fast-path safety. Any one of these bypasses junk scoring entirely. ---
  if (fromLower && isTrustedDomain(fromLower)) {
    return { verdict: 'protected', confidence: 0, reason: 'trusted operational/business domain — bypasses triage entirely' };
  }
  if (fromLower && input.knownSenders.has(fromLower)) {
    return { verdict: 'protected', confidence: 0, reason: 'known contact — bypasses triage entirely' };
  }
  if (input.isThreadReply) {
    return { verdict: 'protected', confidence: 0, reason: 'existing conversation thread — bypasses triage entirely' };
  }
  if (input.flagged) {
    return { verdict: 'protected', confidence: 0, reason: 'starred/flagged by a person — bypasses triage entirely' };
  }
  if (input.hasAttachments) {
    return { verdict: 'protected', confidence: 0, reason: 'has an attachment — bypasses triage entirely' };
  }
  const clientKeyword = findMatch(input.subject, CLIENT_KEYWORDS);
  if (clientKeyword) {
    return {
      verdict: 'protected',
      confidence: 0,
      reason: `subject mentions "${clientKeyword}" — bypasses triage entirely`,
    };
  }

  // --- Scored only once every fast-path exclusion above is a miss. ---
  const { score, signal } = junkConfidence(input);

  if (score >= TRASH_THRESHOLD) {
    return { verdict: 'trash', confidence: score, reason: `${signal} (${score}% confidence)` };
  }
  if (score >= QUARANTINE_THRESHOLD) {
    return { verdict: 'quarantine', confidence: score, reason: `${signal} (${score}% confidence) — ambiguous` };
  }
  return {
    verdict: 'protected',
    confidence: score,
    reason: 'no exclusion and no confident junk signal — left in the inbox',
  };
}
