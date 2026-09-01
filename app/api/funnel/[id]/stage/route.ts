import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { advanceStage } from '@/lib/funnel-stage';
import { notifyStageChange } from '@/lib/funnel-notify';
import { FunnelStageSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/**
 * POST — move one lead to a new funnel stage. The one write path allowed to
 * change a journey's `status` (see lib/funnel-stage.ts) — always an explicit
 * click from the "move to stage" control on /funnel, never automatic.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid JSON body' }, { status: 400 });
  }
  const stageRaw = (body as { stage?: unknown } | null)?.stage;
  const parsed = FunnelStageSchema.safeParse(stageRaw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: 'stage is required and must be a known funnel stage' },
      { status: 400 },
    );
  }

  const db = getDb();
  const result = advanceStage(db, params.id, parsed.data, new Date());
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  // Client-progress-tracker notification (Sean, 2026-08-27: "keep the
  // customer in the loop"). Never fails the stage move itself — a
  // notification failure (no email/phone on file, SMS not configured,
  // send error) is reported alongside the successful stage change, same
  // ok/pushFailed-separation pattern as Chief of Staff's ntfy push.
  const notify = await notifyStageChange(db, params.id);
  return NextResponse.json({ ...result, notify });
}
