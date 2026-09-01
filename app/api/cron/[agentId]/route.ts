import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { runtimeEnv } from '@/lib/creds';
import { createRuntime } from '@/lib/agents/runtime';
import { realAgents } from '@/lib/agents/real';

// The generalized agent cron route. Replaces the old single-agent
// app/api/cron/chief-of-staff/route.ts (2026-08-21) — a production review
// found 9 of the 10 real agents (everything but Chief of Staff) had never
// actually run on a schedule, only ever manually from /agents. Rather than
// hand-roll a near-duplicate route per agent, this one route dispatches
// any id in `realAgents`, so each agent's GitHub Actions workflow (see
// .github/workflows/chief-of-staff-check.yml and
// .github/workflows/agent-cron-checks.yml) just POSTs to its own
// /api/cron/<agentId> with the same shared secret.
//
// Same reasoning as before for why this is a GitHub-Actions-calls-a-route
// shape instead of Railway's native Cron Jobs: the FOUNDER_OS_DB volume can
// only mount to one Railway service, and a second scheduler service would
// mean a second, out-of-sync copy of the database.
//
// The URL /api/cron/chief-of-staff is unchanged, so the existing
// chief-of-staff-check.yml workflow (and its already-configured
// ARISE_OS_URL/CRON_SECRET repo secrets) needed no changes at all.
export const dynamic = 'force-dynamic';

const REAL_AGENT_IDS = new Set(realAgents.map((a) => a.id));

export async function POST(req: Request, props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  const { agentId } = params;
  if (!REAL_AGENT_IDS.has(agentId)) {
    return NextResponse.json({ error: `unknown agent: ${agentId}` }, { status: 404 });
  }

  const env = runtimeEnv();
  const secret = env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not set — add it to .env.local (and the host env) to enable scheduled agent checks.' },
      { status: 501 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const runtime = createRuntime(getDb(), realAgents);
  const run = await runtime.run(agentId);
  return NextResponse.json({ run });
}
