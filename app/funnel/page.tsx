import Link from 'next/link';
import { getDb } from '@/lib/data';
import {
  attentionQueue,
  funnelSummary,
  journeyMeta,
  splitFunnelJourneys,
  decayFactor,
  DECAY_DAYS,
  ALL_FUNNEL_STAGES,
  stagesFor,
  CHANNEL_GLYPHS,
} from '@/lib/funnel';
import { funnelSpaceModel, isWon } from '@/lib/funnel';
import { funnelRadialModel } from '@/lib/funnel-radial';
import { lastMessageFor } from '@/lib/funnel-contact';
import { gatherCommsFeed } from '@/lib/comms-feed';
import type { CommsItem } from '@/lib/comms';
import { FunnelRadialLazy, FunnelSpaceLazy } from '@/components/FunnelGraphsLazy';
import AlloSyncButton from '@/components/AlloSyncButton';
import WebsiteSyncButton from '@/components/WebsiteSyncButton';
import StageAdvanceControl from '@/components/StageAdvanceControl';
import MilestoneControl from '@/components/MilestoneControl';
import { alloConfigured } from '@/lib/connectors/allo';
import { parseInboxConfigs } from '@/lib/connectors/email';
import { runtimeEnv } from '@/lib/creds';
import { resolveBusinessFilter } from '@/lib/business-filter';
import { readBusinessFilterCookie } from '@/lib/business-filter-server';
import { Badge, SectionHead } from '@/components/terminal';
import {
  FunnelStageSchema,
  FunnelBusinessSchema,
  type FunnelJourney,
  type FunnelStage,
  type FunnelTouch,
  type FunnelBusiness,
} from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const BUSINESS_TABS: { id: FunnelBusiness | 'all'; label: string }[] = [
  { id: 'all', label: 'All clients' },
  { id: 'aac', label: 'AAC' },
  { id: 'apps', label: 'Apps' },
];

