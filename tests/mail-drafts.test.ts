import { describe, expect, test } from 'vitest';
import { buildExecutiveSummary, buildProposedReply, generateMailDraft, type DraftInput } from '@/lib/mail-drafts';
import type { MailExtractionResult } from '@/lib/mail-extraction';

function extraction(over: Partial<MailExtractionResult> = {}): MailExtractionResult {
  return {
    id: 'inbox-1-<msg1>',
    messageId: '<msg1>',
    inboxId: 'inbox-1',
    intent: 'bank_draw',
    projectAddress: '742 Evergreen Ave',
    dollarAmount: 18500,
    drawNumber: 2,
    invoiceNumber: null,
    confidence: 80,
    extractedAt: '2026-08-29T00:00:00.000Z',
    ...over,
  };
}

describe('buildExecutiveSummary', () => {
  test('references every non-null extracted field', () => {
    const summary = buildExecutiveSummary({ messageId: '<msg1>', extraction: extraction(), subject: '203k Draw Request' });
    expect(summary).toContain('742 Evergreen Ave');
    expect(summary).toContain('$18,500');
    expect(summary).toContain('Draw #: 2');
    expect(summary).toContain('80%');
  });

  test('is honest about a fully-unparsed message — says so rather than omitting the fields', () => {
    const summary = buildExecutiveSummary({
      messageId: '<msg2>',
      subject: 'Question',
      extraction: extraction({
        intent: 'general',
        projectAddress: null,
        dollarAmount: null,
        drawNumber: null,
        invoiceNumber: null,
        confidence: 0,
      }),
    });
    expect(summary.toLowerCase()).toContain('no project address, dollar amount, draw #, or invoice #');
  });
});

describe('buildProposedReply', () => {
  test('a bank_draw reply mentions the draw number, amount, and address when all are known', () => {
    const reply = buildProposedReply({ messageId: '<msg1>', extraction: extraction(), subject: '203k Draw Request', fromName: 'Maria Lopez' });
    expect(reply).toContain('Hi Maria,');
    expect(reply).toContain('Draw #2');
    expect(reply).toContain('$18,500');
    expect(reply).toContain('742 Evergreen Ave');
  });

  test('never references a field the extraction did not actually find', () => {
    const reply = buildProposedReply({
      messageId: '<msg3>',
      subject: 'Draw update',
      fromName: 'Sam',
      extraction: extraction({ dollarAmount: null, projectAddress: null, drawNumber: null }),
    });
    expect(reply).not.toContain('$');
    expect(reply).not.toContain('Evergreen');
    expect(reply).not.toContain('Draw #');
    expect(reply).toContain('the draw request');
  });

  test('falls back to a generic greeting when no sender name is known', () => {
    const reply = buildProposedReply({ messageId: '<msg4>', subject: 'Hi', fromName: null, extraction: extraction({ intent: 'general' }) });
    expect(reply).toContain('Hi there,');
  });
});

describe('generateMailDraft', () => {
  const input: DraftInput = { messageId: '<msg1>', extraction: extraction(), subject: '203k Draw Request', fromName: 'Maria' };

  test('always starts in pending status, never anything else', () => {
    const draft = generateMailDraft(input, 'inbox-1-<msg1>', () => new Date('2026-08-29T12:00:00.000Z'));
    expect(draft.status).toBe('pending');
    expect(draft.id).toBe('<msg1>-draft');
    expect(draft.messageId).toBe('<msg1>');
    expect(draft.extractionId).toBe('inbox-1-<msg1>');
    expect(draft.createdAt).toBe('2026-08-29T12:00:00.000Z');
    expect(draft.updatedAt).toBe('2026-08-29T12:00:00.000Z');
  });
});
