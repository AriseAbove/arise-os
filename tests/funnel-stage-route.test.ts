import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { POST } from '@/app/api/funnel/[id]/stage/route';
import { getDb } from '@/lib/data';
import type { FunnelContact } from '@/lib/schemas';

/**
 * The API route Sean's "move to stage" click on /funnel actually hits.
 * getDb() is a module-level singleton keyed off FOUNDER_OS_DB, so each test
 * uses a distinct contact id rather than resetting the whole db.
 */
describe('/api/funnel/[id]/stage', () => {
  const prevDb = process.env.FOUNDER_OS_DB;
  beforeEach(() => {
    process.env.FOUNDER_OS_DB = ':memory:';
  });
  afterEach(() => {
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
  });

  function seed(id: string, over: Partial<FunnelContact> = {}) {
    const contact: FunnelContact = {
      id,
      name: 'Route Test Lead',
      business: 'aac',
      status: 'inquiry',
      product: null,
      amountUsd: null,
      costUsd: null,
      relationship: 'warm',
      likelihood: 50,
      url: null,
      email: null,
      phone: null,
      person: null,
      company: null,
      role: null,
      linkedin: null,
      createdAt: '2026-08-01',
      ...over,
    };
    getDb().funnel.insertContact(contact);
  }

  const post = (id: string, stage: unknown) =>
    POST(
      new Request(`http://test/api/funnel/${id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      }),
      { params: Promise.resolve({ id }) },
    );

  test('moves a lead to a new stage', async () => {
    seed('route-1');
    const res = await post('route-1', 'follow_up');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.journey.status).toBe('follow_up');
  });

  test('404s for an unknown lead id', async () => {
    const res = await post('route-does-not-exist', 'follow_up');
    expect(res.status).toBe(404);
  });

  test('400s for an unknown stage value', async () => {
    seed('route-2');
    const res = await post('route-2', 'not_a_real_stage');
    expect(res.status).toBe(400);
  });

  test('400s for a missing stage field', async () => {
    seed('route-3');
    const res = await post('route-3', undefined);
    expect(res.status).toBe(400);
  });

  test('400s on invalid JSON', async () => {
    seed('route-4');
    const res = await POST(
      new Request('http://test/api/funnel/route-4/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
      { params: Promise.resolve({ id: 'route-4' }) },
    );
    expect(res.status).toBe(400);
  });
});
