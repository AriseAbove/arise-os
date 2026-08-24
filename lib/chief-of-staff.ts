/**
 * Chief of Staff — the proactive signal engine behind the chief-of-staff
 * agent and its cron. Pure/honest by design: every signal traces back to a
 * real repo row or a real connector call, nothing invented, and every
 * source that isn't configured just contributes zero signals instead of
 * throwing (see gatherSignals's own no-config test).
 *
 * Three moving parts:
 *  - gatherSignals: pulls hot/fading leads (from the funnel's own attention
 *    model), overdue/open QuickBooks invoices, and unread work email into
 *    one flat list.
 *  - briefingText: a deterministic, no-AI summary sentence — the honest
 *    fallback when AI_GATEWAY_API_KEY isn't configured, and always the
 *    fast path even when it is.
 *  - newHighSeveritySignals / markNotified: dedupe across cron runs so a
 *    push only fires once per signal, using the same seed_meta KV table
 *    lib/seed.ts already uses for SEED_VERSION (see lib/db.ts's seedMeta).
 *  - sendNtfyPush: a tiny, honest ntfy.sh client (self-hostable via
 *    NTFY_URL) — no-ops with a stated reason when NTFY_TOPIC isn't set.
 *  - describeFetchError: Node's fetch throws a generic `TypeError: fetch
 *    failed` for every network-level failure (DNS, connection refused, TLS,
 *    timeout) and buries the actually-diagnosable reason on `err.cause`.
 *    Every 2026-08 production cron run that failed to push showed only
 *    "push failed (fetch failed)" in its log — honest that it failed, but
 *    not describable, which is exactly what the honest-status principle
 *    forbids. This walks the cause chain so the real reason is visible.
 */
import type { FounderDb } from '@/lib/db';
import { attentionQueue } from '@/lib/funnel';
import { qboConfigured, openInvoices } from '@/lib/connectors/quickbooks';
import { gatherCommsFeed } from '@/lib/comms-feed';
import { commsLane, parseWorkKeywords } from '@/lib/comms-gravity';

export type SignalCategory = 'lead' | 'invoice' | 'comms';
export type SignalSeverity = 'high' | 'medium';

export type Signal = {
  id: string;
  category: SignalCategory;
  severity: SignalSeverity;
  summary: string;
};

type Env = Record<string, string | undefined>;

/** Hot leads ready to push and fading leads worth saving, straight from the
 *  funnel's own attention model — no separate scoring logic to drift out of
 *  sync with what /funnel already shows the operator. */
function leadSignals(db: FounderDb, now: Date): Signal[] {
  const journeys = db.funnel.journeys();
  const { pushNow, saveNow } = attentionQueue(journeys, now);
  const signals: Signal[] = [];
  for (const j of pushNow) {
    signals.push({
      id: `lead-push-${j.id}`,
      category: 'lead',
      severity: 'high',
      summary: `${j.name} — hot lead (${j.likelihood}% likely), push now.`,
    });
  }
  for (const j of saveNow) {
    signals.push({
      id: `lead-save-${j.id}`,
      category: 'lead',
      severity: 'medium',
      summary: `${j.name} — fading, worth a save-touch before it decays.`,
    });
  }
  return signals;
}

/** Open QuickBooks invoices — overdue ones are high severity, everything
 *  else open is a medium-severity heads-up. Empty (not thrown) whenever
 *  QuickBooks isn't configured or the API call fails. */
async function invoiceSignals(env: Env, now: Date): Promise<Signal[]> {
  if (!qboConfigured(env)) return [];
  const invoices = await openInvoices(env);
  if (!invoices) return [];
  return invoices.map((inv) => {
    const overdue = inv.dueDate ? new Date(`${inv.dueDate}T00:00:00Z`).getTime() < now.getTime() : false;
    return {
      id: `invoice-${inv.id}`,
      category: 'invoice' as const,
      severity: overdue ? ('high' as const) : ('medium' as const),
      summary: overdue
        ? `${inv.customer} — invoice ${inv.docNumber} overdue ($${inv.balance.toLocaleString()}).`
        : `${inv.customer} — invoice ${inv.docNumber} open ($${inv.balance.toLocaleString()}).`,
    };
  });
}

/** Unread work-lane email from the unified comms feed — tier-1 tagged
 *  senders are high severity, every other unread work email is medium.
 *  Empty (not thrown) whenever no inbox is configured. */
async function commsSignals(env: Env): Promise<Signal[]> {
  let items;
  try {
    items = await gatherCommsFeed();
  } catch {
    return [];
  }
  const workKeywords = parseWorkKeywords(env.COMMS_WORK_KEYWORDS);
  const signals: Signal[] = [];
  for (const item of items) {
    if (!item.unread) continue;
    if (commsLane(item, workKeywords) !== 'work') continue;
    signals.push({
      id: `comms-${item.source}-${item.sender ?? item.title}-${item.ts}`,
      category: 'comms',
      severity: item.priority === 1 ? 'high' : 'medium',
      summary: `${item.sender ?? item.title} — unread work email.`,
    });
  }
  return signals;
}

