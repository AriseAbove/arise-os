/**
 * Pure junk classification for the Gmail Worker's inbox-triage expansion
 * (2026-08-28, per Sean's approved SOP — see docs/gmail-worker-triage-sop.md).
 * Zero IO here on purpose: every signal is passed in already extracted, so
 * this is trivially unit-testable and the exclusion/junk rule set can be
 * read start to finish without an IMAP client in the way.
 *
 * The ordering is the whole safety story: exclusions are checked FIRST and
 * win outright, no matter how many junk signals also happen to match. A
 * message that matches neither list is 'review', never 'junk' — an
 * unrecognized pattern must never be treated as license to move something
 * real. This mirrors the approved SOP's "when ambiguous, leave it alone."
 */

export type MailTriageVerdict = 'not_junk' | 'junk' | 'review';

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
  reason: string;
};

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
];

/** High-precision scam phrasing — deliberately narrow. A missed scam stays
 * in the inbox for a human to see (safe); a false match moves a real email
 * (not safe) — so this list only holds phrases with very low legitimate-use
 * rates, not generic marketing language. */
const SCAM_KEYWORDS = [
  'wire transfer immediately',
  'gift card',
  'you have won',
  'claim your prize',
  'claim your reward',
  'urgent payment required',
  'verify your account immediately',
];

function findMatch(haystack: string, needles: readonly string[]): string | undefined {
  const lower = haystack.toLowerCase();
  return needles.find((needle) => lower.includes(needle));
}

export function classifyForTriage(input: TriageInput): TriageVerdict {
  const fromLower = input.fromAddress.trim().toLowerCase();

  // --- Exclusions first. Any one of these wins outright. ---
  if (fromLower && input.knownSenders.has(fromLower)) {
    return { verdict: 'not_junk', reason: 'sender is a known contact' };
  }
  if (input.isThreadReply) {
    return { verdict: 'not_junk', reason: 'part of an existing conversation thread' };
  }
  if (input.flagged) {
    return { verdict: 'not_junk', reason: 'starred/flagged by a person' };
  }
  if (input.hasAttachments) {
    return { verdict: 'not_junk', reason: 'message has an attachment' };
  }
  const clientKeyword = findMatch(input.subject, CLIENT_KEYWORDS);
  if (clientKeyword) {
    return { verdict: 'not_junk', reason: `subject mentions "${clientKeyword}"` };
  }

  // --- Junk signals. Reached only once every exclusion above is a miss. ---
  if (input.hostSpamFlag) {
    return { verdict: 'junk', reason: 'mail host already flagged this as spam' };
  }
  const scamKeyword = findMatch(input.subject, SCAM_KEYWORDS);
  if (scamKeyword) {
    return { verdict: 'junk', reason: `subject matches a known scam pattern ("${scamKeyword}")` };
  }
  if (input.hasListUnsubscribe) {
    return { verdict: 'junk', reason: 'bulk sender (List-Unsubscribe) with no prior contact' };
  }

  // --- Neither list matched: never guess. ---
  return { verdict: 'review', reason: 'no exclusion and no confident junk signal — needs a human look' };
}