function usd(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

// Business dot colors — the AAC brand pair from lib/businesses.ts.
const BUSINESS_COLORS: Record<FunnelBusiness, string> = {
  aac: '#191265',
  apps: '#C9A84C',
};

function businessColor(id: FunnelBusiness): string {
  return BUSINESS_COLORS[id] ?? 'var(--accent)';
}

function businessLabel(id: FunnelBusiness): string | undefined {
  return BUSINESS_TABS.find((t) => t.id === id)?.label;
}

function TouchChip({ touch }: { touch: FunnelTouch }) {
  return (
    <span
      className="inline-flex max-w-[260px] items-center gap-1.5 rounded-sm-t border border-os-border bg-os-surface2 px-2 py-1"
      title={`${touch.stage} · via ${touch.source} · ${touch.at}`}
    >
      <span className="shrink-0 font-mono text-[10px] text-os-accent">{CHANNEL_GLYPHS[touch.channel] ?? '·'}</span>
      <span className="truncate text-[11px] text-os-muted">{touch.label}</span>
      <span className="shrink-0 font-mono text-[9.5px] text-os-dim">{touch.at.slice(5)}</span>
    </span>
  );
}

const RELATIONSHIP_VAR: Record<FunnelJourney['relationship'], string> = {
  hot: 'var(--funnel-hot)',
  warm: 'var(--funnel-warm)',
  cold: 'var(--funnel-cold)',
};

/** Compact outreach links — only the channels this lead actually has. */
function ContactActions({ journey }: { journey: FunnelJourney }) {
  const digits = journey.phone?.replace(/[^\d]/g, '');
  return (
    <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide">
      {journey.email && (
        <a href={`mailto:${journey.email}`} title={journey.email} className="text-os-muted hover:text-os-accent">
          email
        </a>
      )}
      {digits && (
        <a
          href={`https://wa.me/${digits}`}
          target="_blank"
          rel="noopener noreferrer"
          title={journey.phone ?? undefined}
          className="text-os-muted hover:text-os-accent"
        >
          wa
        </a>
      )}
      {journey.phone && (
        <a href={`sms:${journey.phone}`} title={journey.phone} className="text-os-muted hover:text-os-accent">
          sms
        </a>
      )}
      {journey.url && (
        <a
          href={journey.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-os-dim hover:text-os-accent"
        >
          crm↗
        </a>
      )}
      {!journey.email && !journey.phone && !journey.url && <span className="text-os-dim">—</span>}
    </span>
  );
}

/** One attention row — clicking it pins that lead's dossier in the canvas. */
function AttentionRow({
  journey,
  now,
  href,
}: {
  journey: FunnelJourney;
  now: Date;
  href: string;
}) {
  const meta = journeyMeta(journey, now);
  const decay = decayFactor(meta.daysSinceLastTouch, journey.status);
  const stageLabel = ALL_FUNNEL_STAGES.find((s) => s.id === journey.status)?.label ?? journey.status;
  return (
    <Link
      href={href}
      className="group flex items-baseline gap-2 border-t border-os-border px-2.5 py-1.5 transition-colors hover:bg-os-surface2"
    >
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold group-hover:text-os-accent">
        {journey.person ?? journey.name}
      </span>
      {journey.company && (
        <span className="hidden max-w-[120px] truncate text-[10.5px] text-os-dim sm:inline">{journey.company}</span>
      )}
      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-wide text-os-dim">{stageLabel}</span>
      <span
        className="shrink-0 font-mono text-[10px]"
        style={
          decay > 0
            ? { color: `color-mix(in oklab, var(--err) ${Math.round(Math.sqrt(decay) * 85)}%, var(--text-2))` }
            : { color: 'var(--text-3)' }
        }
      >
        {meta.daysSinceLastTouch}d
      </span>
      <span className="shrink-0 font-mono text-[10px] text-os-muted">{journey.likelihood}%</span>
      {(journey.amountUsd ?? 0) > 0 && (
        <span className="shrink-0 font-mono text-[10px] text-os-muted">{usd(journey.amountUsd ?? 0)}</span>
      )}
    </Link>
  );
}

const agoDays = (ts: string, now: Date): string => {
  const d = Math.max(0, Math.floor((now.getTime() - Date.parse(ts)) / 86_400_000));
  return d === 0 ? 'today' : `${d}d ago`;
};

/** Two table rows per client: the formatted data line, then their touches. */
function JourneyTableRows({
  journey,
  now,
  lastMsg,
}: {
  journey: FunnelJourney;
  now: Date;
  /** undefined = lookup not run (no segment selected) · null = no thread found */
  lastMsg?: CommsItem | null;
}) {
  const stageLabel = ALL_FUNNEL_STAGES.find((s) => s.id === journey.status)?.label ?? journey.status;
  const won = isWon(journey.status);
  const meta = journeyMeta(journey, now);
  const decay = decayFactor(meta.daysSinceLastTouch, journey.status);
  const lane = journey.touches[0]?.source ?? 'manual';
  return (
    <>
      <tr className="border-t border-os-border">
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: businessColor(journey.business) }}
              title={businessLabel(journey.business)}
            />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold" title={journey.name}>
                {journey.person ?? journey.name}
              </span>
              {journey.company && (
                <span className="block truncate text-[10px] text-os-dim">{journey.company}</span>
              )}
            </span>
          </span>
        </td>
        <td className="px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-wide">
          <span className={won ? 'text-os-ok' : meta.state === 'stalled' ? 'text-os-err' : 'text-os-muted'}>
            {stageLabel}
          </span>
          <StageAdvanceControl journey={{ id: journey.id, business: journey.business, status: journey.status }} />
          <MilestoneControl journey={{ id: journey.id, business: journey.business, status: journey.status }} />
        </td>
        <td
          className={`px-3 py-2.5 font-mono text-[11px] ${meta.state === 'stalled' && decay === 0 ? 'text-os-err' : 'text-os-dim'}`}
          style={
            decay > 0
              ? { color: `color-mix(in oklab, var(--err) ${Math.round(Math.sqrt(decay) * 85)}%, var(--text-2))` }
              : undefined
          }
        >
          {meta.daysSinceLastTouch}d
        </td>
        <td className="px-3 py-2.5 font-mono text-[10.5px] capitalize" style={{ color: RELATIONSHIP_VAR[journey.relationship] }}>
          {journey.relationship}
        </td>
        <td className="px-3 py-2.5 font-mono text-[11px] text-os-muted">{journey.likelihood}%</td>
        <td className="px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-wide text-os-dim">{lane}</td>
        <td className="max-w-[220px] px-3 py-2.5">
          {won ? (
            <span className="block truncate font-mono text-[10.5px] text-os-ok" title={journey.product ?? undefined}>
              {usd(journey.amountUsd ?? 0)}
              {journey.product ? ` · ${journey.product}` : ''}
            </span>
          ) : (
            <span className="font-mono text-[10.5px] text-os-dim">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <ContactActions journey={journey} />
        </td>
      </tr>
      <tr>
        <td colSpan={8} className="px-3 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {journey.touches.map((t, i) => (
              <span key={t.id} className="flex items-center gap-1.5">
                {i > 0 && <span className="font-mono text-[10px] text-os-dim">→</span>}
                <TouchChip touch={t} />
              </span>
            ))}
            {!won && <span className="font-mono text-[10px] text-os-dim">→ …</span>}
            {lastMsg !== undefined && (
              <span className="ml-auto flex min-w-0 items-center gap-1.5 font-mono text-[10px]">
                <span className="shrink-0 uppercase tracking-wide text-os-dim">last msg</span>
                {lastMsg ? (
                  <span className="min-w-0 truncate text-os-muted" title={lastMsg.preview}>
                    via {lastMsg.source} · {agoDays(lastMsg.ts, now)} · “{lastMsg.preview.slice(0, 60)}”
                  </span>
                ) : (
                  <span className="text-os-dim">no thread on record</span>
                )}
              </span>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

export default async function FunnelPage(
  props: {
    searchParams?: Promise<{ business?: string; view?: string; stage?: string; layout?: string; lead?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  // The business tabs used to be their own disconnected toggle — no fallback
  // to the Topbar's cookie at all, so switching AAC/Apps/Combined while
  // already on /funnel with no ?business= param did nothing. Fixed:
  // ?business= still wins when present (bookmarking/deep-linking a specific
  // view keeps working exactly as before), but with no param present at all
  // the page now defaults to the shared cookie's current selection instead
  // of hardcoding "All clients" (lib/business-filter.ts, same mechanism
  // /org already reads).
  const businessParam = searchParams?.business;
  const parsedBusiness = FunnelBusinessSchema.safeParse(businessParam);
  const cookieFilter = resolveBusinessFilter(await readBusinessFilterCookie());
  const business = parsedBusiness.success
    ? parsedBusiness.data
    : businessParam === undefined && cookieFilter !== 'all'
      ? cookieFilter
      : undefined;
  const view = searchParams?.view === 'archive' ? 'archive' : 'live';
  const stageParsed = FunnelStageSchema.safeParse(searchParams?.stage);
  const stage = stageParsed.success ? stageParsed.data : undefined;
  // Two ways to see the same journeys: hubs left → right, or the circle
  // running outside → in (acquisition wedges around the rim, the win center).
  // The radial's rim is AAC's real lead-source taxonomy (phone/Google/
  // website/social/referral/word-of-mouth, lib/funnel-radial.ts) — Apps has
  // no acquisition-channel data yet, so radial is AAC-only: Apps forces flow
  // regardless of the ?layout= param rather than rendering wedges that don't
  // mean anything for it.
  const requestedLayout = searchParams?.layout === 'radial' ? 'radial' : 'flow';
  const layout = business === 'apps' ? 'flow' : requestedLayout;
  const href = (
    v: FunnelBusiness | undefined,
    w: 'live' | 'archive',
    s: FunnelStage | undefined = stage,
    l: 'flow' | 'radial' = layout,
    leadId?: string,
  ) => {
    const params = new URLSearchParams();
    if (v) params.set('business', v);
    if (w === 'archive') params.set('view', 'archive');
    if (s) params.set('stage', s);
    if (l === 'radial') params.set('layout', 'radial');
    if (leadId) params.set('lead', leadId);
    const qs = params.toString();
    return qs ? `/funnel?${qs}` : '/funnel';
  };

  const now = new Date();
  // The funnel repo is the one source today — real leads land there via the
  // Allo call log, a CRM sync, or manual entry when those get wired.
  const allJourneys = getDb().funnel.journeys(business);
  // Quiet past DECAY_DAYS → out of the space, into the archive tab.
  const { active: journeys, archived } = splitFunnelJourneys(allJourneys, now);
  // Scoped to the selected business's real pipeline — AAC's 8 stages, Apps'
  // 6 — so switching the tab never leaves the summary/canvas reading against
  // the wrong backbone (stagesFor falls back to AAC's when business is unset,
  // the shared "All clients" tab).
  const summary = funnelSummary(journeys, stagesFor(business));
  const radial = layout === 'radial' ? funnelRadialModel(journeys, now, stagesFor(business)) : null;
  const spaceNodes = layout === 'flow' ? funnelSpaceModel(journeys, now, stagesFor(business)) : null;
  // ?lead= (attention-rail clicks) pins that lead's dossier in the canvas
  const lead = journeys.some((j) => j.id === searchParams?.lead) ? searchParams?.lead : undefined;
  const attention = attentionQueue(journeys, now);

  // Segment select: the table narrows to one stage; with a bounded row set we
  // can afford the live comms lookup (last message per lead, honest on miss).
  const tableJourneys = stage ? journeys.filter((j) => j.status === stage) : journeys;
  const stageCounts = new Map<FunnelStage, number>();
  for (const j of journeys) stageCounts.set(j.status, (stageCounts.get(j.status) ?? 0) + 1);
  let commsFeed: CommsItem[] | null = null;
  if (stage && tableJourneys.length > 0) {
    commsFeed = await gatherCommsFeed(200).catch(() => null);
  }

  return (
    <div>
      {/* Camera-ready: two slim rows, then the space owns the viewport. */}
      <header className="mb-2 flex items-end justify-between gap-4">
        <h1 className="text-[25px] font-bold uppercase leading-[1.1] tracking-[0.06em]">Funnel</h1>
        <div className="flex shrink-0 items-center gap-2">
          <AlloSyncButton configured={alloConfigured(runtimeEnv())} />
          <WebsiteSyncButton configured={parseInboxConfigs(runtimeEnv()).length > 0} />
          {journeys.length === 0 && (
            <Badge tone="warn" ghost>
              no leads recorded yet
            </Badge>
          )}
          <Badge tone="accent">
            {summary.converted}/{summary.clients} won · {usd(summary.revenueUsd)}
          </Badge>
        </div>
      </header>

      {/* one control line: business filter · view toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5">
          {BUSINESS_TABS.map((tab) => {
            const active = (business ?? 'all') === tab.id;
            return (
              <Link
                key={tab.id}
                href={href(tab.id === 'all' ? undefined : (tab.id as FunnelBusiness), view)}
                title={tab.id === 'apps' ? 'Discovered → installed → activated → trial → subscribed → retained' : undefined}
                className={`rounded-sm-t border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  active
                    ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                    : 'border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted'
                }`}
              >
                {tab.id !== 'all' && (
                  <span
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ background: businessColor(tab.id as FunnelBusiness) }}
                  />
                )}
                {tab.label}
              </Link>
            );
          })}
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide">
          <Link
            href={href(business, 'live', stage, 'flow')}
            title="Open space left → right — every lead orbits the stage it's in now"
            className={layout === 'flow' && view === 'live' ? 'text-os-accent' : 'text-os-dim hover:text-os-muted'}
          >
            flow
          </Link>
          <span className="text-os-dim">·</span>
          {business === 'apps' ? (
            <span
              title="Radial models AAC's real lead-source wedges (phone, Google, website, social, referral) — not defined for Apps yet"
              className="cursor-not-allowed text-os-dim opacity-50"
            >
              radial
            </span>
          ) : (
            <Link
              href={href(business, 'live', stage, 'radial')}
              title="Circle, outside → in — center is the win"
              className={layout === 'radial' && view === 'live' ? 'text-os-accent' : 'text-os-dim hover:text-os-muted'}
            >
              radial
            </Link>
          )}
          <span className="mx-1 h-3 w-px bg-os-border" />
          <Link
            href={href(business, 'live')}
            className={view === 'live' ? 'text-os-accent' : 'text-os-dim hover:text-os-muted'}
          >
            live funnel
          </Link>
          <span className="text-os-dim">·</span>
          <Link
            href={href(business, 'archive')}
            className={view === 'archive' ? 'text-os-accent' : 'text-os-dim hover:text-os-muted'}
          >
            archive ({archived.length})
          </Link>
        </span>
      </div>

      {/* The space — every node is a lead travelling toward the win.
          Leads quiet past DECAY_DAYS decay into the archive tab. */}
      <section>
        <div className="rounded-lg-t border border-os-border bg-os-surface p-2">
          {view === 'archive' ? (
            archived.length === 0 ? (
              <p className="py-6 text-center font-mono text-[11.5px] text-os-dim">
                Nothing decayed — no lead has sat quiet past {DECAY_DAYS} days.
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
                    <th className="px-3 pb-1 pt-2 font-normal">Lead</th>
                    <th className="px-3 pb-1 pt-2 font-normal">Reached</th>
                    <th className="px-3 pb-1 pt-2 font-normal">Quiet</th>
                    <th className="px-3 pb-1 pt-2 font-normal">Likelihood</th>
                    <th className="px-3 pb-1 pt-2 font-normal">Last touch</th>
                    <th className="px-3 pb-1 pt-2 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {archived.map((j) => {
                    const meta = journeyMeta(j, now);
                    const last = j.touches[j.touches.length - 1];
                    return (
                      <tr key={j.id} className="border-t border-os-border text-os-dim">
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full opacity-60"
                              style={{ background: businessColor(j.business) }}
                            />
                            <span className="truncate text-[12px] text-os-muted">{j.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide">
                          {ALL_FUNNEL_STAGES.find((s) => s.id === j.status)?.label ?? j.status}
                          <StageAdvanceControl journey={{ id: j.id, business: j.business, status: j.status }} />
                          <MilestoneControl journey={{ id: j.id, business: j.business, status: j.status }} />
                        </td>
                        <td className="px-3 py-2 font-mono text-[10.5px]">{meta.daysSinceLastTouch}d</td>
                        <td className="px-3 py-2 font-mono text-[10.5px]">{j.likelihood}%</td>
                        <td className="max-w-[300px] truncate px-3 py-2 text-[11px]" title={last?.label}>
                          {last?.label ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {j.url && (
                            <a
                              href={j.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[9.5px] uppercase tracking-wide text-os-dim hover:text-os-accent"
                            >
                              attio ↗
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : radial ? (
            <FunnelRadialLazy model={radial} initialLeadId={lead} />
          ) : spaceNodes ? (
            <FunnelSpaceLazy nodes={spaceNodes} summary={summary} stages={stagesFor(business)} initialLeadId={lead} />
          ) : null}
        </div>
      </section>

      {/* What to act on today — the funnel answering a question. Every row
          click pins that lead's dossier in the canvas above. */}
      {view === 'live' && (attention.pushNow.length > 0 || attention.saveNow.length > 0) && (
        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg-t border border-os-border bg-os-surface">
            <div className="flex items-baseline justify-between px-2.5 py-2">
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] text-os-accent">
                push now
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wide text-os-dim">
                hot + moving — close them
              </span>
            </div>
            {attention.pushNow.length === 0 ? (
              <p className="border-t border-os-border px-2.5 py-2 font-mono text-[10px] text-os-dim">
                no hot leads in motion right now
              </p>
            ) : (
              attention.pushNow.map((j) => (
                <AttentionRow key={j.id} journey={j} now={now} href={href(business, view, stage, layout, j.id)} />
              ))
            )}
          </div>
          <div className="rounded-lg-t border border-os-border bg-os-surface">
            <div className="flex items-baseline justify-between px-2.5 py-2">
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] text-os-err">
                save now
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wide text-os-dim">
                fading toward the archive — highest likelihood first
              </span>
            </div>
            {attention.saveNow.length === 0 ? (
              <p className="border-t border-os-border px-2.5 py-2 font-mono text-[10px] text-os-dim">
                nothing fading — every lead is fresh
              </p>
            ) : (
              attention.saveNow.map((j) => (
                <AttentionRow key={j.id} journey={j} now={now} href={href(business, view, stage, layout, j.id)} />
              ))
            )}
          </div>
        </section>
      )}

      {/* The same clients as formatted data — pick a segment, contact them */}
      <section className="mt-8">
        <SectionHead label="Journey data" count={`${tableJourneys.length}`} />
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Link
            href={href(business, view, undefined)}
            className={`rounded-sm-t border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
              !stage
                ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                : 'border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted'
            }`}
          >
            All segments
          </Link>
          {/* Filter chips read the active business's own pipeline — AAC's 8
              stages, Apps' 6 (or AAC's as the shared backbone on "All"). */}
          {stagesFor(business).map((s, i) => {
            const active = stage === s.id;
            return (
              <Link
                key={s.id}
                href={href(business, view, active ? undefined : s.id)}
                className={`rounded-sm-t border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  active
                    ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                    : 'border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted'
                }`}
              >
                <span
                  className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ background: `var(--funnel-s${i})` }}
                />
                {s.label} ({stageCounts.get(s.id) ?? 0})
              </Link>
            );
          })}
          {stage && !commsFeed && tableJourneys.length > 0 && (
            <span className="font-mono text-[10px] text-os-dim">comms feed unavailable — last messages hidden</span>
          )}
        </div>
        {tableJourneys.length === 0 ? (
          <p className="rounded-lg-t border border-dashed border-os-border bg-os-surface px-4 py-5 text-center font-mono text-[11.5px] text-os-dim">
            No leads in this segment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg-t border border-os-border bg-os-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
                  <th className="px-3 pb-1 pt-3 font-normal">Client</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Stage</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Quiet</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Relationship</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Likelihood</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Entry</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Value</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Contact</th>
                </tr>
              </thead>
              <tbody>
                {tableJourneys.map((j) => (
                  <JourneyTableRows
                    key={j.id}
                    journey={j}
                    now={now}
                    lastMsg={commsFeed ? lastMessageFor(j, commsFeed) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
