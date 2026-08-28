import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { sendEmailReply } from '@/lib/connectors/email';

export const dynamic = 'force-dynamic';

/**
 * POST — the one write path that can move a Gmail Worker draft out of
 * 'pending' and, on approval, actually send it. Strict human-in-the-loop by
 * design (Sean's explicit rule): nothing anywhere else in this codebase can
 * call sendEmailReply on a generated draft — only an explicit tap here.
 *
 * The recipient address and subject are deliberately NOT taken from the
 * request body — they're looked up server-side from mail_triage_log (every
 * message triage evaluates gets a row there, fromAddress/inboxId/subject
 * included, keyed by the same Message-ID the draft was built from). That's
 * the real, triage-verified sender, not a client-supplied string a caller
 * could point anywhere.
 */
const ApproveDraftSchema = z.object({
  draftId: z.string().min(1),
  messageId: z.string().min(1),
  action: z.enum(['approve', 'edit_and_send', 'reject']),
  editedText: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const parsed = ApproveDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { draftId, messageId, action, editedText } = parsed.data;

  const db = getDb();
  const draft = db.mailDrafts.byId(draftId);
  if (!draft || draft.messageId !== messageId) {
    return NextResponse.json({ ok: false, error: 'draft not found for this message' }, { status: 404 });
  }
  if (draft.status !== 'pending') {
    return NextResponse.json({ ok: false, error: `draft already resolved (status: ${draft.status})` }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (action === 'reject') {
    db.mailDrafts.updateStatus(draftId, 'rejected', now);
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  if (action === 'edit_and_send' && !editedText) {
    return NextResponse.json({ ok: false, error: 'editedText is required for edit_and_send' }, { status: 400 });
  }

  const triageEntry = db.mailTriageLog.byMessageId(messageId);
  if (!triageEntry) {
    return NextResponse.json(
      { ok: false, error: 'no triage record found for this message — cannot determine a real reply-to address' },
      { status: 409 },
    );
  }

  const finalReplyText = action === 'edit_and_send' ? (editedText as string) : draft.proposedReplyText;
  const sendResult = await sendEmailReply({
    accountId: triageEntry.inboxId,
    to: triageEntry.fromAddress,
    subject: `Re: ${triageEntry.subject}`,
    text: finalReplyText,
  });

  if (!sendResult.ok) {
    // Draft stays 'pending' on a genuine send failure — a person can retry
    // the approval rather than the draft being silently marked resolved
    // for a send that never actually happened.
    return NextResponse.json({ ok: false, error: sendResult.error ?? 'send failed' }, { status: 502 });
  }

  db.mailDrafts.updateStatus(draftId, action === 'edit_and_send' ? 'edited' : 'approved', now, editedText);
  return NextResponse.json({ ok: true, status: action === 'edit_and_send' ? 'edited' : 'approved', sent: true });
}
