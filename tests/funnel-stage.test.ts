import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { advanceStage } from '@/lib/funnel-stage';
import { funnelSummary } from '@/lib/funnel';
import type { FunnelContact } from '@/lib/schemas';

/**
 * Stage moves are Sean's decision, never automatic (CLAUDE.md: "a call
 * never moves a journey's stage"). advanceStage is the one place allowed to
 * change `status` — the Allo/website importers deliberately never touch it.
 */

let db: FounderDb;
afterEach(() => db?.close());

const NOW = new Date('2026-08-21T12:00:00Z');

function seedContact(over: Partial<FunnelContact> = {}): FunnelContact {
  const contact: FunnelContact = {
    id: 'fc-1',
    name: 'Jane Doe',
    business: 'aac',
    status: 'inquiry',
    product: null,
    amountUsd: null,
    costUsd: null,
    relationship: 'warm',
    likelihood: 50,
    url: null,
    email: null,
    phone: '(248) 555-1234',
    person: 'Jane Doe',
    company: null,
    role: null,
    linkedin: null,
    createdAt: '2026-08-01',
    ...over,
  };
  db.funnel.insertContact(contact);
  return contact;
}

describe('advanceStage', () => {
  test('moves a journey to a new stage and records it as a touch', () => {
    db = openDb(':memory:');
    seedContact();
    const result = advanceStage(db, 'fc-1', 'follow_up', NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.journey.status).toBe('follow_up');
    expect(result.journey.touches).toHaveLength(1);
    expect(result.journey.touches[0]).toMatchObject({
      stage: 'follow_up',
      channel: 'crm',
      source: 'manual',
      at: '2026-08-21',
    });
  });

  test('the touch preserves prior touch history and increments seq', () => {
    db = openDb(':memory:');
    seedContact();
    db.funnel.insertTouch({
      id: 't-1',
      contactId: 'fc-1',
      seq: 1,
      stage: 'inquiry',
      channel: 'call',
      label: 'Inbound call',
      source: 'allo',
      at: '2026-08-05',
      durationSeconds: 120,
    });
    const result = advanceStage(db, 'fc-1', 'follow_up', NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.journey.touches.map((t) => t.seq)).toEqual([1, 2]);
  });

  test('rejects an unknown lead id', () => {
    db = openDb(':memory:');
    const result = advanceStage(db, 'does-not-exist', 'follow_up', NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.status).toBe(404);
  });

  test('rejects a stage outside the journey business pipeline', () => {
    db = openDb(':memory:');
    seedContact({ business: 'aac' });
    const result = advanceStage(db, 'fc-1', 'subscribed', NOW); // an Apps-only stage
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.status).toBe(400);
  });

  test('rejects moving to the same stage the lead is already at (a no-op is not a decision)', () => {
    db = openDb(':memory:');
    seedContact({ status: 'follow_up' });
    const result = advanceStage(db, 'fc-1', 'follow_up', NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.status).toBe(400);
  });

  test('an Apps journey validates against the Apps pipeline, not AAC', () => {
    db = openDb(':memory:');
    seedContact({ business: 'apps', status: 'discovered' });
    const result = advanceStage(db, 'fc-1', 'installed', NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.journey.status).toBe('installed');
  });

  test('funnelSummary reflects a stage move immediately — the WON count/dollar figure is not stuck at 0', () => {
    db = openDb(':memory:');
    seedContact({ id: 'fc-1', amountUsd: 12000, product: 'Kitchen remodel' });
    seedContact({ id: 'fc-2', amountUsd: 8000 });

    const before = funnelSummary(db.funnel.journeys('aac'));
    expect(before.converted).toBe(0);
    expect(before.revenueUsd).toBe(0);

    advanceStage(db, 'fc-1', 'follow_up', NOW);
    advanceStage(db, 'fc-1', 'walkthrough_scheduled', NOW);
    advanceStage(db, 'fc-1', 'estimate_sent', NOW);
    advanceStage(db, 'fc-1', 'negotiation', NOW);
    advanceStage(db, 'fc-1', 'contract_signed', NOW);

    const after = funnelSummary(db.funnel.journeys('aac'));
    expect(after.converted).toBe(1);
    expect(after.clients).toBe(2);
    expect(after.revenueUsd).toBe(12000); // fc-2 is still just an inquiry — not counted
  });

  test('allows moving backward too — correcting a mistake is still an explicit human decision', () => {
    db = openDb(':memory:');
    seedContact({ status: 'estimate_sent' });
    const result = advanceStage(db, 'fc-1', 'follow_up', NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.journey.status).toBe('follow_up');
  });
});
