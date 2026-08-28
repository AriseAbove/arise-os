/**
 * Server-side composition for the /comms "Drafts" review tab — joins each
 * pending Gmail Worker draft (lib/db.ts's mailDrafts, written by
 * lib/mail-drafts.ts) back to the extraction it was built from
 * (lib/mail-extraction.ts) and the triage-verified sender/subject
 * POST /api/comms/approve-draft will actually send to
 * (mail_triage_log, keyed by Message-ID) — so the review UI can show a human
 * enough context to approve responsibly without querying three tables
 * itself, and never has to guess at a reply-to address the way the send path
 * itself deliberately never does either.
 *
 * Read-only. Never writes, never sends — this only reads what's already
 * there. Approving, editing, or rejecting a draft still goes exclusively
 * through POST /api/comms/approve-draft.
 */
import type { FounderDb } from '@/lib/db';
import type { MailDraft, MailIntent } from '@/lib/schemas';

export type DraftReview = {
  draft: MailDraft;
  intent: MailIntent;
  projectAddress: string | null;
  dollarAmount: number | null;
  drawNumber: number | null;
  invoiceNumber: string | null;
  extractionConfidence: number;
  subject: string | null;
  fromAddress: string | null;
  inboxName: string | null;
};

/** Pending drafts, oldest first (the queue is worked in arrival order), each
 * enriched with its extracted fields and the real triage-verified sender.
 * A draft whose extraction or triage row is somehow missing — should never
 * happen, since lib/connectors/email-triage.ts writes both before the draft
 * itself — still renders honestly with those fields `null` rather than
 * throwing and hiding the whole queue over one bad row. */
export function pendingDraftReviews(db: FounderDb, limit = 100): DraftReview[] {
  return db.mailDrafts.pending(limit).map((draft: MailDraft) => {
    const extraction = db.mailExtractions.byId(draft.extractionId);
    const triage = db.mailTriageLog.byMessageId(draft.messageId);
    return {
      draft,
      intent: extraction?.intent ?? 'general',
      projectAddress: extraction?.projectAddress ?? null,
      dollarAmount: extraction?.dollarAmount ?? null,
      drawNumber: extraction?.drawNumber ?? null,
      invoiceNumber: extraction?.invoiceNumber ?? null,
      extractionConfidence: extraction?.confidence ?? 0,
      subject: triage?.subject ?? null,
      fromAddress: triage?.fromAddress ?? null,
      inboxName: triage?.inboxName ?? null,
    };
  });
}
