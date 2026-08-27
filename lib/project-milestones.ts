import type { FounderDb } from '@/lib/db';
import type { ProjectMilestone } from '@/lib/schemas';

/**
 * AAC's real 14-week full-renovation trade sequence, sourced from the
 * aac-senior-pm skill's own documented "Sub Coordination by Trade" schedule
 * — not invented for this feature. This is the catalog a real job's
 * milestones are marked complete against; `lib/db.ts`'s `project_milestones`
 * table only ever stores an id from this list plus a completion timestamp.
 *
 * Not every job touches every trade (a bathroom gut skips HVAC rough, a
 * kitchen-only job skips flooring-as-a-late-trade if the floor was never
 * touched) — the tracker only ever shows a milestone as upcoming or done,
 * never "skipped," so a job that doesn't need a trade simply never marks it;
 * `trackStepper`-style rendering for this list lives in the tracker page
 * itself, not here, since which subset applies is a per-job judgment call
 * Sean makes, not something this catalog can decide.
 */
export type ProjectMilestoneDef = {
  id: string;
  label: string;
  /** 1-indexed position in the standard 14-week sequence, for default
   *  ordering in the "mark complete" control — a real job can still
   *  complete them out of order (see `projectMilestones.forContact`). */
  order: number;
};

export const AAC_PROJECT_MILESTONES: ProjectMilestoneDef[] = [
  { id: 'demo', label: 'Demo', order: 1 },
  { id: 'rough_plumbing', label: 'Rough plumbing', order: 2 },
  { id: 'rough_electrical', label: 'Rough electrical', order: 3 },
  { id: 'hvac_rough', label: 'HVAC rough', order: 4 },
  { id: 'insulation', label: 'Insulation', order: 5 },
  { id: 'drywall', label: 'Drywall', order: 6 },
  { id: 'paint', label: 'Paint', order: 7 },
  { id: 'cabinets', label: 'Cabinets', order: 8 },
  { id: 'tile', label: 'Tile', order: 9 },
  { id: 'countertops', label: 'Countertops', order: 10 },
  { id: 'trim', label: 'Trim carpentry', order: 11 },
  { id: 'finish_electrical_plumbing', label: 'Finish electrical & plumbing', order: 12 },
  { id: 'flooring', label: 'Flooring', order: 13 },
  { id: 'final_punch', label: 'Final punch', order: 14 },
];

const MILESTONE_BY_ID = new Map(AAC_PROJECT_MILESTONES.map((m) => [m.id, m]));

export function milestoneDef(milestoneId: string): ProjectMilestoneDef | null {
  return MILESTONE_BY_ID.get(milestoneId) ?? null;
}

export type CompleteMilestoneResult =
  | { ok: true; milestone: ProjectMilestone }
  | { ok: false; reason: string; status: 400 | 404 };

/**
 * Marks one trade milestone complete for one contact — mirrors
 * `advanceStage`'s validate-then-insert shape (lib/funnel-stage.ts) on
 * purpose, so the two "move the client's progress forward" write paths in
 * this app read the same way. Idempotent by (contactId, milestoneId): a
 * second call just overwrites the completedAt date rather than erroring —
 * useful if Sean marks something complete on the wrong day and corrects it,
 * without needing a separate "undo" affordance.
 */
export function completeMilestone(
  db: FounderDb,
  contactId: string,
  milestoneId: string,
  now: Date,
): CompleteMilestoneResult {
  const journey = db.funnel.journeys().find((j) => j.id === contactId);
  if (!journey) {
    return { ok: false, reason: `no lead with id ${contactId}`, status: 404 };
  }
  const def = milestoneDef(milestoneId);
  if (!def) {
    return { ok: false, reason: `${milestoneId} is not a known project milestone`, status: 400 };
  }

  const existing = db.projectMilestones.forContact(contactId);
  const already = existing.find((m) => m.milestoneId === milestoneId);
  const completedAt = now.toISOString().slice(0, 10);
  const milestone: ProjectMilestone = {
    id: already?.id ?? `milestone-${contactId}-${milestoneId}`,
    contactId,
    milestoneId,
    label: def.label,
    completedAt,
  };
  db.projectMilestones.insert(milestone);
  return { ok: true, milestone };
}
