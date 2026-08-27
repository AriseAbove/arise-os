import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { completeMilestone, AAC_PROJECT_MILESTONES, milestoneDef } from '@/lib/project-milestones';
import type { FunnelContact } from '@/lib/schemas';

/**
 * Construction-phase milestones — the trade-sequence half of the client
 * tracker (2026-08-27). completeMilestone mirrors advanceStage's
 * validate-then-write shape on purpose; these tests mirror
 * tests/funnel-stage.test.ts's structure for the same reason.
 */

let db: FounderDb;
afterEach(() => db?.close());

const NOW = new Date('2026-08-27T12:00:00Z');

function seedContact(over: Partial<FunnelContact> = {}): FunnelContact {
  const contact: FunnelContact = {
    id: 'fc-1',
    name: 'Jane Doe',
    business: 'aac',
    status: 'active_project',
    product: 'Kitchen remodel',
    amountUsd: 30000,
    costUsd: null,
    relationship: 'warm',
    likelihood: 90,
    url: null,
    email: 'jane@example.com',
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

describe('AAC_PROJECT_MILESTONES', () => {
  test('the real 14-week trade sequence from the aac-senior-pm skill, in order', () => {
    expect(AAC_PROJECT_MILESTONES.map((m) => m.id)).toEqual([
      'demo',
      'rough_plumbing',
      'rough_electrical',
      'hvac_rough',
      'insulation',
      'drywall',
      'paint',
      'cabinets',
      'tile',
      'countertops',
      'trim',
      'finish_electrical_plumbing',
      'flooring',
      'final_punch',
    ]);
    expect(AAC_PROJECT_MILESTONES).toHaveLength(14);
    // order field matches position, 1-indexed
    AAC_PROJECT_MILESTONES.forEach((m, i) => expect(m.order).toBe(i + 1));
  });

  test('milestoneDef resolves a known id and returns null for an unknown one', () => {
    expect(milestoneDef('drywall')?.label).toBe('Drywall');
    expect(milestoneDef('not-a-real-trade')).toBeNull();
  });
});

describe('completeMilestone', () => {
  test('marks a milestone complete and it shows up in forContact', () => {
    db = openDb(':memory:');
    seedContact();
    const result = completeMilestone(db, 'fc-1', 'demo', NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.milestone).toMatchObject({ contactId: 'fc-1', milestoneId: 'demo', label: 'Demo', completedAt: '2026-08-27' });

    const stored = db.projectMilestones.forContact('fc-1');
    expect(stored).toHaveLength(1);
    expect(stored[0].milestoneId).toBe('demo');
  });

  test('is idempotent by (contactId, milestoneId) — a second call updates rather than duplicates', () => {
    db = openDb(':memory:');
    seedContact();
    completeMilestone(db, 'fc-1', 'demo', new Date('2026-08-20T12:00:00Z'));
    completeMilestone(db, 'fc-1', 'demo', new Date('2026-08-22T12:00:00Z'));
    const stored = db.projectMilestones.forContact('fc-1');
    expect(stored).toHaveLength(1);
    expect(stored[0].completedAt).toBe('2026-08-22');
  });

  test('multiple milestones for one contact all persist', () => {
    db = openDb(':memory:');
    seedContact();
    completeMilestone(db, 'fc-1', 'demo', NOW);
    completeMilestone(db, 'fc-1', 'rough_plumbing', NOW);
    expect(db.projectMilestones.forContact('fc-1')).toHaveLength(2);
  });

  test('rejects an unknown contact id', () => {
    db = openDb(':memory:');
    const result = completeMilestone(db, 'does-not-exist', 'demo', NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.status).toBe(404);
  });

  test('rejects an unknown milestone id', () => {
    db = openDb(':memory:');
    seedContact();
    const result = completeMilestone(db, 'fc-1', 'not-a-real-trade', NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.status).toBe(400);
  });

  test('milestones for different contacts stay isolated', () => {
    db = openDb(':memory:');
    seedContact({ id: 'fc-1' });
    seedContact({ id: 'fc-2' });
    completeMilestone(db, 'fc-1', 'demo', NOW);
    expect(db.projectMilestones.forContact('fc-1')).toHaveLength(1);
    expect(db.projectMilestones.forContact('fc-2')).toHaveLength(0);
  });
});
