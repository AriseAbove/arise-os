import { describe, expect, test } from 'vitest';
import { classifyForTriage, type TriageInput } from '@/lib/mail-triage';

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

describe('classifyForTriage — exclusions always win', () => {
  test('a known contact is never junk, even with a spam flag set', () => {
    const result = classifyForTriage({
      ...base,
      fromAddress: 'client@aac-lead.com',
      hostSpamFlag: true,
      hasListUnsubscribe: true,
      knownSenders: new Set(['client@aac-lead.com']),
    });
    expect(result.verdict).toBe('not_junk');
    expect(result.reason).toMatch(/known contact/);
  });

  test('an existing thread reply is never junk', () => {
    const result = classifyForTriage({ ...base, isThreadReply: true, hostSpamFlag: true });
    expect(result.verdict).toBe('not_junk');
  });

  test('a starred message is never junk', () => {
    const result = classifyForTriage({ ...base, flagged: true, hasListUnsubscribe: true });
    expect(result.verdict).toBe('not_junk');
  });

  test('a message with an attachment is never junk', () => {
    const result = classifyForTriage({ ...base, hasAttachments: true, hostSpamFlag: true });
    expect(result.verdict).toBe('not_junk');
  });

  test('a client/project keyword in the subject is never junk', () => {
    const result = classifyForTriage({
      ...base,
      subject: 'Estimate for your 203k rehab',
      hasListUnsubscribe: true,
    });
    expect(result.verdict).toBe('not_junk');
    expect(result.reason).toMatch(/estimate|203k/);
  });
});

describe('classifyForTriage — junk signals, only once no exclusion matched', () => {
  test('host spam flag is junk', () => {
    expect(classifyForTriage({ ...base, hostSpamFlag: true }).verdict).toBe('junk');
  });

  test('a known scam phrase in the subject is junk', () => {
    const result = classifyForTriage({ ...base, subject: 'You have won a free prize, claim your prize now' });
    expect(result.verdict).toBe('junk');
  });

  test('bulk mail (List-Unsubscribe) with no prior contact is junk', () => {
    expect(classifyForTriage({ ...base, hasListUnsubscribe: true }).verdict).toBe('junk');
  });
});

describe('classifyForTriage — ambiguous defaults to review, never junk', () => {
  test('a plain message with no signal either way is review', () => {
    const result = classifyForTriage(base);
    expect(result.verdict).toBe('review');
  });

  test('review is the honest default — it is never possible to reach junk without a real signal', () => {
    // Sanity check on the rule ordering itself: sweeping every boolean flag
    // off and subject/from to something neutral must never fall through to
    // 'junk' by accident.
    const result = classifyForTriage({ ...base, subject: 'quick question about the schedule' });
    expect(result.verdict).not.toBe('junk');
  });
});
