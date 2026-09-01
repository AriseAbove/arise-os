import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { GET, POST } from '@/app/api/funnel/[id]/milestone/route';
import { getDb } from '@/lib/data';
import type { FunnelContact } from '@/lib/schemas';

/**
 * The API route the "mark done" click on /funnel's MilestoneControl hits —
 * mirrors tests/funnel-stage-route.test.ts's structure for the sibling
 * write path.
 */
describe('/api/funnel/[id]/milestone', () => {
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
      status: 'active_project',
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

  const post = (id: string, milestoneId: unknown) =>
    POST(
      new Request(`http://test/api/funnel/${id}/milestone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneId }),
      }),
      { params: Promise.resolve({ id }) },
    );

  test('marks a milestone complete', async () => {
    seed('m-route-1');
    const res = await post('m-route-1', 'demo');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.milestone.milestoneId).toBe('demo');
    expect(body.notify).toBeDefined();
  });

  test('GET returns the completed milestones for a contact', async () => {
    seed('m-route-2');
    await post('m-route-2', 'demo');
    const res = await GET(new Request('http://test/api/funnel/m-route-2/milestone'), { params: Promise.resolve({ id: 'm-route-2' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completed).toHaveLength(1);
    expect(body.completed[0].milestoneId).toBe('demo');
  });

  test('404s for an unknown contact id', async () => {
    const res = await post('m-route-does-not-exist', 'demo');
    expect(res.status).toBe(404);
  });

  test('400s for an unknown milestone id', async () => {
    seed('m-route-3');
    const res = await post('m-route-3', 'not-a-real-trade');
    expect(res.status).toBe(400);
  });

  test('400s for a missing milestoneId field', async () => {
    seed('m-route-4');
    const res = await post('m-route-4', undefined);
    expect(res.status).toBe(400);
  });

  test('400s on invalid JSON', async () => {
    seed('m-route-5');
    const res = await POST(
      new Request('http://test/api/funnel/m-route-5/milestone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
      { params: Promise.resolve({ id: 'm-route-5' }) },
    );
    expect(res.status).toBe(400);
  });
});
