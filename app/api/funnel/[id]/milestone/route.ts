import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { completeMilestone } from '@/lib/project-milestones';
import { notifyMilestoneComplete } from '@/lib/funnel-notify';

export const dynamic = 'force-dynamic';

/**
 * GET — the completed milestones for one contact, read by
 * components/MilestoneControl.tsx so it can show what's already done
 * instead of only ever offering a blank "mark complete" control.
 */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const completed = getDb().projectMilestones.forContact(params.id);
  return NextResponse.json({ ok: true, completed });
}

/**
 * POST — mark one construction-phase milestone complete for a contact. The
 * project-milestone counterpart to /api/funnel/[id]/stage: same
 * validate-then-write-then-notify shape, always an explicit click from the
 * "mark complete" control on /funnel (components/MilestoneControl.tsx),
 * never automatic.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid JSON body' }, { status: 400 });
  }
  const milestoneId = (body as { milestoneId?: unknown } | null)?.milestoneId;
  if (typeof milestoneId !== 'string' || milestoneId.trim() === '') {
    return NextResponse.json({ ok: false, reason: 'milestoneId is required' }, { status: 400 });
  }

  const db = getDb();
  const result = completeMilestone(db, params.id, milestoneId, new Date());
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  const notify = await notifyMilestoneComplete(db, params.id, milestoneId);
  return NextResponse.json({ ...result, notify });
}
