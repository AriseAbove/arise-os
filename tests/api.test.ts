import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Route handlers read the DB path from FOUNDER_OS_DB at first access, so the
// env var must be set before any handler module is imported. FUNNEL_PROVIDER
// pins /api/funnel to the seeded set — tests never hit the live Attio API.
beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-test-')), 'test.db');
  process.env.FUNNEL_PROVIDER = 'seed';
  process.env.GBRAIN_BIN = path.join(tmpdir(), 'founder-os-no-gbrain-cli');
});

describe('API route handlers', () => {
  test('GET /api/agents returns seeded agents grouped with their department', async () => {
    const { GET } = await import('@/app/api/agents/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents.length).toBeGreaterThanOrEqual(5);
    expect(body.agents[0]).toHaveProperty('name');
    expect(body.agents[0]).toHaveProperty('departmentId');
  });

  test('GET /api/departments returns ordered departments', async () => {
    const { GET } = await import('@/app/api/departments/route');
    const res = await GET();
    const body = await res.json();
    expect(body.departments.length).toBeGreaterThanOrEqual(4);
    const orders = body.departments.map((d: { order: number }) => d.order);
    expect([...orders].sort((a: number, b: number) => a - b)).toEqual(orders);
  });

  test('GET /api/tools returns the integrations grid', async () => {
    const { GET } = await import('@/app/api/tools/route');
    const res = await GET();
    const body = await res.json();
    expect(body.tools.length).toBeGreaterThanOrEqual(5);
  });

  test('POST /api/agents/[id]/run executes a real agent and persists the run', async () => {
    const { POST } = await import('@/app/api/agents/[id]/run/route');
    const res = await POST(new Request('http://localhost/api/agents/data-agent/run', { method: 'POST' }), {
      params: Promise.resolve({ id: 'data-agent' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.agentId).toBe('data-agent');
    expect(typeof body.run.ok).toBe('boolean');
    expect(body.run.summary.length).toBeGreaterThan(0);
  });

  test('GET /api/roadmap returns items grouped by quarter', async () => {
    const { GET } = await import('@/app/api/roadmap/route');
    const res = await GET();
    const body = await res.json();
    expect(body.quarters.length).toBeGreaterThanOrEqual(2);
    expect(body.quarters[0]).toHaveProperty('quarter');
    expect(body.quarters[0]).toHaveProperty('items');
  });

  test('GET /api/metrics returns analytics metrics', async () => {
    const { GET } = await import('@/app/api/metrics/route');
    const res = await GET();
    const body = await res.json();
    expect(body.metrics.length).toBeGreaterThanOrEqual(4);
  });

  test('POST /api/agents/broadcast fans a message out to every agent', async () => {
    const { POST } = await import('@/app/api/agents/broadcast/route');
    const res = await POST(
      new Request('http://localhost/api/agents/broadcast', {
        method: 'POST',
        body: JSON.stringify({ message: 'status report, everyone' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.broadcast.message).toBe('status report, everyone');
    const { realAgents } = await import('@/lib/agents/real');
    expect(body.broadcast.replies).toHaveLength(realAgents.length);
    for (const reply of body.broadcast.replies) {
      expect(typeof reply.ok).toBe('boolean');
      expect(reply.reply.length).toBeGreaterThan(0);
    }
  }, 30_000);

  test('POST /api/agents/broadcast rejects an empty message', async () => {
    const { POST } = await import('@/app/api/agents/broadcast/route');
    const res = await POST(
      new Request('http://localhost/api/agents/broadcast', { method: 'POST', body: JSON.stringify({ message: ' ' }) }),
    );
    expect(res.status).toBe(400);
  });

  test('GET /api/brain/overview returns the store tree and doctor checks', async () => {
    const { GET } = await import('@/app/api/brain/overview/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.store.path).toBe('string'); // '' = not configured
    expect(body.store.totalFiles).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.store.folders)).toBe(true);
    expect(body.store.generatedFiles).toBeGreaterThanOrEqual(0);
    expect(body.store.handWrittenFiles).toBeGreaterThanOrEqual(0);
    expect(body.store.generatedFiles + body.store.handWrittenFiles).toBe(body.store.totalFiles);
    expect(typeof body.doctor.connected).toBe('boolean');
    expect(Array.isArray(body.doctor.checks)).toBe(true);
    expect(body.doctor.detail.length).toBeGreaterThan(0);
  });

  test('GET /api/social returns the growth dashboard for the real accounts', async () => {
    const { GET } = await import('@/app/api/social/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.platforms.map((p: { platform: string }) => p.platform)).toEqual(['instagram']);
    // honest zero — no follower source is connected
    expect(body.totalFollowers).toBe(0);
    expect(body.platforms[0].growth).toHaveProperty('d7');
  });

  test('GET /api/social includes email list, DM total, and monthly growth', async () => {
    const { GET } = await import('@/app/api/social/route');
    const res = await GET();
    const body = await res.json();
    expect(body.emailList).toBeDefined();
    expect(body.emailList.subscribers).toBeNull(); // honest — no subscriber source
    expect(typeof body.totalDms).toBe('number');
    expect(body.totalDms).toBe(0); // honest — no DM source
    expect('monthlyGrowthPct' in body).toBe(true); // number | null, both valid
  });

  test('GET /api/social/series returns labelled audience + DM series with ranges', async () => {
    const { GET } = await import('@/app/api/social/series/route');
    const aud = await GET(new Request('http://localhost/api/social/series?metric=audience'));
    expect(aud.status).toBe(200);
    const audBody = await aud.json();
    expect(audBody.metric).toBe('audience');
    expect(audBody.ranges).toEqual([7, 30, 60, 'all']);
    expect(Array.isArray(audBody.series)).toBe(true);
    expect(audBody.series.some((s: { key: string }) => s.key === 'all')).toBe(true);

    const dms = await GET(new Request('http://localhost/api/social/series?metric=dms'));
    const dmsBody = await dms.json();
    expect(dmsBody.metric).toBe('dms');
    expect(Array.isArray(dmsBody.series)).toBe(true); // honest empty series
  });

  test('GET /api/social/series rejects an unknown metric', async () => {
    const { GET } = await import('@/app/api/social/series/route');
    const res = await GET(new Request('http://localhost/api/social/series?metric=bogus'));
    expect(res.status).toBe(400);
  });

  test('GET /api/funnel returns a validated summary + journeys (honestly empty)', async () => {
    const { GET } = await import('@/app/api/funnel/route');
    const res = await GET(new Request('http://localhost/api/funnel'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // the purge removed the invented journeys — the pipeline starts empty
    expect(body.summary.clients).toBe(0);
    expect(body.summary.stages.map((s: { stage: string }) => s.stage)).toEqual([
      'inquiry', 'follow_up', 'walkthrough_scheduled', 'estimate_sent',
      'negotiation', 'contract_signed', 'active_project', 'complete_paid',
    ]);
    expect(body.journeys).toEqual([]);
    expect(Array.isArray(body.archived)).toBe(true);
  });

  test('GET /api/funnel?business= accepts a valid business filter', async () => {
    const { GET } = await import('@/app/api/funnel/route');
    const res = await GET(new Request('http://localhost/api/funnel?business=aac'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.journeys)).toBe(true); // empty until real leads land
  });

  test('GET /api/funnel rejects an unknown business', async () => {
    const { GET } = await import('@/app/api/funnel/route');
    const res = await GET(new Request('http://localhost/api/funnel?business=bogus'));
    expect(res.status).toBe(400);
  });

  test('GET /api/social exposes audience + DM growth across ranges', async () => {
    const { GET } = await import('@/app/api/social/route');
    const res = await GET();
    const body = await res.json();
    for (const key of ['d7', 'd30', 'd60', 'allTime']) {
      expect(key in body.audienceGrowth).toBe(true);
      expect(key in body.dmGrowth).toBe(true);
    }
    expect(body.audienceTotal).toBe(0); // honest — nothing recorded yet
  });

  test('POST /api/social/posts enqueues a post; GET lists the queue', async () => {
    const route = await import('@/app/api/social/posts/route');
    const post = await route.POST(
      new Request('http://localhost/api/social/posts', {
        method: 'POST',
        body: JSON.stringify({ caption: 'launch day 🚀', platforms: ['instagram', 'tiktok'] }),
      }),
    );
    expect(post.status).toBe(201);
    const created = await post.json();
    expect(created.post.status).toBe('queued');
    expect(created.post.platforms).toEqual(['instagram', 'tiktok']);

    const list = await route.GET();
    const body = await list.json();
    expect(body.posts.some((p: { id: string }) => p.id === created.post.id)).toBe(true);
  });

  test('POST /api/social/posts rejects an empty caption or no platforms', async () => {
    const route = await import('@/app/api/social/posts/route');
    const bad = await route.POST(
      new Request('http://localhost/api/social/posts', {
        method: 'POST',
        body: JSON.stringify({ caption: '', platforms: [] }),
      }),
    );
    expect(bad.status).toBe(400);
  });

  test('GET /api/social/[platform] returns one platform’s analytics', async () => {
    const { GET } = await import('@/app/api/social/[platform]/route');
    const res = await GET(new Request('http://localhost/api/social/instagram'), {
      params: Promise.resolve({ platform: 'instagram' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account.platform).toBe('instagram');
    expect(Array.isArray(body.snapshots)).toBe(true); // honest empty history
  });

  test('GET /api/social/[platform] 404s for an untracked platform', async () => {
    const { GET } = await import('@/app/api/social/[platform]/route');
    const res = await GET(new Request('http://localhost/api/social/myspace'), {
      params: Promise.resolve({ platform: 'myspace' }),
    });
    expect(res.status).toBe(404);
  });

  test('GET /api/brain reports the real provider status', async () => {
    const { GET } = await import('@/app/api/brain/route');
    const res = await GET(new Request('http://localhost/api/brain'));
    const body = await res.json();
    expect(body.provider).toBe('local-store');
    expect(typeof body.connected).toBe('boolean');
    expect(body.detail.length).toBeGreaterThan(0);
  });

  test('GET /api/brain?q= runs a brain search through the provider', async () => {
    const previous = process.env.BRAIN_PROVIDER;
    process.env.BRAIN_PROVIDER = 'stub';
    try {
      const { GET } = await import('@/app/api/brain/route');
      const res = await GET(new Request('http://localhost/api/brain?q=vantage%20pool%20split'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.query).toBe('vantage pool split');
      expect(body.provider).toBe('stub');
      expect(Array.isArray(body.results)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.BRAIN_PROVIDER;
      else process.env.BRAIN_PROVIDER = previous;
    }
  });
});

describe('GET /api/funnel/lead-message — last thread for the dossier (AC54)', () => {
  test('400 when no name is given', async () => {
    const { GET } = await import('@/app/api/funnel/lead-message/route');
    const res = await GET(new Request('http://localhost/api/funnel/lead-message'));
    expect(res.status).toBe(400);
  });

  test('answers a well-formed shape for a lead with no thread', async () => {
    const { GET } = await import('@/app/api/funnel/lead-message/route');
    const res = await GET(
      new Request('http://localhost/api/funnel/lead-message?name=Nonexistent%20Lead%20XYZQ&email=nobody%40example.invalid'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // either an honest miss or an honest "feed unavailable" — never a guess
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('unavailable');
    if (!body.unavailable) expect(body.message).toBeNull();
  });
});
