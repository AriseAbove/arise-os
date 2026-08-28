import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getBrainProvider } from '@/lib/brain';
import { parseInboxConfigs, unreadCounts } from '@/lib/connectors/email';
import { triageAllInboxes } from '@/lib/connectors/email-triage';
import { calendarStatus, upcomingEvents, caldavAccounts } from '@/lib/connectors/gcal';
import {
  quickbooksStatus,
  monthToDateIncome,
  monthToDateExpenses,
  openInvoices,
  companyName as qboCompanyName,
} from '@/lib/connectors/quickbooks';
import { alloConfigured, fetchAlloCalls } from '@/lib/connectors/allo';
import { importAlloCalls } from '@/lib/funnel-allo';
import { fetchWebsiteFormLeads } from '@/lib/connectors/website-leads';
import { importWebsiteFormLeads } from '@/lib/funnel-website';
import { oneupConfigured } from '@/lib/connectors/oneup';
import { publishQueuedSocialPosts } from '@/lib/social-oneup';
import { runtimeEnv } from '@/lib/creds';
import { getDb } from '@/lib/data';
import {
  gatherSignals,
  briefingText,
  newHighSeveritySignals,
  markNotified,
  sendNtfyPush,
  describeFetchError,
  ntfyTargetUrl,
} from '@/lib/chief-of-staff';
import type { LlmToolSpec } from '@/lib/connectors/llm';
import type { AgentRunResult, RuntimeAgent } from '@/lib/agents/runtime';
import type { FounderDb } from '@/lib/db';

/**
 * The real agent roster. Every run() does actual work against a live system —
 * no seeded numbers. Agents whose connector lacks credentials fail honestly
 * with setup instructions instead of pretending.
 *
 * Trimmed in the Phase 2 purge to the lanes with real backing: email (IMAP),
 * calendar (ICS), QuickBooks, the knowledge provider abstraction, and the
 * DB-backed conductor. New agents land here as real integrations do —
 * a row in this file plus its seed entry, never a larp.
 */

async function gmailRun(): Promise<AgentRunResult> {
  const inboxes = parseInboxConfigs(process.env);
  if (inboxes.length === 0) {
    return { ok: false, summary: 'No inboxes configured — set INBOX_1..4_HOST/_USER/_PASS in .env.local' };
  }
  const counts = await unreadCounts(process.env);
  const failed = counts.filter((c) => c.error);
  const total = counts.reduce((sum, c) => sum + c.unread, 0);
  const summary = counts
    .map((c) => `${c.inbox}: ${c.error ? `ERROR ${c.error.slice(0, 60)}` : `${c.unread} unread`}`)
    .join(' · ')
    .concat(` · total ${total} unread`);

  // Junk-triage expansion (2026-08-28, approved SOP) — off unless
  // MAIL_TRIAGE_MODE is explicitly set to dry_run or live; the pre-existing
  // unread-count behavior above is unaffected either way. A triage failure
  // never fails the whole run — unread counts are the primary job here.
  const triage = await triageAllInboxes(process.env).catch((err) => ({
    config: { mode: 'off' as const, maxMovesPerRun: 0, liveInboxIds: null },
    results: [],
    error: err instanceof Error ? err.message : String(err),
  }));
  const triageSummary =
    triage.config.mode === 'off'
      ? ''
      : ' · triage(' +
        triage.config.mode +
        '): ' +
        triage.results
          .map(
            (r) =>
              `${r.inboxName} ${r.junk} junk/${r.moved} moved/${r.review} review` +
              (r.trashUnavailable ? ' (no Trash folder found — nothing moved)' : '') +
              (r.error ? ` ERROR ${r.error.slice(0, 60)}` : ''),
          )
          .join(', ');

  return {
    ok: failed.length < counts.length,
    summary: summary + triageSummary,
    data: { counts, triage: triage.results },
  };
}

async function calendarRun(): Promise<AgentRunResult> {
  const env = runtimeEnv();
  if (caldavAccounts(env).length === 0) {
    return { ok: false, summary: 'No calendars configured — set CAL_1_USER/_PASS (+ optional _NAME/_COLOR) in .env.local' };
  }
  const events = await upcomingEvents(env);
  return {
    ok: true,
    summary: `${events.length} upcoming event${events.length === 1 ? '' : 's'} across ${caldavAccounts(env).length} calendar(s)`,
    data: events.slice(0, 10),
  };
}

async function quickbooksRun(): Promise<AgentRunResult> {
  const status = await quickbooksStatus(runtimeEnv());
  return { ok: status.state === 'connected', summary: status.detail, data: status.meta };
}

