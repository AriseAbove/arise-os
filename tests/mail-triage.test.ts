import { describe, expect, test } from 'vitest';
import { classifyForTriage, junkConfidence, TRASH_THRESHOLD, QUARANTINE_THRESHOLD, type TriageInput } from '@/lib/mail-triage';

const base: TriageInput = {
  fromAddress: 'someone@example.com',
  fromName: 'Someone',
  subject: 'Hello',
  hasListUnsubscribe: false,
  hostSpamFlag: false,
  hasAttachments: false,
  flagged: false,
  isThreadReply: false,
  knownSenders: new Set(),
};

describe('classifyForTriage — fast-path safety always wins, bypasses scoring entirely', () => {
  test('a known contact is protected, even with a spam flag set', () => {
    const result = classifyForTriage({
      ...base,
      fromAddress: 'client@aac-lead.com',
      hostSpamFlag: true,
      hasListUnsubscribe: true,
      knownSenders: new Set(['client@aac-lead.com']),
    });
    expect(result.verdict).toBe('protected');
    expect(result.confidence).toBe(0);
    expect(result.reason).toMatch(/known contact/);
  });

  test('an existing thread reply is protected', () => {
    const result = classifyForTriage({ ...base, isThreadReply: true, hostSpamFlag: true });
    expect(result.verdict).toBe('protected');
  });

  test('a starred message is protected', () => {
    const result = classifyForTriage({ ...base, flagged: true, hasListUnsubscribe: true });
    expect(result.verdict).toBe('protected');
  });

  test('a message with an attachment is protected', () => {
    const result = classifyForTriage({ ...base, hasAttachments: true, hostSpamFlag: true });
    expect(result.verdict).toBe('protected');
  });

  test('a client/project keyword in the subject is protected', () => {
    const result = classifyForTriage({
      ...base,
      subject: 'Estimate for your 203k rehab',
      hasListUnsubscribe: true,
      hostSpamFlag: true,
    });
    expect(result.verdict).toBe('protected');
    expect(result.reason).toMatch(/estimate|203k/);
  });
});

describe('junkConfidence — deterministic point values, no LLM judgment', () => {
  test('host spam flag alone clears the trash threshold', () => {
    const { score } = junkConfidence({ ...base, hostSpamFlag: true });
    expect(score).toBeGreaterThanOrEqual(TRASH_THRESHOLD);
  });

  test('a known scam phrase alone clears the trash threshold', () => {
    const { score } = junkConfidence({ ...base, subject: 'You have won a free prize, claim your prize now' });
    expect(score).toBeGreaterThanOrEqual(TRASH_THRESHOLD);
  });

  test('bulk mail (List-Unsubscribe alone) lands in the quarantine band, not trash', () => {
    const { score } = junkConfidence({ ...base, hasListUnsubscribe: true });
    expect(score).toBeGreaterThanOrEqual(QUARANTINE_THRESHOLD);
    expect(score).toBeLessThan(TRASH_THRESHOLD);
  });

  test('no signal at all scores 0', () => {
    expect(junkConfidence(base).score).toBe(0);
  });

  test('same input always produces the same score — deterministic, not fuzzy', () => {
    const input = { ...base, hasListUnsubscribe: true };
    const a = junkConfidence(input);
    const b = junkConfidence(input);
    expect(a.score).toBe(b.score);
  });
});

describe('classifyForTriage — buckets by confidence once no fast-path exclusion matched', () => {
  test('host spam flag -> trash', () => {
    const result = classifyForTriage({ ...base, hostSpamFlag: true });
    expect(result.verdict).toBe('trash');
    expect(result.confidence).toBeGreaterThanOrEqual(TRASH_THRESHOLD);
  });

  test('a known scam phrase -> trash', () => {
    const result = classifyForTriage({ ...base, subject: 'urgent payment required to avoid account suspension' });
    expect(result.verdict).toBe('trash');
  });

  test('bulk mail (List-Unsubscribe) with no prior contact -> quarantine, not trash', () => {
    const result = classifyForTriage({ ...base, hasListUnsubscribe: true });
    expect(result.verdict).toBe('quarantine');
    expect(result.confidence).toBeGreaterThanOrEqual(QUARANTINE_THRESHOLD);
    expect(result.confidence).toBeLessThan(TRASH_THRESHOLD);
  });
});

describe('classifyForTriage — ambiguous defaults to protected, never trashed or quarantined by accident', () => {
  test('a plain message with no signal either way is protected', () => {
    const result = classifyForTriage(base);
    expect(result.verdict).toBe('protected');
    expect(result.confidence).toBe(0);
  });

  test('protected is the honest default — it is never possible to reach trash or quarantine without a real signal', () => {
    const result = classifyForTriage({ ...base, subject: 'quick question about the schedule' });
    expect(result.verdict).toBe('protected');
  });
});
