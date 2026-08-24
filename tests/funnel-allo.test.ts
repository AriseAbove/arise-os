import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { importAlloCalls, normalizePhoneKey, looksLikeSpam } from '@/lib/funnel-allo';
import type { AlloCall } from '@/lib/connectors/allo';

let db: FounderDb;
afterEach(() => db?.close());

const NOW = new Date('2026-08-13T12:00:00Z');

function call(overrides: Partial<AlloCall>): AlloCall {
  return {
    id: 'call-1',
    from: '+12485551234',
    to: '+12487171417',
    direction: 'inbound',
    result: 'answered',
    summary: 'Kitchen remodel inquiry, Southfield. Wants a walk-through.',
    contactName: null,
    durationSeconds: 180,
    startedAt: '2026-08-12T14:03:00Z',
    recordingUrl: null,
    ...overrides,
  };
}

function freshDb(): FounderDb {
  const d = openDb(':memory:');
  seedDatabase(d);
  return d;
}

describe('normalizePhoneKey', () => {
  test('strips formatting and the US country code', () => {
    expect(normalizePhoneKey('+1 (248) 555-1234')).toBe('2485551234');
    expect(normalizePhoneKey('2485551234')).toBe('2485551234');
    expect(normalizePhoneKey('12485551234')).toBe('2485551234');
  });
  test('returns null for unusable values', () => {
    expect(normalizePhoneKey(null)).toBeNull();
    expect(normalizePhoneKey('anonymous')).toBeNull();
  });
});

describe('looksLikeSpam — Zoey already kills spam; the importer keeps the rest out', () => {
  test('spam/blocked results are spam', () => {
    expect(looksLikeSpam(call({ result: 'spam' }))).toBe(true);
    expect(looksLikeSpam(call({ result: 'Blocked' }))).toBe(true);
  });
  test('instant hangups with no summary are spam', () => {
    expect(looksLikeSpam(call({ durationSeconds: 4, summary: null }))).toBe(true);
  });
  test('a real inquiry is not spam', () => {
    expect(looksLikeSpam(call({}))).toBe(false);
  });
  test('a short call WITH a summary is kept — Zoey collects fast', () => {
    expect(looksLikeSpam(call({ durationSeconds: 12 }))).toBe(false);
  });
});

