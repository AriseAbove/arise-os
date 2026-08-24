import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { GET } from '@/app/api/push/relay/route';
import { getDb } from '@/lib/data';

// The push-relay endpoint behind ~/.aac_brain/push_relay.py on Sean's Mac
// (2026-08-24): Railway can't reach ntfy.sh directly, so Chief of Staff
// queues a failed push here (lib/db.ts's pushQueue repo) and the Mac poller
// GETs it and forwards it to ntfy itself. Gated by PUSH_RELAY_SECRET, same
// bearer pattern as VOICE_RELAY_SECRET (tests/voice-queue-route.test.ts).
describe('/api/push/relay', () => {
  const prevSecret = process.env.PUSH_RELAY_SECRET;
  const prevDb = process.env.FOUNDER_OS_DB;

  beforeEach(() => {
    process.env.PUSH_RELAY_SECRET = 'test-secret';
    process.env.FOUNDER_OS_DB = ':memory:';
  });
  afterEach(() => {
    if (prevSecret === undefined) delete process.env.PUSH_RELAY_SECRET;
    else process.env.PUSH_RELAY_SECRET = prevSecret;
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
  });

  const get = (secret = 'test-secret') =>
    GET(new Request('http://test/api/push/relay', { headers: { authorization: `Bearer ${secret}` } }));

  test('rejects an unauthorized GET', async () => {
    const res = await get('wrong');
    expect(res.status).toBe(401);
  });

  test('returns 501 with a setup hint when PUSH_RELAY_SECRET is not configured', async () => {
    delete process.env.PUSH_RELAY_SECRET;
    const res = await get('anything');
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/PUSH_RELAY_SECRET/);
  });

  test('a queued push comes back out on GET, then the queue is empty again', async () => {
    getDb().pushQueue.enqueue({
      id: 'p1',
      url: 'https://ntfy.sh/aac-cos',
      title: 'Chief of Staff',
      body: 'Hot lead ready to push',
      createdAt: new Date().toISOString(),
    });

    const first = await get();
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.item.url).toBe('https://ntfy.sh/aac-cos');
    expect(firstBody.item.title).toBe('Chief of Staff');
    expect(firstBody.item.body).toBe('Hot lead ready to push');

    const second = await get();
    const secondBody = await second.json();
    expect(secondBody.item).toBeNull();
  });
});
