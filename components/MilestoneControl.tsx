'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AAC_PROJECT_MILESTONES } from '@/lib/project-milestones';
import type { FunnelBusiness, FunnelStage, ProjectMilestone } from '@/lib/schemas';

/**
 * Construction-phase counterpart to StageAdvanceControl — the "which trade
 * is done" half of the Domino's-style tracker (Sean, 2026-08-27). Renders
 * only for an AAC job that's reached `active_project` (the sales pipeline's
 * job here is done; the trade sequence is what a client wants to see next).
 * Same explicit-click discipline as the stage control: marking a milestone
 * complete is always a deliberate action, never inferred from anything else
 * — mirrors CLAUDE.md's "a call never moves a journey's stage" rule for the
 * new write path.
 *
 * Fetches its own completed-milestones list (GET /api/funnel/[id]/milestone)
 * on mount rather than requiring every call site in app/funnel/page.tsx to
 * thread that data down — this is the one place in the tree that needs it.
 */
export default function MilestoneControl({
  journey,
}: {
  journey: { id: string; business: FunnelBusiness; status: FunnelStage };
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState<ProjectMilestone[] | null>(null);
  const [selected, setSelected] = useState<string>(AAC_PROJECT_MILESTONES[0].id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (journey.business !== 'aac' || journey.status !== 'active_project') return;
    let cancelled = false;
    fetch(`/api/funnel/${journey.id}/milestone`)
      .then((res) => res.json())
      .then((body: { ok: true; completed: ProjectMilestone[] } | { ok: false }) => {
        if (!cancelled && 'completed' in body) setCompleted(body.completed);
      })
      .catch(() => {
        if (!cancelled) setCompleted([]);
      });
    return () => {
      cancelled = true;
    };
  }, [journey.id, journey.business, journey.status]);

  if (journey.business !== 'aac' || journey.status !== 'active_project') return null;

  const doneIds = new Set((completed ?? []).map((m) => m.milestoneId));
  const remaining = AAC_PROJECT_MILESTONES.filter((m) => !doneIds.has(m.id));

  async function markComplete() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/funnel/${journey.id}/milestone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneId: selected }),
      });
      const body = (await res.json()) as { ok: true; milestone: ProjectMilestone } | { ok: false; reason: string };
      if (!res.ok || !body.ok) {
        setErr('reason' in body ? body.reason.slice(0, 80) : 'update failed');
        return;
      }
      setCompleted((prev) => [...(prev ?? []).filter((m) => m.milestoneId !== selected), body.milestone]);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 80) : 'update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      <span
        className="font-mono text-[9px] normal-case tracking-normal text-os-dim"
        title="Completed trades"
      >
        {doneIds.size}/{AAC_PROJECT_MILESTONES.length} trades
      </span>
      {remaining.length > 0 && (
        <>
          <select
            value={selected}
            onChange={(e) => {
              setErr(null);
              setSelected(e.target.value);
            }}
            disabled={busy}
            title="Pick the trade to mark complete"
            className="rounded-sm-t border border-os-border bg-os-surface px-1 py-0.5 font-mono text-[9px] normal-case tracking-normal text-os-muted disabled:opacity-50"
          >
            {remaining.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={markComplete}
            disabled={busy}
            title="Mark this trade complete — notifies the client, your decision, never automatic"
            className="rounded-sm-t border border-os-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text disabled:opacity-40"
          >
            {busy ? '…' : 'mark done ✓'}
          </button>
        </>
      )}
      {err && <span className="basis-full font-mono text-[9px] normal-case text-os-err">{err}</span>}
    </span>
  );
}