describe('importAlloCalls', () => {
  test('a new caller becomes an AAC journey at inquiry with a call touch', () => {
    db = freshDb();
    const res = importAlloCalls(db, [call({})], NOW);
    expect(res.newContacts).toBe(1);

    const [j] = db.funnel.journeys('aac');
    expect(j.status).toBe('inquiry');
    expect(j.business).toBe('aac');
    expect(j.phone).toBe('+12485551234');
    expect(j.name).toBe('(248) 555-1234'); // no contact name → formatted number
    expect(j.touches).toHaveLength(1);
    expect(j.touches[0]).toMatchObject({
      channel: 'call',
      source: 'allo',
      stage: 'inquiry',
      at: '2026-08-12',
    });
    expect(j.touches[0].label).toContain('Kitchen remodel');
  });

  test('uses the Allo contact name when present', () => {
    db = freshDb();
    importAlloCalls(db, [call({ contactName: 'Jane Doe' })], NOW);
    expect(db.funnel.journeys('aac')[0].name).toBe('Jane Doe');
  });

  test('a repeat call from the same number adds a touch, not a duplicate journey', () => {
    db = freshDb();
    importAlloCalls(db, [call({})], NOW);
    const res = importAlloCalls(
      db,
      [call({ id: 'call-2', startedAt: '2026-08-13T09:00:00Z', summary: 'Called back about timing.' })],
      NOW,
    );
    expect(res.newContacts).toBe(0);
    expect(res.newTouches).toBe(1);
    const journeys = db.funnel.journeys('aac');
    expect(journeys).toHaveLength(1);
    expect(journeys[0].touches.map((t) => t.seq)).toEqual([1, 2]);
  });

  test('re-syncing the same call id is a no-op — idempotent by call id', () => {
    db = freshDb();
    importAlloCalls(db, [call({})], NOW);
    const res = importAlloCalls(db, [call({})], NOW);
    expect(res.newContacts).toBe(0);
    expect(res.newTouches).toBe(0);
    expect(db.funnel.journeys('aac')[0].touches).toHaveLength(1);
  });

  test('a repeat call never regresses the journey stage', () => {
    db = freshDb();
    importAlloCalls(db, [call({})], NOW);
    const { touches: _touches, ...contact } = db.funnel.journeys('aac')[0];
    db.funnel.insertContact({ ...contact, status: 'estimate_sent' });
    importAlloCalls(db, [call({ id: 'call-3', summary: 'Question about the estimate.' })], NOW);
    const after = db.funnel.journeys('aac')[0];
    expect(after.status).toBe('estimate_sent');
    expect(after.touches.at(-1)?.stage).toBe('estimate_sent');
  });

  test('skips spam, outbound legs, and callers with no number', () => {
    db = freshDb();
    const res = importAlloCalls(
      db,
      [
        call({ id: 's1', result: 'spam' }),
        call({ id: 's2', direction: 'outbound' }),
        call({ id: 's3', from: null }),
      ],
      NOW,
    );
    expect(res.newContacts).toBe(0);
    expect(res.skipped).toBe(3);
    expect(db.funnel.journeys('aac')).toHaveLength(0);
  });

  test('falls back to the sync date when the call has no timestamp', () => {
    db = freshDb();
    importAlloCalls(db, [call({ startedAt: null })], NOW);
    expect(db.funnel.journeys('aac')[0].touches[0].at).toBe('2026-08-13');
  });

  test('call duration is captured onto the touch, not discarded', () => {
    db = freshDb();
    importAlloCalls(db, [call({ durationSeconds: 214 })], NOW);
    expect(db.funnel.journeys('aac')[0].touches[0].durationSeconds).toBe(214);
  });

  describe('lead score is real and differentiated, not a flat "Warm/50%" for every lead', () => {
    test('a wrong-number/robocall pattern (30+ short calls) scores cold, not the flat default', () => {
      db = freshDb();
      for (let i = 0; i < 32; i++) {
        importAlloCalls(
          db,
          [call({ id: `spam-call-${i}`, durationSeconds: 4, summary: 'no answer' })],
          NOW,
        );
      }
      const [j] = db.funnel.journeys('aac');
      expect(j.touches).toHaveLength(32);
      expect(j.relationship).toBe('cold');
      expect(j.likelihood).toBeLessThan(20);
    });

    test('a single, real, qualified inquiry scores above the flat default', () => {
      db = freshDb();
      importAlloCalls(db, [call({ durationSeconds: 180 })], NOW);
      const [j] = db.funnel.journeys('aac');
      expect(j.relationship).toBe('warm');
      expect(j.likelihood).toBeGreaterThan(50);
    });

    test('a genuine repeat caller with real conversations scores hot', () => {
      db = freshDb();
      importAlloCalls(db, [call({ id: 'real-1', durationSeconds: 240 })], NOW);
      importAlloCalls(db, [call({ id: 'real-2', durationSeconds: 190, summary: 'Following up on the estimate' })], NOW);
      const [j] = db.funnel.journeys('aac');
      expect(j.relationship).toBe('hot');
      expect(j.likelihood).toBeGreaterThanOrEqual(70);
    });

    test('a lead with no new calls this sync still gets rescored on a later sync (backfill for pre-fix leads)', () => {
      // Simulates a lead imported before durationSeconds existed: the touch
      // predates the fix and carries no duration, but there are enough of
      // them that a later sync (even one importing an unrelated call)
      // should still catch the repeat-caller pattern.
      db = freshDb();
      db.funnel.insertContact({
        id: 'allo-2485559999',
        name: '(248) 555-9999',
        business: 'aac',
        status: 'inquiry',
        product: null,
        amountUsd: null,
        costUsd: null,
        relationship: 'warm',
        likelihood: 50,
        url: null,
        email: null,
        phone: '(248) 555-9999',
        person: null,
        company: null,
        role: null,
        linkedin: null,
        createdAt: '2026-07-01',
      });
      for (let i = 0; i < 16; i++) {
        db.funnel.insertTouch({
          id: `legacy-${i}`,
          contactId: 'allo-2485559999',
          seq: i + 1,
          stage: 'inquiry',
          channel: 'call',
          label: 'legacy call, no duration on record',
          source: 'allo',
          at: '2026-07-01',
          durationSeconds: null,
        });
      }

      importAlloCalls(db, [call({ id: 'unrelated', from: '+12485550001' })], NOW);

      const legacy = db.funnel.journeys('aac').find((j) => j.id === 'allo-2485559999')!;
      expect(legacy.relationship).toBe('cold');
    });
  });
});
