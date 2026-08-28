'use client';

/**
 * The /comms "Drafts" tab — the human-in-the-loop queue for Gmail Worker's
 * post-triage drafts (lib/mail-extraction.ts + lib/mail-drafts.ts). Every
 * draft here is `pending`; this is the only UI that can move one forward,
 * and it does so exclusively through POST /api/comms/approve-draft — the
 * same route a script or curl call would use. Nothing renders here sends
 * anything on its own; every send is one explicit tap.
 *
 * Empty by default: this tab only ever shows anything once
 * MAIL_EXTRACTION_ENABLED is set to true in the deployment's environment —
 * until then, `initialDrafts` is always [].
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Send, X } from 'lucide-react';
import type { DraftReview } from '@/lib/mail-draft-review';
import type { MailIntent } from '@/lib/schemas';

const INTENT_LABEL: Record<MailIntent, string> = {
  lead: 'Lead',
  permit_inspection: 'Permit / Inspection',
  sub_bid: 'Sub Bid',
  bank_draw: 'Bank Draw',
  client_update: 'Client Update',
  general: 'General',
};

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatDollars(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** A small, muted "field: value" chip — omitted entirely by the caller when
 * the field is null, so this never has to render a "not found" placeholder
 * that could be mistaken for a real value at a glance. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm-t border border-os-border bg-os-surface2 px-1.5 py-[3px] font-mono text-[10px] text-os-muted">
      <span className="uppercase tracking-wide text-os-dim">{label}</span>
      {value}
    </span>
  );
}

type ActionState = { busy: boolean; error: string | null; editing: boolean; editText: string };

export function CommsDrafts({ initialDrafts }: { initialDrafts: DraftReview[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [state, setState] = useState<Record<string, ActionState>>({});

  const stateFor = (id: string): ActionState => state[id] ?? { busy: false, error: null, editing: false, editText: '' };
  const patch = (id: string, next: Partial<ActionState>) =>
    setState((prev) => ({ ...prev, [id]: { ...stateFor(id), ...next } }));

  const remove = (id: string) => setDrafts((prev) => prev.filter((d) => d.draft.id !== id));

  async function act(review: DraftReview, action: 'approve' | 'edit_and_send' | 'reject', editedText?: string) {
    const id = review.draft.id;
    patch(id, { busy: true, error: null });
    try {
      const res = await fetch('/api/comms/approve-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id, messageId: review.draft.messageId, action, editedText }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        remove(id);
        router.refresh();
        return;
      }
      if (res.status === 404 || res.status === 409) {
        // Already gone or already resolved elsewhere — retrying won't help;
        // drop it from the queue rather than leaving a dead card behind.
        remove(id);
        router.refresh();
        return;
      }
      patch(id, { busy: false, error: typeof body.error === 'string' ? body.error : 'action failed — try again' });
    } catch (e) {
      patch(id, { busy: false, error: e instanceof Error ? e.message.slice(0, 120) : 'action failed — try again' });
    }
  }

  if (drafts.length === 0) {
    return (
      <div className="grid place-items-center rounded-lg-t border border-dashed border-os-border bg-os-surface py-14 text-center font-mono text-[11px] text-os-dim">
        no drafts waiting for review
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-os-dim">
        every send below is one explicit tap — nothing here goes out on its own
      </p>
      {drafts.map((review) => {
        const { draft } = review;
        const s = stateFor(draft.id);
        return (
          <div key={draft.id} className="rounded-lg-t border border-os-border bg-os-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm-t border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-accent">
                    {INTENT_LABEL[review.intent]}
                  </span>
                  <span className="truncate text-[13px] font-semibold">{review.subject ?? '(no subject on file)'}</span>
                </div>
                <div className="mt-1 font-mono text-[10px] text-os-dim">
                  {review.fromAddress ?? 'unknown sender'} · {review.inboxName ?? review.draft.messageId} ·{' '}
                  {relativeTime(draft.createdAt)} · {review.extractionConfidence}% confidence
                </div>
              </div>
            </div>

            {(review.projectAddress || review.dollarAmount != null || review.drawNumber != null || review.invoiceNumber) && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {review.projectAddress && <Field label="address" value={review.projectAddress} />}
                {review.dollarAmount != null && <Field label="amount" value={formatDollars(review.dollarAmount)} />}
                {review.drawNumber != null && <Field label="draw" value={`#${review.drawNumber}`} />}
                {review.invoiceNumber && <Field label="invoice" value={review.invoiceNumber} />}
              </div>
            )}

            <p className="mt-3 border-l-2 border-os-border pl-3 text-xs leading-relaxed text-os-muted">
              {draft.executiveSummary}
            </p>

            <div className="mt-3">
              <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">proposed reply</div>
              {s.editing ? (
                <textarea
                  value={s.editText}
                  onChange={(e) => patch(draft.id, { editText: e.target.value })}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-os-border bg-os-bg px-3 py-2 text-xs text-os-text focus:border-os-border-bright focus:outline-none"
                />
              ) : (
                <p className="whitespace-pre-wrap rounded-lg border border-os-border bg-os-bg px-3 py-2 text-xs leading-relaxed text-os-text">
                  {draft.proposedReplyText}
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {s.editing ? (
                <>
                  <button
                    onClick={() => act(review, 'edit_and_send', s.editText)}
                    disabled={s.busy || !s.editText.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-os-text px-3 py-1.5 text-xs font-bold text-os-bg disabled:opacity-30"
                  >
                    <Send className="h-3 w-3" />
                    {s.busy ? 'Sending…' : 'Send edited'}
                  </button>
                  <button
                    onClick={() => patch(draft.id, { editing: false })}
                    disabled={s.busy}
                    className="flex items-center gap-1.5 rounded-lg border border-os-border px-3 py-1.5 text-xs text-os-muted disabled:opacity-30"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => act(review, 'approve')}
                    disabled={s.busy}
                    title="Send the proposed reply exactly as written"
                    className="flex items-center gap-1.5 rounded-lg bg-os-text px-3 py-1.5 text-xs font-bold text-os-bg disabled:opacity-30"
                  >
                    <Check className="h-3 w-3" />
                    {s.busy ? 'Sending…' : 'Approve & send'}
                  </button>
                  <button
                    onClick={() => patch(draft.id, { editing: true, editText: draft.proposedReplyText })}
                    disabled={s.busy}
                    className="flex items-center gap-1.5 rounded-lg border border-os-border px-3 py-1.5 text-xs text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text disabled:opacity-30"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => act(review, 'reject')}
                    disabled={s.busy}
                    title="Discard this draft — nothing is sent"
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-os-border px-3 py-1.5 text-xs text-os-dim transition-colors hover:border-os-err hover:text-os-err disabled:opacity-30"
                  >
                    <X className="h-3 w-3" />
                    Reject
                  </button>
                </>
              )}
            </div>
            {s.error && <p className="mt-2 font-mono text-[10px] text-os-err">{s.error}</p>}
          </div>
        );
      })}
    </div>
  );
}