/** Every signal worth surfacing right now, from whichever sources are
 *  actually configured. Never throws — a source that isn't wired up (no
 *  QuickBooks keys, no inbox) just contributes nothing. */
export async function gatherSignals(db: FounderDb, env: Env, now: Date = new Date()): Promise<Signal[]> {
  const [invoice, comms] = await Promise.all([invoiceSignals(env, now), commsSignals(env)]);
  return [...leadSignals(db, now), ...invoice, ...comms];
}

const CATEGORY_LABEL: Record<SignalCategory, Record<SignalSeverity, string>> = {
  lead: { high: 'hot lead', medium: 'lead to save' },
  invoice: { high: 'overdue invoice', medium: 'open invoice' },
  comms: { high: 'urgent email', medium: 'work email' },
};

/** A deterministic, no-AI summary sentence — counts by category+severity in
 *  first-seen order. This is the honest fallback when AI_GATEWAY_API_KEY
 *  isn't set, and stays the fast path even once it is. */
export function briefingText(signals: Signal[]): string {
  if (signals.length === 0) return 'Nothing needs your attention right now.';
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const s of signals) {
    const label = CATEGORY_LABEL[s.category][s.severity];
    if (!counts.has(label)) order.push(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return order.map((label) => `${counts.get(label)} ${label}${counts.get(label) === 1 ? '' : 's'}`).join(', ') + '.';
}

const NOTIFIED_PREFIX = 'chief_of_staff_notified:';

/** High-severity signals that haven't already triggered a push on a prior
 *  run — the dedupe gate so a hot lead pings once, not every hour. */
export function newHighSeveritySignals(db: FounderDb, signals: Signal[]): Signal[] {
  return signals.filter((s) => s.severity === 'high' && db.seedMeta.get(NOTIFIED_PREFIX + s.id) === null);
}

/** Record that these signals have been pushed, so the next run's dedupe
 *  gate skips them. */
export function markNotified(db: FounderDb, signals: Signal[]): void {
  for (const s of signals) db.seedMeta.set(NOTIFIED_PREFIX + s.id, '1');
}

export type NtfyResult =
  | { sent: true; status: number }
  | { sent: false; reason: string }
  | { sent: false; status: number };

/** How long a push attempt gets before it's aborted and reported as a
 *  failure. Without this, a connection that hangs instead of erroring
 *  immediately (a common failure mode for network-level blocks) would stall
 *  the whole hourly cron run rather than failing fast and loud. */
const NTFY_TIMEOUT_MS = 10_000;

/** The exact ntfy publish URL sendNtfyPush would hit for this env — exported
 *  so a caller whose direct push fails (see lib/agents/real.ts's
 *  chiefOfStaffRunWith) can relay to the SAME target instead of guessing at
 *  it a second time. Returns null when NTFY_TOPIC isn't set (nothing to
 *  relay to either). */
export function ntfyTargetUrl(env: Env): string | null {
  const topic = env.NTFY_TOPIC;
  if (!topic) return null;
  const base = env.NTFY_URL ?? 'https://ntfy.sh';
  return `${base}/${encodeURIComponent(topic)}`;
}

/** Post a push notification to ntfy.sh (or a self-hosted instance via
 *  NTFY_URL). Honest no-op — never a silent failure — when NTFY_TOPIC isn't
 *  configured. The topic is URL-encoded so a stray character (whitespace,
 *  slash, a trailing newline from a pasted env var) can't produce a
 *  malformed request path. */
export async function sendNtfyPush(
  env: Env,
  title: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NtfyResult> {
  const url = ntfyTargetUrl(env);
  if (!url) return { sent: false, reason: 'NTFY_TOPIC not set' };
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Title: title },
    body,
    signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
  });
  if (!res.ok) return { sent: false, status: res.status };
  return { sent: true, status: res.status };
}

/** Turns a caught fetch error into a describable string instead of the bare
 *  "fetch failed" TypeError message — walks `cause` (an Error, a plain
 *  Node system-error-shaped object, or anything else) so the actual reason
 *  (DNS failure, connection refused, TLS error, our own timeout abort) is
 *  visible wherever the message ends up (run summary, Analytics, /agents). */
export function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  let cause: unknown = err.cause;
  let depth = 0;
  while (cause !== undefined && cause !== null && depth < 3) {
    if (cause instanceof Error) {
      const code = (cause as NodeJS.ErrnoException).code;
      parts.push(code ? `${cause.message} (${code})` : cause.message);
      cause = cause.cause;
    } else if (typeof cause === 'object') {
      const c = cause as { code?: string; message?: string };
      parts.push(c.message ?? c.code ?? JSON.stringify(cause));
      cause = undefined;
    } else {
      parts.push(String(cause));
      cause = undefined;
    }
    depth++;
  }
  return parts.join(' — ');
}
