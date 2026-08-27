import type { FunnelStage } from '@/lib/schemas';

/**
 * Customer-facing translation layer for the public job tracker and its
 * notifications — Sean's own framing (2026-08-27): "how Domino's does it...
 * your pizza is being prepared... going into the oven... keeping them in
 * the loop as things get done." Internal stage ids (`estimate_sent`,
 * `active_project`) are Sean's/the funnel's own vocabulary; a client should
 * never see them verbatim. This file is the one place that vocabulary gets
 * translated, so the tracker page and the notification text never drift
 * apart.
 *
 * Only stages a client should actually be told about get an entry here —
 * `follow_up` and `negotiation` are internal bookkeeping, not something to
 * text a homeowner about, same as Domino's doesn't text you "still deciding
 * whether to trust this order."
 */
export type TrackStep = {
  stage: FunnelStage;
  /** 1-indexed position in the client-visible sequence. */
  step: number;
  /** Plain-English label for the stepper UI. */
  title: string;
  /** One line of context, shown under the title. */
  description: string;
  /** Shown in the SMS/email notification body when this stage is reached. */
  notifyBody: string;
};

export const AAC_VISIBLE_STAGES: readonly Exclude<FunnelStage, 'follow_up' | 'negotiation' | 'inquiry' | 'discovered' | 'installed' | 'activated' | 'trial_started' | 'subscribed' | 'retained'>[] = [
  'walkthrough_scheduled',
  'estimate_sent',
  'contract_signed',
  'active_project',
  'complete_paid',
] as const;

export const AAC_TRACK_STEPS: TrackStep[] = [
  {
    stage: 'walkthrough_scheduled',
    step: 1,
    title: 'Walk-through scheduled',
    description: 'We’re confirming the scope of your project in person.',
    notifyBody: 'Your walk-through is on the calendar — we’ll confirm the scope of your project in person.',
  },
  {
    stage: 'estimate_sent',
    step: 2,
    title: 'Estimate ready',
    description: 'Your written estimate is in your inbox.',
    notifyBody: 'Your estimate is ready and in your inbox — take a look and let us know if you have questions.',
  },
  {
    stage: 'contract_signed',
    step: 3,
    title: 'Project booked',
    description: 'Your project is officially on the schedule.',
    notifyBody: 'You’re booked — your project is officially on the schedule. We’ll be in touch as work begins.',
  },
  {
    stage: 'active_project',
    step: 4,
    title: 'In progress',
    description: 'Work is underway. Track each phase below as it’s completed.',
    notifyBody: 'Work has started on your project — you can follow along step by step at your tracker link.',
  },
  {
    stage: 'complete_paid',
    step: 5,
    title: 'Complete',
    description: 'Your project is finished. Thank you for trusting us with it.',
    notifyBody: 'Your project is complete — thank you for trusting Arise Above Construction with your home.',
  },
];

const STEP_BY_STAGE = new Map(AAC_TRACK_STEPS.map((s) => [s.stage, s]));

/** True if this stage should ever be shown to the client / trigger a
 *  notification. Internal-only stages (inquiry, follow_up, negotiation, and
 *  every Apps stage) return false. */
export function isClientVisibleStage(stage: FunnelStage): boolean {
  return STEP_BY_STAGE.has(stage);
}

export function trackStepFor(stage: FunnelStage): TrackStep | null {
  return STEP_BY_STAGE.get(stage) ?? null;
}

/** Stepper state for the whole AAC sequence, given the journey's current
 *  furthest stage — each step marked done/current/upcoming. A journey whose
 *  current stage isn't client-visible (still at inquiry/follow_up/etc.)
 *  renders every step as upcoming, nothing marked current yet. */
export function trackStepper(currentStage: FunnelStage): (TrackStep & { state: 'done' | 'current' | 'upcoming' })[] {
  const currentStep = STEP_BY_STAGE.get(currentStage)?.step ?? 0;
  return AAC_TRACK_STEPS.map((s) => ({
    ...s,
    state: s.step < currentStep ? 'done' : s.step === currentStep ? 'current' : 'upcoming',
  }));
}
