import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';

// Gmail Worker's junk-triage audit trail (2026-08-28, rewritten same day to
// the "Zero-Scan, High-Confidence Quarantine" model) — append-only, so Sean
// can read exactly what a run decided (dry_run or live) without trusting a
// one-line agent-run summary. See lib/mail-triage.ts for the classifier and
// lib/connectors/email-triage.ts for the runner that writes these rows, plus
// runs the 14-day quarantine-expiry sweep that calls dueForPurge/markPurged
// below.
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
      verdict: 'trash',
      confidence: 97,
      reason: 'host spam flag',
      moved: true,
      mode: 'live',
      messageId: '<abc-101@example.com>',
      purgedAt: null,
      createdAt: '2026-08-28T00:00:00.000Z',
    });
    db.mailTriageLog.insert({
      id: 'inbox-1-102-t2',
      inboxId: 'inbox-1',
      inboxName: 'AAC',
      uid: 102,
      fromAddress: 'lead@known.com',
      subject: 'Re: estimate',
      verdict: 'protected',
      confidence: 0,
      reason: 'sender is a known contact',
      moved: false,
      mode: 'live',
      messageId: '<abc-102@example.com>',
      purgedAt: null,
      createdAt: '2026-08-28T00:00:01.000Z',
    });

    const rows = db.mailTriageLog.recent(10);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('inbox-1-102-t2'); // newest first
    expect(rows[0].moved).toBe(false);
    expect(rows[0].confidence).toBe(0);
    expect(rows[0].messageId).toBe('<abc-102@example.com>');
    expect(rows[1].verdict).toBe('trash');
    expect(rows[1].confidence).toBe(97);
    expect(rows[1].moved).toBe(true);
    expect(rows[1].purgedAt).toBeNull();
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
        verdict: 'protected',
        confidence: 0,
        reason: 'no fast-path match and no confident junk signal',
        moved: false,
        mode: 'dry_run',
        messageId: null,
        purgedAt: null,
        createdAt: `2026-08-28T00:00:0${i}.000Z`,
      });
    }
    expect(db.mailTriageLog.recent(2)).toHaveLength(2);
  });

  test('a row with no messageId round-trips as null, not undefined or a crash', () => {
    db = openDb(':memory:');
    db.mailTriageLog.insert({
      id: 'row-no-msgid',
      inboxId: 'inbox-1',
      inboxName: 'AAC',
      uid: 1,
      fromAddress: 'x@example.com',
      subject: 'x',
      verdict: 'quarantine',
      confidence: 75,
      reason: 'bulk sender (List-Unsubscribe), no prior contact',
      moved: true,
      mode: 'live',
      messageId: null,
      purgedAt: null,
      createdAt: '2026-08-28T00:00:00.000Z',
    });
    expect(db.mailTriageLog.recent(1)[0].messageId).toBeNull();
  });
});

