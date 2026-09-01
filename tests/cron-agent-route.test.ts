import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { POST } from '@/app/api/cron/[agentId]/route';
import { realAgents } from '@/lib/agents/real';

// The generalized agent cron route: every real agent now gets a real
// scheduled trigger the same way Chief of Staff already did (see
// .github/workflows/*.yml) — GitHub Actions POSTs here on a schedule,
// bearer-gated by CRON_SECRET, exactly like the old single-agent
// app/api/cron/chief-of-staff/route.ts this replaces. Unlike that route,
// this one is parameterized by [agentId] and validates it against the real
// roster instead of only ever running one hardcoded agent.
describe('/api/cron/[agentId]', () => {
  const prevSecret = process.env.CRON_SECRET;
  const prevDb = process.env.FOUNDER_OS_DB;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    process.env.FOUNDER_OS_DB = ':memory:';
  });
  afterEach(() => {
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
  });

  const call = (agentId: string, secret: string | undefined) =>
    POST(
      new Request(`http://test/api/cron/${agentId}`, {
        method: 'POST',
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      }),
      { params: Promise.resolve({ agentId }) },
    );

  test('every real agent id in the roster is a valid target (nothing silently unscheduleable)', () => {
    // Documents the contract this route is built against: realAgents is the
    // single source of truth for which ids are dispatchable.
    expect(realAgents.length).toBeGreaterThan(0);
  });

  test('404s on an unknown agent id', async () => {
    const res = await call('not-a-real-agent', 'test-secret');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/unknown agent/i);
  });

  test('returns 501 with a setup hint when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await call('conductor', 'anything');
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/CRON_SECRET/);
  });

  test('rejects an unauthorized call with the wrong secret', async () => {
    const res = await call('conductor', 'wrong-secret');
    expect(res.status).toBe(401);
  });

  test('rejects a call with no Authorization header at all', async () => {
    const res = await call('conductor', undefined);
    expect(res.status).toBe(401);
  });

  test('a valid call dispatches to the requested agent and persists a run', async () => {
    const res = await call('conductor', 'test-secret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.agentId).toBe('conductor');
    expect(body.run.ok).toBe(true);
  });

  test('a valid call for chief-of-staff still works — this route replaces its old dedicated one', async () => {
    const res = await call('chief-of-staff', 'test-secret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.agentId).toBe('chief-of-staff');
  });

  test.each(realAgents.map((a) => a.id))('dispatches %s without throwing', async (agentId) => {
    const res = await call(agentId, 'test-secret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.agentId).toBe(agentId);
  });
});
