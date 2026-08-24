import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { upsertFunnelCard, type FunnelCardInput } from '@/lib/funnel-card';

let db: FounderDb;
afterEach(() => db?.close());

const NOW = new Date('2026-08-24T12:00:00Z');

function freshDb(): FounderDb {
  const d = openDb(':memory:');
  seedDatabase(d);
  return d;
}

function card(overrides: Partial<FunnelCardInput> = {}): FunnelCardInput {
  return {
    business: 'aac',
    name: 'Kim Childers',
    phone: '313-689-5813',
    email: null,
    stage: 'estimate_sent',
    product: 'Garage extension + full re-roof — Option A $14,586 / Option B $15,941',
    amountUsd: null,
    costUsd: null,
    touchLabel: 'Estimate sent: garage extension + full re-roof, 2 options',
    touchChannel: 'document',
    ...overrides,
  };
}

describe('upsertFunnelCard', () => {
  test('creates a new journey with one touch at the given stage', () => {
    db = freshDb();
    const { journey, created } = upsertFunnelCard(db, card(), NOW);
    expect(created).toBe(true);
    expect(journey.name).toBe('Kim Childers');
    expect(journey.business).toBe('aac');
    expect(journey.status).toBe('estimate_sent');
    expect(journey.phone).toBe('313-689-5813');
    expect(journey.touches).toHaveLength(1);
    expect(journey.touches[0]).toMatchObject({
      stage: 'estimate_sent',
      channel: 'document',
      source: 'claude',
      at: '2026-08-24',
    });
  });

  test('a second call for the same phone updates the existing journey instead of duplicating it', () => {
    db = freshDb();
    upsertFunnelCard(db, card(), NOW);
    const { journey, created } = upsertFunnelCard(
      db,
      card({ stage: 'contract_signed', amountUsd: 14586, touchLabel: 'Contract signed: Option A', at: '2026-08-30' }),
      NOW,
    );
    expect(created).toBe(false);
    expect(journey.status).toBe('contract_signed');
    expect(journey.amountUsd).toBe(14586);
    expect(journey.touches).toHaveLength(2);
    expect(db.funnel.journeys('aac')).toHaveLength(1);
  });

  test('cost and amount both persist, independently, for margin math downstream', () => {
    db = freshDb();
    const { journey } = upsertFunnelCard(
      db,
      card({ stage: 'complete_paid', amountUsd: 15941, costUsd: 9800, touchLabel: 'Final payment received' }),
      NOW,
    );
    expect(journey.amountUsd).toBe(15941);
    expect(journey.costUsd).toBe(9800);
  });

  test('falls back to a name+business key when neither phone nor email is known, without crashing', () => {
    db = freshDb();
    const { journey, created } = upsertFunnelCard(
      db,
      card({ phone: null, email: null, name: 'No Contact Info Yet' }),
      NOW,
    );
    expect(created).toBe(true);
    expect(journey.phone).toBeNull();
    expect(journey.email).toBeNull();
  });

  test('an email-only match still merges onto the same journey', () => {
    db = freshDb();
    upsertFunnelCard(db, card({ phone: null, email: 'titanahampton@gmail.com' }), NOW);
    const { created, journey } = upsertFunnelCard(
      db,
      card({ phone: null, email: 'titanahampton@gmail.com', stage: 'active_project', touchLabel: 'Change order approved' }),
      NOW,
    );
    expect(created).toBe(false);
    expect(journey.touches).toHaveLength(2);
  });
});