describe('mailTriageLog.dueForPurge — the 14-day quarantine expiry sweep query', () => {
  function insertQuarantineRow(
    db: FounderDb,
    overrides: Partial<Parameters<FounderDb['mailTriageLog']['insert']>[0]>,
  ): void {
    db.mailTriageLog.insert({
      id: 'row',
      inboxId: 'inbox-1',
      inboxName: 'AAC',
      uid: 1,
      fromAddress: 'bulk@example.com',
      subject: 'Newsletter',
      verdict: 'quarantine',
      confidence: 75,
      reason: 'bulk sender (List-Unsubscribe), no prior contact',
      moved: true,
      mode: 'live',
      messageId: '<msg@example.com>',
      purgedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      ...overrides,
    });
  }

  test('a quarantined-and-moved row older than the cutoff is due', () => {
    db = openDb(':memory:');
    insertQuarantineRow(db, { id: 'due-1', createdAt: '2026-08-01T00:00:00.000Z' });
    const due = db.mailTriageLog.dueForPurge('inbox-1', '2026-08-15T00:00:00.000Z', 50);
    expect(due.map((r) => r.id)).toEqual(['due-1']);
  });

  test('a row not yet past the cutoff is not due', () => {
    db = openDb(':memory:');
    insertQuarantineRow(db, { id: 'too-new', createdAt: '2026-08-20T00:00:00.000Z' });
    const due = db.mailTriageLog.dueForPurge('inbox-1', '2026-08-15T00:00:00.000Z', 50);
    expect(due).toEqual([]);
  });

  test('a trash-verdict row is never returned, even if old', () => {
    db = openDb(':memory:');
    insertQuarantineRow(db, { id: 'trash-row', verdict: 'trash', createdAt: '2026-08-01T00:00:00.000Z' });
    const due = db.mailTriageLog.dueForPurge('inbox-1', '2026-08-15T00:00:00.000Z', 50);
    expect(due).toEqual([]);
  });

  test('a quarantine row that never actually moved (moved: false) is never returned', () => {
    db = openDb(':memory:');
    insertQuarantineRow(db, { id: 'unmoved', moved: false, createdAt: '2026-08-01T00:00:00.000Z' });
    const due = db.mailTriageLog.dueForPurge('inbox-1', '2026-08-15T00:00:00.000Z', 50);
    expect(due).toEqual([]);
  });

  test('an already-purged row is never returned again', () => {
    db = openDb(':memory:');
    insertQuarantineRow(db, { id: 'already-purged', purgedAt: '2026-08-10T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' });
    const due = db.mailTriageLog.dueForPurge('inbox-1', '2026-08-15T00:00:00.000Z', 50);
    expect(due).toEqual([]);
  });

  test('scoped to the given inbox only', () => {
    db = openDb(':memory:');
    insertQuarantineRow(db, { id: 'other-inbox', inboxId: 'inbox-2', createdAt: '2026-08-01T00:00:00.000Z' });
    const due = db.mailTriageLog.dueForPurge('inbox-1', '2026-08-15T00:00:00.000Z', 50);
    expect(due).toEqual([]);
  });

  test('oldest first, and honors the limit', () => {
    db = openDb(':memory:');
    insertQuarantineRow(db, { id: 'newer', createdAt: '2026-08-05T00:00:00.000Z' });
    insertQuarantineRow(db, { id: 'oldest', createdAt: '2026-08-01T00:00:00.000Z' });
    insertQuarantineRow(db, { id: 'newest-of-the-due', createdAt: '2026-08-08T00:00:00.000Z' });
    const due = db.mailTriageLog.dueForPurge('inbox-1', '2026-08-15T00:00:00.000Z', 2);
    expect(due.map((r) => r.id)).toEqual(['oldest', 'newer']);
  });
});

describe('mailTriageLog.markPurged', () => {
  test('sets purgedAt on the row, leaving everything else untouched', () => {
    db = openDb(':memory:');
    db.mailTriageLog.insert({
      id: 'row-1',
      inboxId: 'inbox-1',
      inboxName: 'AAC',
      uid: 1,
      fromAddress: 'bulk@example.com',
      subject: 'Newsletter',
      verdict: 'quarantine',
      confidence: 75,
      reason: 'bulk sender (List-Unsubscribe), no prior contact',
      moved: true,
      mode: 'live',
      messageId: '<msg@example.com>',
      purgedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
    });

    db.mailTriageLog.markPurged('row-1', '2026-08-15T00:00:00.000Z');

    const row = db.mailTriageLog.recent(1)[0];
    expect(row.purgedAt).toBe('2026-08-15T00:00:00.000Z');
    expect(row.verdict).toBe('quarantine');
    expect(row.moved).toBe(true);
  });

  test('is idempotent — a row already marked purged is never overwritten', () => {
    db = openDb(':memory:');
    db.mailTriageLog.insert({
      id: 'row-1',
      inboxId: 'inbox-1',
      inboxName: 'AAC',
      uid: 1,
      fromAddress: 'bulk@example.com',
      subject: 'Newsletter',
      verdict: 'quarantine',
      confidence: 75,
      reason: 'bulk sender (List-Unsubscribe), no prior contact',
      moved: true,
      mode: 'live',
      messageId: '<msg@example.com>',
      purgedAt: '2026-08-15T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    });

    db.mailTriageLog.markPurged('row-1', '2026-08-20T00:00:00.000Z');

    expect(db.mailTriageLog.recent(1)[0].purgedAt).toBe('2026-08-15T00:00:00.000Z');
  });

  test('marking an unknown id is a safe no-op', () => {
    db = openDb(':memory:');
    expect(() => db.mailTriageLog.markPurged('does-not-exist', '2026-08-15T00:00:00.000Z')).not.toThrow();
  });
});
