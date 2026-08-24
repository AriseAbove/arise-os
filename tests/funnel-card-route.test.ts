import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { POST } from '@/app/api/funnel/card/route';

/**
 * The API route a Claude/Cowork session calls after producing an estimate,
 * proposal, or change order — see lib/funnel-card.ts's header comment.
 * getDb() is a module-level singleton keyed off FOUNDER_OS_DB, matching
 * tests/funnel-stage-route.test.ts's convention.
 */
describe('/api/funnel/card', () => {
  const prevDb = process.env.FOUNDER_OS_DB;
  beforeEach(() => {
    process.env.FOUNDER_OS_DB = ':memory:';
  });
  afterEach(() => {
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
  });

  function req(body: unknown): Request {
    return new Request('http://localhost/api/funnel/card', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  test('creates a card from a minimal valid body', async () => {
    const res = await POST(
      req({
        business: 'aac',
        name: 'Kim Childers',
        phone: '313-689-5813',
        stage: 'estimate_sent',
        product: 'Garage extension',
        touchLabel: 'Estimate sent',
        touchChannel: 'document',
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.created).toBe(true);
    expect(json.journey.status).toBe('estimate_sent');
  });

  test('rejects a body missing a required field', async () => {
    const res = await POST(req({ business: 'aac', name: 'No Stage' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test('rejects invalid JSON', async () => {
    const res = await POST(new Request('http://localhost/api/funnel/card', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
