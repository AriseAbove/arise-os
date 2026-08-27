import type { FounderDb } from '@/lib/db';
import type { FunnelJourney } from '@/lib/schemas';
import { isClientVisibleStage, trackStepFor } from '@/lib/funnel-track-copy';
import { AAC_PROJECT_MILESTONES, milestoneDef } from '@/lib/project-milestones';
import { signTrackToken } from '@/lib/track-token';
import { sendEmailReply } from '@/lib/connectors/email';
import { sendSms } from '@/lib/connectors/sms';

/**
 * The notify leg of the "Domino's tracker" — Sean's own framing (2026-08-27):
 * text and email a client whenever their stage or a construction milestone
 * changes, with a link back to their own /track/[token] page. Two callers:
 * `POST /api/funnel/[id]/stage` (after advanceStage) and
 * `POST /api/funnel/[id]/milestone` (after completeMilestone).
 *
 * Honest-by-default like every connector this ties together: a missing
 * TRACK_TOKEN_SECRET, missing contact info, or a send failure never throws —
 * it reports what actually happened so the caller can log it, never claims
 * a notification went out that didn't.
 */

export type NotifyResult = {
  attempted: boolean;
  emailSent: boolean;
  smsSent: boolean;
  errors: string[];
};

const NO_OP: NotifyResult = { attempted: false, emailSent: false, smsSent: false, errors: [] };

function trackUrl(contactId: string, env: Record<string, string | undefined>): string | null {
  const base = env.PUBLIC_APP_URL;
  if (!base) return null;
  const token = signTrackToken(contactId, env);
  if (!token) return null;
  return `${base.replace(/\/$/, '')}/track/${token}`;
}

async function send(
  journey: FunnelJourney,
  body: string,
  env: Record<string, string | undefined>,
): Promise<NotifyResult> {
  const errors: string[] = [];
  let emailSent = false;
  let smsSent = false;

  if (journey.email) {
    const res = await sendEmailReply(
      { to: journey.email, subject: `Update on your Arise Above Construction project`, text: body },
      env,
    );
    if (res.ok) emailSent = true;
    else errors.push(`email: ${res.error}`);
  }
  if (journey.phone) {
    const res = await sendSms(journey.phone, body, env);
    if (res.ok) smsSent = true;
    else errors.push(`sms: ${res.error}`);
  }
  if (!journey.email && !journey.phone) {
    errors.push('no email or phone on file for this contact');
  }

  return { attempted: true, emailSent, smsSent, errors };
}

/** Call after a successful `advanceStage()`. No-ops (returns NO_OP) for a
 *  stage that isn't client-visible (inquiry, follow_up, negotiation, every
 *  Apps stage) — those are Sean's internal bookkeeping, never a text to a
 *  homeowner, same rule `funnel-track-copy.ts` documents. */
export async function notifyStageChange(
  db: FounderDb,
  contactId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<NotifyResult> {
  const journey = db.funnel.journeys().find((j) => j.id === contactId);
  if (!journey) return NO_OP;
  if (!isClientVisibleStage(journey.status)) return NO_OP;

  const step = trackStepFor(journey.status);
  if (!step) return NO_OP;

  const link = trackUrl(contactId, env);
  const body = link ? `${step.notifyBody} Follow along here: ${link}` : step.notifyBody;
  return send(journey, body, env);
}

/** Call after a successful `completeMilestone()`. Always attempts to notify
 *  (construction milestones only exist once a job reaches `active_project`,
 *  which is itself client-visible) — names the completed trade and, when
 *  there's a next one in the standard sequence, previews it, matching the
 *  "your pizza is being prepared... going into the oven" step-by-step
 *  framing Sean asked for. */
export async function notifyMilestoneComplete(
  db: FounderDb,
  contactId: string,
  milestoneId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<NotifyResult> {
  const journey = db.funnel.journeys().find((j) => j.id === contactId);
  if (!journey) return NO_OP;
  const def = milestoneDef(milestoneId);
  if (!def) return NO_OP;

  const next = AAC_PROJECT_MILESTONES.find((m) => m.order === def.order + 1);
  const link = trackUrl(contactId, env);
  const base = next
    ? `${def.label} is complete — up next: ${next.label}.`
    : `${def.label} is complete — that's the last step. Your project is finished.`;
  const body = link ? `${base} Follow along here: ${link}` : base;
  return send(journey, body, env);
}
