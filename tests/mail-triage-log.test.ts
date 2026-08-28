import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';

// Gmail Worker's junk-triage audit trail (2026-08-28) — append-only, so
// Sean can read exactly what a run decided (dry_run or live) without
// trusting a one-line agent-run summary. See lib/mail-triage.ts for the
// classifier and lib/connectors/email-triage.ts for the runner that writes
// these rows.
let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('mailTriageLog', () => {
  test('recent() returns nothing before any insert', () => {
    db = openDb(':memory:');
    expect(db.mailTriageLog.recent(10)).toEqual([]);
  });

  test('insert then recent() round-trips every field, newest first', () => {
    db = openDb(':memory:');
    db.mailTriageLog.insert({
      id: 'inbox-1-101-t1',
      inboxId: 'inbox-1',
      inboxName: 'AAC',
      uid: 101,
      fromAddress: 'spam@example.com',
      subject: 'Buy now',
      verdict: 'junk',
      reason: 'bulk sender (List-Unsubscribe) with no prior contact',
      moved: true,
      mode: 'live',
      createdAt: '2026-08-28T00:00:00.000Z',
    });
    db.mailTriageLog.insert({
      id: 'inbox-1-102-t2',
      inboxId: 'inbox-1',
      inboxName: 'AAC',
      uid: 102,
      fromAddress: 'lead@known.com',
      subject: 'Re: estimate',
      verdict: 'not_junk',
      reason: 'sender is a known contact',
      moved: false,
      mode: 'live',
      createdAt: '2026-08-28T00:00:01.000Z',
    });

    const rows = db.mailTriageLog.recent(10);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('inbox-1-102-t2'); // newest first
    expect(rows[0].moved).toBe(false);
    expect(rows[1].verdict).toBe('junk');
    expect(rows[1].moved).toBe(true);
  });

  test('recent() honors the limit', () => {
    db = openDb(':memory:');
    for (let i = 0; i < 5; i++) {
      db.mailTriageLog.insert({
        id: `row-${i}`,
        inboxId: 'inbox-1',
        inboxName: 'AAC',
        uid: i,
        fromAddress: 'x@example.com',
        subject: 'x',
        verdict: 'review',
        reason: 'no exclusion and no confident junk signal — needs a human look',
        moved: false,
        mode: 'dry_run',
        createdAt: `2026-08-28T00:00:0${i}.000Z`,
      });
    }
    expect(db.mailTriageLog.recent(2)).toHaveLength(2);
  });
});