async function alloRun(): Promise<AgentRunResult> {
  const env = runtimeEnv();
  if (!alloConfigured(env)) {
    return {
      ok: false,
      summary: 'ALLO_API_KEY not set — create a key in Allo (settings → API, Conversations Read scope) and add it to the environment',
    };
  }
  const calls = await fetchAlloCalls(env);
  const res = importAlloCalls(getDb(), calls, new Date());
  return {
    ok: true,
    summary: `${calls.length} calls in the Allo log · ${res.newContacts} new lead journey(s) · ${res.newTouches} new touch(es) · ${res.skipped} skipped (spam/outbound)`,
    data: res,
  };
}

async function websitePulseRun(): Promise<AgentRunResult> {
  const env = runtimeEnv();
  if (parseInboxConfigs(env).length === 0) {
    return {
      ok: false,
      summary: 'No inboxes configured — set INBOX_1..4_HOST/_USER/_PASS in .env.local (same inbox Comms already uses)',
    };
  }
  const leads = await fetchWebsiteFormLeads(env);
  const res = importWebsiteFormLeads(getDb(), leads, new Date());
  return {
    ok: true,
    summary: `${leads.length} website form submission(s) found · ${res.newContacts} new lead journey(s) · ${res.newTouches} new touch(es) · ${res.skipped} skipped (no phone/email)`,
    data: res,
  };
}

async function socialPulseRun(): Promise<AgentRunResult> {
  const env = runtimeEnv();
  if (!oneupConfigured(env)) {
    return {
      ok: false,
      summary: 'ONEUP_API_KEY not set — save it via /integrations (Marketing → OneUp) to publish queued posts',
    };
  }
  if (!env.ONEUP_CATEGORY_ID) {
    return {
      ok: false,
      summary:
        'ONEUP_CATEGORY_ID not set — GET /api/listcategory with the OneUp API key to find it, see docs/oneup-integration.md',
    };
  }
  const queuedBefore = getDb().socialPosts.queued().length;
  if (queuedBefore === 0) {
    return { ok: true, summary: 'OneUp connected · nothing queued to publish' };
  }
  const outcomes = await publishQueuedSocialPosts(getDb(), env);
  const published = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - published;
  return {
    ok: failed === 0,
    summary: `${published}/${outcomes.length} queued post(s) published via OneUp${failed > 0 ? ` · ${failed} failed` : ''}`,
    data: outcomes,
  };
}

/** Testable core: explicit db/env/fetch so a flaky push (DNS blip, ntfy.sh
 *  outage) can be exercised without touching the module-level singletons.
 *  A push failure is reported honestly in the summary but never fails the
 *  whole run — the signals were still gathered correctly, and the dedupe
 *  gate correctly leaves the signal un-notified so the next run retries it.
 *
 *  `ok` and `pushFailed` are deliberately separate signals on the returned
 *  result: `ok` says the run did its real job (gathering signals), and
 *  `pushFailed` says a notification it tried to send genuinely did not go
 *  through. Before 2026-08-21 there was no `pushFailed` at all, so every
 *  agent_runs row for this agent read `ok: true` regardless of push outcome
 *  and Analytics' "Run outcomes" pie rolled every failed push straight into
 *  "Succeeded" — 69 straight hourly runs whose push failed with "fetch
 *  failed" showed up as ~99% OK. See lib/analytics.ts's runOutcomeCounts and
 *  app/analytics/page.tsx for where this now surfaces. */
/** Fallback for a genuinely failed direct ntfy push (2026-08-24): live
 *  diagnosis from Railway's own Console confirmed this service cannot reach
 *  ntfy.sh's IP at all — see lib/db.ts's pushQueue doc comment for the full
 *  story. Rather than just recording the failure, queue the exact
 *  url/title/body for ~/.aac_brain/push_relay.py (a poller on Sean's Mac,
 *  which reaches ntfy.sh fine) to forward. Returns true when the relay
 *  enqueue itself succeeded — a plain synchronous DB write, so this only
 *  fails if the database itself is broken, not because of the network
 *  problem the relay exists to route around. */
function relayFailedPush(db: FounderDb, env: Record<string, string | undefined>, title: string, body: string, now: Date): boolean {
  const url = ntfyTargetUrl(env);
  if (!url) return false;
  try {
    db.pushQueue.enqueue({ id: randomUUID(), url, title, body, createdAt: now.toISOString() });
    return true;
  } catch {
    return false;
  }
}

