import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/connectors/email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/connectors/email')>('@/lib/connectors/email');
  return { ...actual, sendEmailReply: vi.fn() };
});

import { POST } from '@/app/api/comms/approve-draft/route';
import { getDb, resetDbForTests } from '@/lib/data';
import { sendEmailReply } from '@/lib/connectors/email';
import type { MailDraft, MailExtraction, MailTriageLog } from '@/lib/schemas';

const sendMock = sendEmailReply as unknown as ReturnType<typeof vi.fn>;

/**
 * POST /api/comms/approve-draft — the one place a Gmail Worker draft can
 * move out of 'pending' and actually send. sendEmailReply is mocked at the
 * module boundary (this repo's existing tests never exercise a real SMTP
 * send either — see tests/comms-reply.test.ts) so both the success and
 * failure paths are deterministic and don't touch the network.
 */
describe('/api/comms/approve-draft', () => {
  const prevDb = process.env.FOUNDER_OS_DB;
  beforeEach(() => {
    process.env.FOUNDER_OS_DB = ':memory:';
    resetDbForTests();
    sendMock.mockReset();
  });
  afterEach(() => {
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
    resetDbForTests();
  });

  function seed(messageId: string, draftId: string, draftStatus: MailDraft['status'] = 'pending') {
    const db = getDb();
    const triageRow: MailTriageLog = {
      id: `inbox-1-1-${messageId}`,
      inboxId: 'inbox-1',
      inboxName: 'AAC',
      uid: 1,
      fromAddress: 'client@example.com',
      subject: '203k Draw Request',
      verdict: 'protected',
      confidence: 0,
      reason: 'client keyword',
      moved: false,
      mode: 'dry_run',
      messageId,
      purgedAt: null,
      createdAt: '2026-08-29T00:00:00.000Z',
    };
    db.mailTriageLog.insert(triageRow);

    const extraction: MailExtraction = {
      id: `inbox-1-${messageId}`,
      messageId,
      inboxId: 'inbox-1',
      intent: 'bank_draw',
      projectAddress: '742 Evergreen Ave',
      dollarAmount: 18500,
      drawNumber: 2,
      invoiceNumber: null,
      confidence: 80,
      extractedAt: '2026-08-29T00:00:00.000Z',
    };
    db.mailExtractions.insert(extraction);

    const draft: MailDraft = {
      id: draftId,
      messageId,
      extractionId: extraction.id,
      executiveSummary: 'This looks like a bank draw request.',
      proposedReplyText: 'Hi there, reviewing Draw #2 for $18,500 at 742 Evergreen Ave.',
      status: draftStatus,
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };
    db.mailDrafts.insert(draft);
    return { triageRow, extraction, draft };
  }

  const post = (body: unknown) =>
    POST(
      new Request('http://test/api/comms/approve-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  test('reject sets status to rejected and never calls sendEmailReply', async () => {
    seed('<msg-reject>', 'draft-reject');
    const res = await post({ draftId: 'draft-reject', messageId: '<msg-reject>', action: 'reject' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, status: 'rejected' });
    expect(sendMock).not.toHaveBeenCalled();
    expect(getDb().mailDrafts.byId('draft-reject')?.status).toBe('rejected');
  });

  test('approve sends the proposed reply text to the real triage-verified address and marks approved', async () => {
    seed('<msg-approve>', 'draft-approve');
    sendMock.mockResolvedValueOnce({ ok: true });

    const res = await post({ draftId: 'draft-approve', messageId: '<msg-approve>', action: 'approve' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, status: 'approved', sent: true });

    expect(sendMock).toHaveBeenCalledWith({
      accountId: 'inbox-1',
      to: 'client@example.com',
      subject: 'Re: 203k Draw Request',
      text: 'Hi there, reviewing Draw #2 for $18,500 at 742 Evergreen Ave.',
    });
    expect(getDb().mailDrafts.byId('draft-approve')?.status).toBe('approved');
  });

  test('edit_and_send requires editedText', async () => {
    seed('<msg-edit-missing>', 'draft-edit-missing');
    const res = await post({ draftId: 'draft-edit-missing', messageId: '<msg-edit-missing>', action: 'edit_and_send' });
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('edit_and_send sends the edited text and marks the draft edited', async () => {
    seed('<msg-edit>', 'draft-edit');
    sendMock.mockResolvedValueOnce({ ok: true });

    const res = await post({
      draftId: 'draft-edit',
      messageId: '<msg-edit>',
      action: 'edit_and_send',
      editedText: 'Hi — confirmed, sending the draw approval today.',
    });
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hi — confirmed, sending the draw approval today.' }),
    );
    const updated = getDb().mailDrafts.byId('draft-edit');
    expect(updated?.status).toBe('edited');
    expect(updated?.proposedReplyText).toBe('Hi — confirmed, sending the draw approval today.');
  });

  test('a genuine send failure leaves the draft pending, not silently resolved', async () => {
    seed('<msg-fail>', 'draft-fail');
    sendMock.mockResolvedValueOnce({ ok: false, error: 'smtp connection refused' });

    const res = await post({ draftId: 'draft-fail', messageId: '<msg-fail>', action: 'approve' });
    expect(res.status).toBe(502);
    expect(getDb().mailDrafts.byId('draft-fail')?.status).toBe('pending');
  });

  test('404s for an unknown draft id', async () => {
    const res = await post({ draftId: 'does-not-exist', messageId: '<msg-x>', action: 'approve' });
    expect(res.status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('409s when the draft has already been resolved — no double-send', async () => {
    seed('<msg-resolved>', 'draft-resolved', 'approved');
    const res = await post({ draftId: 'draft-resolved', messageId: '<msg-resolved>', action: 'approve' });
    expect(res.status).toBe(409);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('400s on invalid JSON', async () => {
    const res = await POST(
      new Request('http://test/api/comms/approve-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  test('no-auto-send guardrail: inserting a draft directly never triggers a send on its own', () => {
    seed('<msg-noauto>', 'draft-noauto');
    expect(sendMock).not.toHaveBeenCalled();
    expect(getDb().mailDrafts.byId('draft-noauto')?.status).toBe('pending');
  });
});
