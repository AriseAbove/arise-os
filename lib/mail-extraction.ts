/**
 * Post-triage structured data extraction for the Gmail Worker — the third
 * stage of the pipeline, after lib/mail-triage.ts (junk verdict) and
 * lib/connectors/email-triage.ts (the IMAP runner that moves/logs it).
 * Runs exclusively on messages the classifier already called 'protected' —
 * it never re-decides, or even sees, a 'trash'/'quarantine' verdict.
 *
 * Deliberately deterministic, same reasoning as lib/mail-triage.ts: Sean's
 * own standing rule is that a fixed, auditable procedure beats a model that
 * can improvise ("a structured SOP ... brings the percentage of
 * hallucination down ... so they don't have to improvise on their own").
 * There is no LLM call anywhere in this file. Every field either matches one
 * of the patterns below or comes back `null` — never guessed, never
 * defaulted to 0 or "", never presented as a real answer when it isn't one.
 * A `null` here means "not found," and the UI must render it as exactly
 * that, not as an empty-looking value that could be mistaken for a real
 * zero or a real blank address.
 *
 * Zero IO, same as classifyForTriage — the subject/body text is handed in
 * already fetched, so this is trivially unit-testable without an IMAP
 * client anywhere nearby.
 */

export type ExtractionInput = {
  messageId: string;
  inboxId: string;
  subject: string;
  bodyText: string;
};

export type MailIntent = 'lead' | 'permit_inspection' | 'sub_bid' | 'bank_draw' | 'client_update' | 'general';

export type ExtractedFields = {
  intent: MailIntent;
  projectAddress: string | null;
  dollarAmount: number | null;
  drawNumber: number | null;
  invoiceNumber: string | null;
  confidence: number;
};

/** Common US street suffixes — deliberately not exhaustive. A miss here just
 * means projectAddress comes back null (honest), not a wrong guess. */
const STREET_SUFFIXES =
  'Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Circle|Cir|Terrace|Ter|Parkway|Pkwy|Highway|Hwy';

/** e.g. "742 Evergreen Ave", "1200 West Grand Boulevard" — a house number,
 * 1-3 words, then a recognized suffix. Requires a leading number so we never
 * mistake an ordinary sentence for an address. Deliberately capped at 3
 * words between the number and the suffix (real street names are almost
 * never longer than that) — a wider gap risks false-matching an unrelated
 * run-on sentence that happens to mention a number and a street-suffix word
 * later on (e.g. "12 crew members on Main Street today"). */
const ADDRESS_RE = new RegExp(
  `\\b(\\d{1,6}\\s+[A-Za-z0-9.'-]+(?:\\s+[A-Za-z0-9.'-]+){0,2}\\s+(?:${STREET_SUFFIXES})\\.?)\\b`,
  'i',
);

/** "$18,500", "$18,500.00", "$1200" — requires the leading $ so a bare
 * number (a draw number, a phone number) is never mistaken for an amount. */
const DOLLAR_RE = /\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/;

/** "Draw #2", "Draw No. 2", "Draw 2", "draw number 2". */
const DRAW_RE = /\bdraw\s*(?:#|no\.?|number)?\s*(\d{1,3})\b/i;

/** "Invoice #1234", "Invoice No. INV-1234", "invoice 1234" — kept as a
 * string since invoice numbers routinely mix letters and digits. The
 * captured token must contain at least one digit (a lookahead, not just
 * "any word after invoice") — otherwise an ordinary sentence like "invoice
 * attached" would capture the word "attached" as a fake invoice number. */
const INVOICE_RE = /\binvoice\s*(?:#|no\.?|number)?\s*((?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{2,20})\b/i;

/** Deterministic keyword sets per intent, checked in this priority order —
 * a message mentioning both a draw and a permit is a bank_draw message
 * first (the higher-stakes, more specific category), the same
 * first-match-wins discipline as lib/mail-triage.ts's CLIENT_KEYWORDS. Not
 * semantic understanding — an honest keyword heuristic, same as the rest of
 * this pipeline. */
const INTENT_KEYWORDS: ReadonlyArray<{ intent: MailIntent; keywords: readonly string[] }> = [
  {
    intent: 'bank_draw',
    keywords: ['draw request', 'draw schedule', 'draw #', 'hud consultant', '203k draw', 'lender release', 'draw inspection'],
  },
  {
    intent: 'permit_inspection',
    keywords: ['permit', 'inspection', 'inspector', 'projectdox', 'code compliance'],
  },
  {
    intent: 'sub_bid',
    keywords: ['subcontractor bid', 'sub bid', 'our bid', 'our quote', 'bid for the', 'quote attached', 'proposal attached'],
  },
  {
    intent: 'lead',
    keywords: ['interested in', 'looking for a contractor', 'requesting an estimate', 'quote for my', 'new project', 'get a quote'],
  },
  {
    intent: 'client_update',
    keywords: ['just wanted to update', 'wanted to let you know', 'checking in on', 'status of my project', 'when will', 'any update'],
  },
];

function findIntent(haystack: string): { intent: MailIntent; matched: boolean } {
  for (const { intent, keywords } of INTENT_KEYWORDS) {
    if (keywords.some((k) => haystack.includes(k))) return { intent, matched: true };
  }
  return { intent: 'general', matched: false };
}

function parseDollarAmount(text: string): number | null {
  const match = text.match(DOLLAR_RE);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseDrawNumber(text: string): number | null {
  const match = text.match(DRAW_RE);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function parseInvoiceNumber(text: string): string | null {
  const match = text.match(INVOICE_RE);
  return match ? match[1] : null;
}

function parseProjectAddress(text: string): string | null {
  const match = text.match(ADDRESS_RE);
  return match ? match[1].trim() : null;
}

/** Pure, deterministic — no IO, no LLM. Confidence is not a self-reported
 * model score; it's a plain count of how many independent signals actually
 * fired (an intent keyword match, plus one point per populated field),
 * capped at 100 — auditable the same way lib/mail-triage.ts's confidence
 * is: every point traces to something that was actually found in the text. */
export function extractFields(subject: string, bodyText: string): ExtractedFields {
  const haystack = `${subject}\n${bodyText}`.toLowerCase();
  const rawText = `${subject}\n${bodyText}`;

  const { intent, matched } = findIntent(haystack);
  const projectAddress = parseProjectAddress(rawText);
  const dollarAmount = parseDollarAmount(rawText);
  const drawNumber = parseDrawNumber(rawText);
  const invoiceNumber = parseInvoiceNumber(rawText);

  let confidence = matched ? 20 : 0;
  if (projectAddress !== null) confidence += 20;
  if (dollarAmount !== null) confidence += 20;
  if (drawNumber !== null) confidence += 20;
  if (invoiceNumber !== null) confidence += 20;

  return {
    intent,
    projectAddress,
    dollarAmount,
    drawNumber,
    invoiceNumber,
    confidence: Math.min(confidence, 100),
  };
}

export type MailExtractionResult = ExtractedFields & {
  id: string;
  messageId: string;
  inboxId: string;
  extractedAt: string;
};

/** The full extraction record for one message, ready to hand to
 * db.mailExtractions.insert(). `now` is injectable for deterministic tests. */
export function extractMailData(input: ExtractionInput, now: () => Date = () => new Date()): MailExtractionResult {
  const fields = extractFields(input.subject, input.bodyText);
  return {
    id: `${input.inboxId}-${input.messageId}`,
    messageId: input.messageId,
    inboxId: input.inboxId,
    extractedAt: now().toISOString(),
    ...fields,
  };
}
