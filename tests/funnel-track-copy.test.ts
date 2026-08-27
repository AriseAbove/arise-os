import { describe, expect, test } from 'vitest';
import { AAC_TRACK_STEPS, isClientVisibleStage, trackStepFor, trackStepper } from '@/lib/funnel-track-copy';

describe('funnel-track-copy — the client-facing translation of internal FunnelStage', () => {
  test('exactly the 5 client-visible AAC stages, in order', () => {
    expect(AAC_TRACK_STEPS.map((s) => s.stage)).toEqual([
      'walkthrough_scheduled',
      'estimate_sent',
      'contract_signed',
      'active_project',
      'complete_paid',
    ]);
    AAC_TRACK_STEPS.forEach((s, i) => expect(s.step).toBe(i + 1));
  });

  test('internal-only stages are never client-visible', () => {
    for (const stage of ['inquiry', 'follow_up', 'negotiation'] as const) {
      expect(isClientVisibleStage(stage)).toBe(false);
      expect(trackStepFor(stage)).toBeNull();
    }
  });

  test('Apps-only stages are never client-visible either — this tracker is AAC-only', () => {
    for (const stage of ['discovered', 'installed', 'activated', 'trial_started', 'subscribed', 'retained'] as const) {
      expect(isClientVisibleStage(stage)).toBe(false);
    }
  });

  test('trackStepFor resolves a real stage to its copy', () => {
    const step = trackStepFor('estimate_sent');
    expect(step?.title).toBe('Estimate ready');
    expect(step?.notifyBody).toContain('estimate');
  });

  test('trackStepper marks earlier steps done, the current stage current, later ones upcoming', () => {
    const steps = trackStepper('contract_signed');
    expect(steps.find((s) => s.stage === 'walkthrough_scheduled')?.state).toBe('done');
    expect(steps.find((s) => s.stage === 'estimate_sent')?.state).toBe('done');
    expect(steps.find((s) => s.stage === 'contract_signed')?.state).toBe('current');
    expect(steps.find((s) => s.stage === 'active_project')?.state).toBe('upcoming');
    expect(steps.find((s) => s.stage === 'complete_paid')?.state).toBe('upcoming');
  });

  test('a journey still at an internal-only stage renders every step upcoming, nothing current yet', () => {
    const steps = trackStepper('follow_up');
    expect(steps.every((s) => s.state === 'upcoming')).toBe(true);
  });

  test('the final stage marks every step done or current, never upcoming', () => {
    const steps = trackStepper('complete_paid');
    expect(steps.every((s) => s.state !== 'upcoming')).toBe(true);
    expect(steps.find((s) => s.stage === 'complete_paid')?.state).toBe('current');
  });
});
