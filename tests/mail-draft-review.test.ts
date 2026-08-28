import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { getDb, resetDbForTests } from '@/lib/data';
import { pendingDraftReviews } from '@/lib/mail-draft-review';
import type { MailDraft, MailExtraction, MailTriageLog } from '@/lib/schemas';

/**
 * lib/mail-draft-review.ts — the read-only join behind /comms' "Drafts" tab.
 * Never writes, never sends; just enriches each pending draft with the
 * extraction it came from and the triage-verified sender it would go to.
 */
describe('pendingDraftReviews', () => {
  const prevDb = process.env.FOUNDER_OS_DB;
  beforeEach(() => {
    process.env.FOUNDER_OS_DB = ':memory:';
    resetDbForTests();
  });
  afterEach(() => {
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
    resetDbForTests();
  });

  function seedDraft(opts: {
    messageId: string;
    draftId: string;
    createdAt: string;
    status?: MailDraft['status'];
    withExtraction?: boolean;
    withTriage?: boolean;
  }) {
    const db = getDb();
    if (opts.withTriage !== false) {
      const triage: MailTriageLog = {
        id: `inbox-1-1-${opts.messageId}`,
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
        messageId: opts.messageId,
        purgedAt: null,
        createdAt: opts.createdAt,
      };
      db.mailTriageLog.insert(triage);
    }
    const extractionId = `inbox-1-${opts.messageId}`;
    if (opts.withExtraction !== false) {
      const extraction: MailExtraction = {
        id: extractionId,
        messageId: opts.messageId,
        inboxId: 'inbox-1',
        intent: 'bank_draw',
        projectAddress: '742 Evergreen Ave',
        dollarAmount: 18500,
        drawNumber: 2,
        invoiceNumber: null,
        confidence: 80,
        extractedAt: opts.createdAt,
      };
      db.mailExtractions.insert(extraction);
    }
    const draft: MailDraft = {
      id: opts.draftId,
      messageId: opts.messageId,
      extractionId,
      executiveSummary: 'This looks like a bank draw request.',
      proposedReplyText: 'Hi there, reviewing Draw #2 for $18,500 at 742 Evergreen Ave.',
      status: opts.status ?? 'pending',
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
    };
    db.mailDrafts.insert(draft);
  }

  test('enriches a pending draft with its extraction fields and the triage-verified sender', () => {
    seedDraft({ messageId: '<msg-1>', draftId: 'draft-1', createdAt: '2026-08-29T00:00:00.000Z' });
    const reviews = pendingDraftReviews(getDb());
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      intent: 'bank_draw',
      projectAddress: '742 Evergreen Ave',
      dollarAmount: 18500,
      drawNumber: 2,
      invoiceNumber: null,
      extractionConfidence: 80,
      subject: '203k Draw Request',
      fromAddress: 'client@example.com',
      inboxName: 'AAC',
    });
    expect(reviews[0].draft.id).toBe('draft-1');
  });

  test('excludes resolved drafts — only pending ones show up', () => {
    seedDraft({ messageId: '<msg-approved>', draftId: 'draft-approved', createdAt: '2026-08-29T00:00:00.000Z', status: 'approved' });
    seedDraft({ messageId: '<msg-pending>', draftId: 'draft-pending', createdAt: '2026-08-29T00:01:00.000Z' });
    const reviews = pendingDraftReviews(getDb());
    expect(reviews.map((r) => r.draft.id)).toEqual(['draft-pending']);
  });

  test('orders oldest first', () => {
    seedDraft({ messageId: '<msg-b>', draftId: 'draft-b', createdAt: '2026-08-29T02:00:00.000Z' });
    seedDraft({ messageId: '<msg-a>', draftId: 'draft-a', createdAt: '2026-08-29T01:00:00.000Z' });
    const reviews = pendingDraftReviews(getDb());
    expect(reviews.map((r) => r.draft.id)).toEqual(['draft-a', 'draft-b']);
  });

  test('honest fallback when the extraction or triage row is missing — never throws, never guesses', () => {
    seedDraft({
      messageId: '<msg-orphan>',
      draftId: 'draft-orphan',
      createdAt: '2026-08-29T00:00:00.000Z',
      withExtraction: false,
      withTriage: false,
    });
    const reviews = pendingDraftReviews(getDb());
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      intent: 'general',
      projectAddress: null,
      dollarAmount: null,
      drawNumber: null,
      invoiceNumber: null,
      extractionConfidence: 0,
      subject: null,
      fromAddress: null,
      inboxName: null,
    });
  });

  test('respects the limit parameter', () => {
    seedDraft({ messageId: '<msg-1>', draftId: 'draft-1', createdAt: '2026-08-29T01:00:00.000Z' });
    seedDraft({ messageId: '<msg-2>', draftId: 'draft-2', createdAt: '2026-08-29T02:00:00.000Z' });
    const reviews = pendingDraftReviews(getDb(), 1);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].draft.id).toBe('draft-1');
  });
});
