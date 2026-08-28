/**
 * Draft generation for the Gmail Worker's post-triage pipeline — the fourth
 * stage, after lib/mail-triage.ts (junk verdict) and lib/mail-extraction.ts
 * (structured fields). Builds a short executive summary and a proposed
 * reply for the /comms card; nothing here ever sends anything.
 *
 * Deliberately templated, not free-text generated: every sentence is built
 * from the same deterministic fields lib/mail-extraction.ts already
 * produced, so a draft can never say more than the extraction actually
 * found. A null field is described as not found, never silently omitted in
 * a way that reads as "there was nothing to report" when really the parser
 * just couldn't confirm it — see buildExecutiveSummary's per-field lines.
 *
 * Strict human-in-the-loop, Sean's explicit rule: a draft is created in
 * 'pending' status and stays there until a real person approves it via
 * POST /api/comms/approve-draft. Nothing in this file calls sendEmailReply,
 * and nothing anywhere in the pipeline is allowed to move a draft to
 * 'approved'/'edited' on its own.
 */
import type { MailIntent, MailExtractionResult } from '@/lib/mail-extraction';

export type DraftInput = {
  messageId: string;
  extraction: MailExtractionResult;
  subject: string;
  fromName?: string | null;
};

const INTENT_LABEL: Record<MailIntent, string> = {
  lead: 'a new lead inquiry',
  permit_inspection: 'a permit/inspection matter',
  sub_bid: 'a subcontractor bid',
  bank_draw: 'a bank draw request',
  client_update: 'a client status check-in',
  general: 'general correspondence',
};

function greetingName(fromName?: string | null): string {
  const trimmed = fromName?.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : 'there';
}

function fieldLine(label: string, value: string | null): string {
  return value === null ? `${label}: not found` : `${label}: ${value}`;
}

/**
 * 2-3 sentences for the /comms card. Every claim traces directly to a
 * non-null field from the extraction — a field the parser couldn't confirm
 * is stated as "not found," never left out in a way that could read as
 * "there was nothing there."
 */
export function buildExecutiveSummary(input: DraftInput): string {
  const { extraction } = input;
  const sentence1 = `This looks like ${INTENT_LABEL[extraction.intent]} (subject: "${input.subject}").`;

  const details: string[] = [];
  if (extraction.projectAddress !== null) details.push(fieldLine('Project address', extraction.projectAddress));
  if (extraction.dollarAmount !== null) details.push(fieldLine('Amount', `$${extraction.dollarAmount.toLocaleString('en-US')}`));
  if (extraction.drawNumber !== null) details.push(fieldLine('Draw #', String(extraction.drawNumber)));
  if (extraction.invoiceNumber !== null) details.push(fieldLine('Invoice #', extraction.invoiceNumber));

  const sentence2 =
    details.length > 0
      ? `${details.join(' · ')}.`
      : `No project address, dollar amount, draw #, or invoice # could be confidently parsed from this message — review the original before relying on any of those details.`;

  const sentence3 = `Extraction confidence: ${extraction.confidence}%.`;

  return `${sentence1} ${sentence2} ${sentence3}`;
}

/**
 * A conservative, reviewable reply draft per intent — references ONLY
 * fields that are non-null. Never states a draw number, amount, or address
 * that wasn't actually confirmed; falls back to generic acknowledgment
 * language for anything the parser couldn't find. This is a starting point
 * for the human to approve or edit, not a finished message.
 */
export function buildProposedReply(input: DraftInput): string {
  const { extraction } = input;
  const name = greetingName(input.fromName);
  const parts: string[] = [`Hi ${name},`, ''];

  switch (extraction.intent) {
    case 'bank_draw': {
      const drawPart = extraction.drawNumber !== null ? `Draw #${extraction.drawNumber}` : 'the draw request';
      const amountPart = extraction.dollarAmount !== null ? ` for $${extraction.dollarAmount.toLocaleString('en-US')}` : '';
      const addressPart = extraction.projectAddress !== null ? ` at ${extraction.projectAddress}` : '';
      parts.push(`Thanks for sending over ${drawPart}${amountPart}${addressPart}. I'm reviewing it now and will follow up with next steps shortly.`);
      break;
    }
    case 'permit_inspection': {
      const addressPart = extraction.projectAddress !== null ? ` for ${extraction.projectAddress}` : '';
      parts.push(`Thanks for the note on the permit/inspection${addressPart}. I'll look into it and get back to you with an update shortly.`);
      break;
    }
    case 'sub_bid': {
      const amountPart = extraction.dollarAmount !== null ? ` at $${extraction.dollarAmount.toLocaleString('en-US')}` : '';
      parts.push(`Thanks for the bid${amountPart} — I'll review it and follow up with any questions or next steps.`);
      break;
    }
    case 'lead': {
      parts.push(`Thanks for reaching out — I'd love to learn more about your project. I'll follow up shortly to set up a time to talk it through.`);
      break;
    }
    case 'client_update': {
      const addressPart = extraction.projectAddress !== null ? ` at ${extraction.projectAddress}` : '';
      parts.push(`Thanks for checking in on the project${addressPart}. I'll get you a status update shortly.`);
      break;
    }
    default: {
      parts.push(`Thanks for your message — I'll take a look and follow up shortly.`);
    }
  }

  parts.push('', 'Sean');
  return parts.join('\n');
}

export type MailDraftDraft = {
  id: string;
  messageId: string;
  extractionId: string;
  executiveSummary: string;
  proposedReplyText: string;
  status: 'pending';
  createdAt: string;
  updatedAt: string;
};

/** Builds the full draft record ready for db.mailDrafts.insert(). Always
 * created in 'pending' — nothing in this module can produce any other
 * starting status. `now` is injectable for deterministic tests. */
export function generateMailDraft(
  input: DraftInput,
  extractionId: string,
  now: () => Date = () => new Date(),
): MailDraftDraft {
  const nowIso = now().toISOString();
  return {
    id: `${input.messageId}-draft`,
    messageId: input.messageId,
    extractionId,
    executiveSummary: buildExecutiveSummary(input),
    proposedReplyText: buildProposedReply(input),
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
