import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { upsertFunnelCard } from '@/lib/funnel-card';
import { FunnelBusinessSchema, FunnelChannelSchema, FunnelStageSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const CardRequestSchema = z.object({
  business: FunnelBusinessSchema,
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  stage: FunnelStageSchema,
  product: z.string().nullable().optional(),
  amountUsd: z.number().nonnegative().nullable().optional(),
  costUsd: z.number().nonnegative().nullable().optional(),
  relationship: z.enum(['cold', 'warm', 'hot']).optional(),
  likelihood: z.number().int().min(0).max(100).optional(),
  person: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  touchLabel: z.string().min(1),
  touchChannel: FunnelChannelSchema,
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST — create or update one funnel card from a Claude/Cowork session.
 * This is the standing step Sean's own estimates/proposals/change orders
 * are meant to call as their last step, so the funnel stays the honest
 * record of every real job — not just the ones that came in through Allo
 * or the website form. See lib/funnel-card.ts's header comment and the
 * 2026-08-24 email-leads-gap handoff for why this exists.
 *
 * Sits behind the same app-wide Basic Auth wall as every other write route
 * (middleware.ts) — no separate secret, since the caller is Sean acting
 * through his own authenticated session, not an unattended webhook.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: parsed.error.message }, { status: 400 });
  }

  const { journey, created } = upsertFunnelCard(getDb(), parsed.data, new Date());
  return NextResponse.json({ ok: true, created, journey });
}