export async function chiefOfStaffRunWith(
  db: FounderDb,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<AgentRunResult> {
  const signals = await gatherSignals(db, env, now);
  const fresh = newHighSeveritySignals(db, signals);
  let pushNote = '';
  let pushFailed = false;
  if (fresh.length > 0) {
    const title = 'Chief of Staff';
    const body = fresh.map((s) => s.summary).join('\n');
    try {
      const push = await sendNtfyPush(env, title, body, fetchImpl);
      if (push.sent) {
        markNotified(db, fresh);
        pushNote = ` · pushed ${fresh.length} new`;
      } else if ('reason' in push) {
        // Honest no-op — nothing was attempted (e.g. NTFY_TOPIC not set).
        // Not configured is not the same as broken, so this doesn't count
        // as a push failure, and there's no known target to relay to.
        pushNote = ` · ${fresh.length} new high-severity, push not sent (${push.reason})`;
      } else if (relayFailedPush(db, env, title, body, now)) {
        // ntfy rejected the direct push, but the relay queue accepted it —
        // Sean's Mac will actually deliver it, so this is handled, not
        // failed. The signal is marked notified now (same as a direct
        // success) so the next hourly run doesn't re-queue a duplicate.
        markNotified(db, fresh);
        pushNote = ` · ${fresh.length} new high-severity, relayed via Mac (ntfy status ${push.status}, direct push unreachable)`;
      } else {
        pushFailed = true;
        pushNote = ` · ${fresh.length} new high-severity, push failed (ntfy status ${push.status})`;
      }
    } catch (err) {
      const why = describeFetchError(err);
      if (relayFailedPush(db, env, title, body, now)) {
        markNotified(db, fresh);
        pushNote = ` · ${fresh.length} new high-severity, relayed via Mac (${why})`;
      } else {
        pushFailed = true;
        pushNote = ` · ${fresh.length} new high-severity, push failed (${why})`;
      }
    }
  }
  return {
    ok: true,
    pushFailed,
    summary: `${briefingText(signals)}${pushNote}`,
    data: { signals, fresh },
  };
}

async function chiefOfStaffRun(): Promise<AgentRunResult> {
  return chiefOfStaffRunWith(getDb(), runtimeEnv());
}

const label = (r: AgentRunResult) => (r.ok ? 'LIVE' : 'DOWN');

export const realAgents: RuntimeAgent[] = [
  // ── Command ──────────────────────────────────────────────────────────
  {
    id: 'conductor',
    name: 'Conductor',
    description: 'Broadcast fan-out across the roster; reports fleet size and run history from the DB.',
    departmentId: 'dept-tech',
    async run() {
      const db = getDb();
      const agents = db.agents.all();
      const runs = db.agentRuns.recent(50);
      const lastBroadcast = db.broadcasts.recent(1)[0] ?? null;
      return {
        ok: true,
        summary: `${agents.length} agents on the roster · ${runs.length} recent runs logged · last broadcast ${
          lastBroadcast ? lastBroadcast.createdAt.slice(0, 10) : 'never'
        }`,
        data: { agents: agents.length, recentRuns: runs.length },
      };
    },
  },

  // ── Comms: one instance, email + calendar workers ────────────────────
  {
    id: 'comms-agent',
    name: 'Comms Agent',
    description: 'Aggregates the Gmail and Calendar workers that feed the unified /comms view.',
    departmentId: 'dept-comms',
    async run() {
      const [gmail, calendar] = await Promise.all([gmailRun(), calendarRun()]);
      const live = [gmail, calendar].filter((r) => r.ok).length;
      return {
        ok: live > 0,
        summary: `${live}/2 channels live → /comms · Gmail ${label(gmail)} · Calendar ${label(calendar)}`,
        data: { gmail, calendar },
      };
    },
    chatTools(): LlmToolSpec[] {
      return [
        {
          name: 'getUnreadEmail',
          description:
            'Read-only unread-mail counts (and any read error) across the connected IMAP inboxes. Honest "no inboxes configured" when none are set.',
          parameters: z.object({}),
          execute: async () => gmailRun(),
        },
        {
          name: 'getUpcomingEvents',
          description:
            'Read-only upcoming events across the connected ICS/CalDAV calendars. Honest "no calendars configured" when none are set.',
          parameters: z.object({}),
          execute: async () => calendarRun(),
        },
      ];
    },
  },
  { id: 'gmail-worker', name: 'Gmail Worker', description: 'Unread counts and recent mail from up to four IMAP inboxes.', departmentId: 'dept-comms', run: gmailRun },
  { id: 'calendar-worker', name: 'Calendar Worker', description: 'Upcoming events from ICS/CalDAV calendar feeds.', departmentId: 'dept-comms', run: calendarRun },

  // ── Knowledge ────────────────────────────────────────────────────────
  {
    id: 'data-agent',
    name: 'Data Agent',
    description: 'Answers questions from the knowledge layer via the brain provider abstraction; grep search over the bundled markdown store today, upgradeable to a vector provider later.',
    departmentId: 'dept-tech',
    async run() {
      const status = await getBrainProvider().status();
      return {
        ok: status.connected,
        summary: `Knowledge provider: ${status.provider} · ${status.detail}`,
        data: status,
      };
    },
    async respond(message: string) {
      const results = await getBrainProvider().search(message);
      if (results.length === 0) {
        return { ok: false, summary: `Nothing in the knowledge layer matches "${message.slice(0, 80)}"` };
      }
      return {
        ok: true,
        summary: results
          .slice(0, 3)
          .map((r) => `${r.title}: ${r.snippet.slice(0, 100)}`)
          .join(' · '),
        data: results,
      };
    },
    chatTools(): LlmToolSpec[] {
      return [
        {
          name: 'searchKnowledge',
          description:
            'Search the knowledge layer and return the top matching notes. Read-only. Empty until a brain provider is configured.',
          parameters: z.object({ query: z.string().describe('what to look up in the knowledge base') }),
          execute: async (args) => {
            const query = typeof args.query === 'string' ? args.query : '';
            const results = await getBrainProvider().search(query);
            return results.slice(0, 5);
          },
        },
      ];
    },
  },

  {
    id: 'chief-of-staff',
    name: 'Chief of Staff',
    description:
      'Watches the funnel, QuickBooks, and inboxes for hot leads, overdue invoices, and unread work mail; pushes only genuinely new high-severity signals via ntfy.',
    departmentId: 'dept-tech',
    run: chiefOfStaffRun,
    chatTools(): LlmToolSpec[] {
      return [
        {
          name: 'getBusinessSignals',
          description:
            'Read-only live pull of what needs attention right now: hot/fading leads from the funnel attention model, overdue/open QuickBooks invoices, and unread work-lane email. Any source that is not configured just contributes nothing — never invented.',
          parameters: z.object({}),
          execute: async () => gatherSignals(getDb(), runtimeEnv()),
        },
      ];
    },
  },

  // ── Sales: the funnel's front door ───────────────────────────────────
  {
    id: 'allo-pulse',
    name: 'Allo Pulse',
    description: 'Pulls the Allo (248) 717-1417 call log and files inbound lead calls into the AAC pipeline.',
    departmentId: 'dept-sales',
    run: alloRun,
  },
  {
    id: 'website-pulse',
    name: 'Website Pulse',
    description:
      'Reads FormSubmit.co website-form notification emails from the connected inbox and files them into the AAC pipeline — no new credentials, reuses the Comms inbox.',
    departmentId: 'dept-sales',
    run: websitePulseRun,
  },

  // ── Marketing/Growth ─────────────────────────────────────────────────
  {
    id: 'social-pulse',
    name: 'Social Pulse',
    description: 'Publishes posts queued on the Social tab through OneUp (real accounts, real API — see docs/oneup-integration.md).',
    departmentId: 'dept-marketing-growth',
    run: socialPulseRun,
  },

  // ── Finance ──────────────────────────────────────────────────────────
  {
    id: 'quickbooks-pulse',
    name: 'QuickBooks Pulse',
    description: 'Reports the QuickBooks connection state; month-to-date income/expenses once connected.',
    departmentId: 'dept-finance',
    run: quickbooksRun,
    chatTools(): LlmToolSpec[] {
      return [
        {
          name: 'getFinancialSnapshot',
          description:
            'Read-only QuickBooks snapshot: company name, month-to-date income (payments received) and expenses (purchases), and open (unpaid) invoices. Null/empty fields mean QuickBooks is not connected or unreachable — never invented.',
          parameters: z.object({}),
          execute: async () => {
            const env = runtimeEnv();
            const [company, income, expenses, invoices] = await Promise.all([
              qboCompanyName(env),
              monthToDateIncome(env),
              monthToDateExpenses(env),
              openInvoices(env),
            ]);
            return { company, monthToDateIncome: income, monthToDateExpenses: expenses, openInvoices: invoices };
          },
        },
      ];
    },
  },
];
