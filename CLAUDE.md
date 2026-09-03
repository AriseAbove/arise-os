# ARISE OS

The Arise Above business operating system — one command center for Arise Above
Construction (AAC) and the Arise Above Apps portfolio. Runs on port **4100**.

## Commands

```bash
npm run dev        # dev server → http://localhost:4100
npm test           # vitest suite (must stay green)
npm run typecheck  # tsc --noEmit
npm run seed       # re-seed data/founder-os.db (idempotent)
npm run build && npm start
```

## Architecture: repo-layer, honest-status

The load-bearing design rule. Every page and API route reads through the
repository layer — never query SQLite directly from a page or route:

- `lib/data.ts` — `getDb()` app singleton; seeds on first touch and re-seeds
  once whenever `SEED_VERSION` (lib/seed.ts) bumps. Purge clauses in the seed
  only ever remove rows the seed itself created — real recorded data survives.
- `lib/db.ts` — `openDb()` + repos (`departments`, `agents`, `funnel`, …)
- `lib/seed.ts` — the honest baseline. NO invented data: no fake clients,
  followers, dollars, staff, or work items. If a seed entry isn't real or an
  obviously-labeled structural placeholder, it doesn't ship.
- `lib/schemas.ts` — Zod schemas validate every row on the way OUT of the DB

New data = new repo method + Zod schema + seed entry + test.

## The business lens

`lib/businesses.ts` defines the two businesses (`aac`, `apps`). The Topbar's
AAC / Apps / Combined switcher persists as a cookie (`lib/business-filter.ts`
client-safe + `lib/business-filter-server.ts` for `cookies()`); server
components read it per request. Business-scoped repo methods take an explicit
business argument.

## The funnel

Two real pipelines, one shared `FunnelStage` enum (`lib/schemas.ts`) scoped
per journey by its `business` field (`lib/funnel.ts`):

- AAC — a sales pipeline: `inquiry → follow_up → walkthrough_scheduled →
  estimate_sent → negotiation → contract_signed → active_project →
  complete_paid`. "Won" = contract_signed onward.
- Apps — decided 2026-08-14: Sean builds and publishes the apps himself, so
  it is a product/acquisition pipeline, not a sales one: `discovered →
  installed → activated → trial_started → subscribed → retained`. "Won" =
  subscribed onward.

`stagesFor(business)` returns the right stage set; `ALL_FUNNEL_STAGES` is the
safe flat lookup for label rendering regardless of business (ids never
collide). `isWon`/`journeyMeta`/`funnelSummary`/`funnelSpaceModel` all work
across both pipelines. Do not hardcode the AAC stage count elsewhere on the
assumption it is the only pipeline. Colors are `--funnel-s0..s7` per theme in
`app/globals.css` (Apps' 6 stages reuse the first 6 tokens).

**Third funnel writer: Claude/Cowork sessions, closing the email-leads gap
(2026-08-24).** A handoff doc (`ARISE_OS_HANDOFF_REQUEST_20260824_
EmailLeadsGap.md`) documented that a job originating or moving entirely by
email/referral — never an Allo call, never a website form submission — was
structurally invisible to `/funnel`. Confirmed with two real cases: the
2468 Ford St 203(k) rehab (Titana Hampton — a $3,650 lender-approved
furnace change order sitting in `leads.json` with no funnel record at all)
and a garage-extension referral (Kim Childers, logged in `leads.json` on
2026-08-22, estimate written and sent 2026-08-23 — also absent from
`/funnel`). Root cause: only two ingestion paths existed
(`sync-allo`/`sync-website`), and Sean's real day-to-day runs almost
entirely through Claude/Cowork sessions producing estimates, proposals, and
change orders — a path with no funnel-writing convention at all. Considered
and rejected: a manual "add to funnel" UI form — it has the same
forget-to-use-it failure mode as the gap itself, just moved to a different
button. Fixed instead with `lib/funnel-card.ts`'s `upsertFunnelCard()` +
`POST /api/funnel/card`, a third writer alongside Allo/website that a
Claude session calls as the standing last step of producing an
estimate/proposal/change order — the same way it's already expected to use
the WHITE GLOVE template. Unlike the other two importers, this one
deliberately DOES move `status` (Sean, via the session, is the one deciding
the stage — not an automated call/form log). Dedupe mirrors the website
importer (phone-first, email-second) with a weak name+business fallback for
a job logged before a phone/email is on file (e.g. a referral). Added
`FunnelSourceSchema`'s `'claude'` value and a new `costUsd` field on
`FunnelContact`/`FunnelJourney` (actual/estimated job cost, independent of
`amountUsd`) so margin — "how much we did, what our profit was," Sean's own
framing — becomes computable per job, not just revenue. Gmail/website
auto-ingestion stays a lower-priority backstop for the rare job that never
touches a Claude session. Tests in `tests/funnel-card.test.ts` and
`tests/funnel-card-route.test.ts`. The two real cases above are queued for
backfill via this same endpoint once confirmed reachable in production —
not fabricated here, per HONESTY.

**Apps funnel presence (2026-08-21 fix).** A dashboard review found the
`rm-apps-funnel` roadmap item's "done" claim overstated what had shipped —
the stage model was real (above), but `app/funnel/page.tsx` called
`funnelSummary`/`funnelSpaceModel`/`funnelRadialModel` with no `stages` arg,
so every one of them silently defaulted back to `AAC_FUNNEL_STAGES` even with
Apps selected, and `FunnelSpace` imported `FUNNEL_STAGES` (AAC's) at module
scope for its hub geometry regardless of business. Invisible today only
because Apps has zero live journeys (`nodes.length === 0` short-circuited
before any hub rendered) — the bug was real, just unobserved. Fixed: the page
now threads `stagesFor(business)` through every model call, and
`FunnelSpace` takes a `stages` prop and renders its **real** hub row (Apps'
Discovered → Retained, honestly all zero) instead of swapping the canvas for
a stage-less "No journeys" message. `FunnelRadial` stays AAC-only on purpose
— its rim is AAC's real lead-source wedges (phone, Google, website, social,
referral; `lib/funnel-radial.ts`'s `ACQUISITIONS`), and Apps has no
acquisition-channel data to back an equivalent wedge set, so inventing one
would violate HONESTY. `/funnel` now forces `layout=flow` and disables the
radial toggle whenever `business=apps`, with a tooltip explaining why, rather
than rendering AAC's wedges under an Apps label. `lib/businesses.ts`'s
`areaAgents` also went from "AAC and Apps are both shared-infra-only, equally
sparse" to AAC carrying its own real crew — Allo Pulse + Website Pulse
(sales, both literally described as "the AAC pipeline" in their own seed
copy), QuickBooks Pulse (finances, the confirmed real books), and Comms
Agent/Gmail Worker/Calendar Worker (communication, Sean's real connected
inbox/calendar) — none of it invented, just finally wired from facts already
documented elsewhere in this file. Apps stays honestly shared-only (no
app-specific inbox/books/lead source exists yet); its `focus` list now says
so directly instead of leaving the sparse roster unexplained.

## Connectors & agents

Real integrations only — "real" means honest status reporting, nothing
pre-wired to any one machine.

- `lib/connectors/` — email.ts (4 IMAP slots), gcal.ts (ICS/CalDAV),
  quickbooks.ts (OAuth; tokens live in the DB via the `quickbooksAuth` repo,
  never in .env.local; PRODUCTION is the default environment —
  `QUICKBOOKS_ENVIRONMENT=sandbox` only for dev keys), allo.ts (the AI
  receptionist's call log via Allo's REST API — `ALLO_API_KEY`), llm.ts
  (Anthropic; stub for tests). Each returns an honest `ConnectorStatus` and
  goes live the moment its credentials land in `.env.local`
  (see `.env.example`).
- `lib/funnel-allo.ts` — Allo call log → pipeline import: inbound calls only,
  spam kept out, idempotent by call id, and a call never moves a journey's
  stage (stage changes are Sean's decision). Runs via the Allo Pulse agent,
  POST /api/funnel/sync-allo, or the sync button on /funnel.
- `lib/brain.ts` — the knowledge layer behind a provider abstraction: a local
  markdown store provider (point `BRAIN_STORE` at a folder — real grep search,
  folder overview; `lib/brain-dump.ts` captures write real files there) and a
  stub for tests. A vector provider slots in behind the same interface.
  `brainStorePath()` falls back to the bundled `knowledge/brain-store/` in the
  repo when no `BRAIN_STORE`/`GBRAIN_STORE` override is set — real markdown
  generated from the honest seed data (agents, SOPs, tools, people, pillars)
  via `npm run brain:docs` (`scripts/generate-brain-docs.ts`), so Knowledge
  search and the Data Agent have something real to search on day one with
  zero required config. Regenerate after a seed change with
  `BRAIN_DOCS_DIR="$(pwd)/knowledge/brain-store" npm run brain:docs` — it's
  idempotent and never clobbers a hand-edited file (one without the
  `generated: founder-os` marker).
- `lib/agents/runtime.ts` + `real.ts` — the roster: conductor, comms-agent,
  gmail-worker, calendar-worker, data-agent, quickbooks-pulse, allo-pulse. Every seeded
  agent row maps 1:1 to a `RuntimeAgent` with a real `run()` (enforced by
  seed tests). Runs persist to `agent_runs`, including a `pushFailed`
  column (`ok`/`pushFailed` are deliberately separate signals — a run can do
  its own job fine while a notification it tried to send genuinely fails;
  see below and `lib/analytics.ts`'s `runOutcomeCounts`).
- Chief of Staff / ntfy (2026-08-21 fix): production logged "push failed
  (fetch failed)" on every single hourly run with no way to tell why — Node's
  fetch throws a generic `TypeError: fetch failed` for any network-level
  failure and buries the real reason on `err.cause`. `describeFetchError`
  (`lib/chief-of-staff.ts`) now walks that cause chain into the summary
  instead of swallowing it, `sendNtfyPush` URL-encodes `NTFY_TOPIC` and
  attaches a 10s `AbortSignal` timeout so a hung connection fails fast
  instead of stalling the cron. Separately, `chiefOfStaffRunWith` always
  returned `ok: true` even when the push itself failed (intentional — a
  flaky push must never fail the run whose real job, gathering signals,
  worked), but Analytics' "Run outcomes" pie read `ok` straight into
  "Succeeded" with nothing else to go on, so 69 straight failed-push runs
  showed as ~99% OK. The run now also reports `pushFailed: true` on a
  genuine failure (not on the honest "NTFY_TOPIC not set" no-op), persisted
  alongside `ok`, and `/analytics` (`runOutcomeCounts`) buckets outcomes into
  Succeeded / Push failed / Failed instead of a two-way ok/fail split — a
  failing push is now visible on its own, not folded into full success.
- **Every real agent now has a real schedule (2026-08-21 fix).** A
  production review found only Chief of Staff had ever actually run on a
  schedule — the other 9 agents in `realAgents` had a real `run()` but no
  trigger, only the manual "Run" button on `/agents`, so production showed
  zero run history for most of the roster. `app/api/cron/chief-of-staff/
  route.ts` (single hardcoded agent) is now `app/api/cron/[agentId]/route.ts`
  — same `CRON_SECRET` bearer gate, same honest 501-when-not-configured
  behavior, but it validates `agentId` against `realAgents` and 404s on an
  unknown id instead of only ever running one agent. The URL
  `/api/cron/chief-of-staff` is unchanged (the dynamic route matches it via
  `agentId: "chief-of-staff"`), so `.github/workflows/chief-of-staff-check.yml`
  and its already-configured `ARISE_OS_URL`/`CRON_SECRET` repo secrets needed
  no changes. `.github/workflows/agent-cron-checks.yml` adds schedules for
  the rest of the roster, grouped by sensible cadence (see that file's header
  comment for the full reasoning per agent): gmail-worker/calendar-worker/
  comms-agent every 30 min business hours, allo-pulse/website-pulse (lead
  intake — a stale lead is a real cost) every 15 min business hours,
  data-agent/conductor (cheap pure-DB reads) hourly business hours,
  quickbooks-pulse twice daily, social-pulse every 4 hours around the clock.
  `middleware.ts`'s cron bypass prefix widened from `/api/cron/chief-of-staff`
  to `/api/cron` to cover the new per-agent paths — still just "let the
  route's own CRON_SECRET check run instead of the Basic Auth wall", not a
  new hole, since every id under that prefix is still bearer-gated by the
  route itself. No fake "last run" data was added anywhere — the fix is
  making runs actually happen, not backfilling history that didn't occur;
  each agent's real run history starts accumulating from whenever its
  workflow first fires after this ships. Tests in
  `tests/cron-agent-route.test.ts`.
- **Push-failure honesty didn't reach the badges, and "agents live" still
  conflated configured with actually-running (2026-08-21 fix).** A follow-up
  review of the two fixes above found both were real but incomplete.
  (1) `chiefOfStaffRunWith` and `runOutcomeCounts` (see above) correctly
  separate `ok` from `pushFailed` and `/analytics` already buckets a failed
  push into its own slice — but nothing downstream of the raw `agent_runs`
  row actually read `pushFailed`. `lib/agents/live-status.ts`'s
  `liveAgentStatus` judged Chief of Staff on `lastRun.ok` alone, so ~69
  straight runs whose push failed every single time still read "active"
  (green, pulsing "LIVE" dot) exactly like a fully healthy run; the OK/FAIL
  badges on `/agents`' roster cards, the home page's live ticker, its "Recent
  runs" list, and its per-agent roster rows all keyed off `.ok` only, so
  those runs rendered as plain "OK"; and `ActivityEventSchema`
  (`lib/schemas.ts`) didn't even carry `pushFailed` through
  `recentActivity()`, so the `/agents` Activity log dropped the signal
  entirely before it could be rendered. Fixed: `liveAgentStatus`'s
  cross-cutting rule now reads `ok:true, pushFailed:true` as `'idle'` (a
  third, amber state — genuinely ran, but couldn't deliver — distinct from
  green `'active'` and gray `'planned'`/no-creds); `ActivityEventSchema`
  gained `pushFailed` and `recentActivity()` passes it through; and every
  OK/FAIL badge (roster cards, live ticker, recent-runs list, per-agent rows,
  the pill that used to say "no creds" for a degraded-but-configured agent)
  is now a three-way OK / PUSH FAILED / FAIL, matching what `/analytics`
  already showed. (2) Separately, "X/10 agents live" (the home hero line via
  `lib/pulse-history.ts`'s `stateOfWorld`) and "/agents"'s "Active" tile both
  came from `liveAgentStatus`'s connector-configured check alone — true
  "wired up and able to run," but read by a business owner as "actually
  working," and as of this fix only 2 of the 10 real agents had ever actually
  executed since the cron schedules above went in (8 still showed "never
  run" per-agent). `lib/analytics.ts` gained `ranWithin`/`countRanWithin`
  (was an agent's most-recent run within the trailing 24h?) as the honest
  counterpart to "configured." The home hero line now reads e.g. "10/10
  configured · 2 ran in 24h" instead of "10/10 agents live," and no longer
  claims "All nominal" when agents are configured but haven't actually run;
  the "Agents configured" stat tile shows the ran-in-24h count alongside it;
  and `/agents`' stat strip splits its old single "Active" tile into
  "Configured" and "Ran (24h)." Tests: `tests/agents-live-status.test.ts`,
  `tests/activity.test.ts`, `tests/analytics.test.ts`,
  `tests/pulse-history.test.ts`.
- `lib/agents/chat.ts`'s `systemPromptFor` only tells an agent to "use your
  tools" when `agent.chatTools()` actually returns tools — otherwise it tells
  the model plainly that it has no live-data tools wired in and to never
  invent a tool call. Before this fix, every tool-less agent (all but
  data-agent) was told to "use your tools" anyway, and under the real Gateway
  provider the model would hallucinate fake tool-call syntax into its reply
  text trying to comply. `chief-of-staff` (`getBusinessSignals` → reuses
  `gatherSignals`), `comms-agent` (`getUnreadEmail`/`getUpcomingEvents` →
  reuse `gmailRun`/`calendarRun`), and `quickbooks-pulse`
  (`getFinancialSnapshot` → company name + MTD income/expenses + open
  invoices) now carry real `chatTools()` so chat can actually pull live data
  instead of only being able to describe what it would do.
- `/integrations` is the live Connections board (`GET /api/connections`).
- `app/api/voice/queue` (`lib/db.ts`'s `voiceQueue` repo, `voice_queue` table)
  — the relay behind Zoey, Sean's local voice loop
  (`~/.cowork_speaker/speaker_daemon.py`, see project memory's
  `project_cowork_speaker_voice_system.md`). Any Claude session POSTs a
  short reply; the daemon polls GET over the network and marks it
  consumed atomically (FIFO, no double-speak), so voice output no longer
  needs a fresh `device_request_folder_access` grant to
  `~/.cowork_speaker` every new cloud session — that per-session
  re-approval was exactly what Sean was trying to get away from. Gated by
  `VOICE_RELAY_SECRET`, same pattern as the Chief of Staff cron's
  `CRON_SECRET`. Consumed rows older than 24h are swept on every `popNext`
  so the table stays small.
- `app/api/aac-brain` (`lib/db.ts`'s `brainHealth` repo, `brain_health`
  table) — the health relay for the AAC Brain, Sean's SEPARATE Mac-based
  automation system (`~/.aac_brain`: lead-followup/ASC-response drafting,
  the Phase 9 action queue, worker-failure tracking). Not the same thing as
  this repo's own `/brain` knowledge layer above — the names collide, the
  concepts don't (see `app/aac-brain/page.tsx`'s header comment). Data
  arrives by push, not pull: `~/.aac_brain/stateio.py`'s `heartbeat()` POSTs
  a snapshot here every time it already pings its Healthchecks canary
  (`brain_health_push.py` on the Mac gathers `worker_failures.json` +
  `ACTION_QUEUE.json` + `.last_daily_summary`). Gated by `AAC_BRAIN_SECRET`,
  same pattern as `VOICE_RELAY_SECRET`. The dashboard tile (`app/page.tsx`)
  and `/aac-brain` detail page both read `getDb().brainHealth.latest()`
  directly — single latest-snapshot row, upserted per push, no fabricated
  trend line. 2026-08-20.
- `middleware.ts` — the app-wide login wall, added 2026-08-15 after a
  security review found that of the ~40 routes under `app/api`, only the
  cron and voice-relay routes checked anything at all; every other page
  and route (finances, funnel/CRM, comms including SENDING real email,
  `/api/keys`, `/api/connections/connect`) was reachable by anyone with
  the URL. It's a single HTTP Basic Auth gate in front of the whole app,
  gated by `APP_BASIC_AUTH_USER`/`APP_BASIC_AUTH_PASS` (see
  `.env.example`) — honest-by-default like every connector here: fails
  OPEN (no protection) until both are set, never silently claims a
  password wall that isn't configured. The cron and voice-relay routes
  are exempted (`BYPASS_PREFIXES`) since their callers are machines
  authenticating with their own bearer secret, not a browser that can do
  an interactive Basic Auth challenge. Tests in `tests/middleware.test.ts`.
- **OneUp status reconciliation (2026-08-21).** A dashboard review found
  `/social`, `/content`, and the publish queue all disagreeing with
  `/integrations` about whether OneUp was connected: `/integrations`
  (`allConnectorStatuses()` → `oneupStatus()`, honest env-var-present check)
  correctly said connected, but `/social` hardcoded "no posting source
  connected" regardless of real state, and `/content` rendered
  `db.agents.all()`'s static seed `status` (`'planned'`) for Social Pulse
  instead of computing it live like `/agents` and `/` already do via
  `lib/agents/live-status.ts`'s `liveAgentStatus()` — the fix both pages were
  missing, not a new status source. `/social`'s badge now reads the real
  OneUp state (`lib/social.ts`'s `socialSourceBadge()`) — connected still
  doesn't claim synced audience/post data exists, since no OneUp
  account/post sync is wired yet (`docs/oneup-integration.md`'s "what's NOT
  done" #2 — the audience chart still runs on the pre-existing "Zernio
  config" placeholder path, deliberately left alone). Root cause of "the
  publish queue never fires": Social Pulse (`social-pulse`) has a real
  `run()` (`socialPulseRun` in `lib/agents/real.ts`) but, unlike Chief of
  Staff, has no cron route or GitHub Actions workflow — it only runs when
  triggered manually from `/agents`. Wiring an actual schedule is scoped to
  the separate agent-scheduling task; `PostComposer`'s copy now says so
  honestly instead of implying an automatic "next run."
- **Finances page self-contradicting on expenses (2026-08-21 fix).** A live
  QA review of `/finances` found the same QuickBooks connection giving three
  different answers for August 2026's expenses on one page: the top summary
  cards said "$244 · MTD" and "−$244 net", the header badge said "+$0 net
  /mo", and the "Monthly expenses · by category" chart said "$0 ·
  QuickBooks · Aug 2026 — Nothing to chart yet". Root cause: the page never
  had a genuine two-source disagreement, it had one broken parser. The top
  cards' `$244` came from `monthToDateExpenses` (`lib/connectors/
  quickbooks.ts`), a raw sum of every QBO `Purchase` transaction this month
  regardless of which P&L account it posts to. The `$0` chart came from
  `monthToDateExpensesByCategory` → `parseProfitAndLossExpenseCategories`,
  which read QuickBooks' ProfitAndLoss report but — by original design,
  documented in its own test — walked only the report's `"Expenses"`
  section and explicitly ignored `"COGS"` (Cost of Goods Sold). For a
  construction company, real job/material costs routinely post to a COGS
  account rather than Expenses, so the $244 Purchase transaction counted
  fully toward the raw MTD sum but contributed nothing to the categorized
  chart — same real spend, two numbers, because "expenses" quietly meant two
  different things in two places on the same page. Fixed in two parts:
  `parseProfitAndLossExpenseCategories` now walks both the `"Expenses"` and
  `"COGS"` sections (`SPEND_SECTION_GROUPS`) — still ignoring Income/
  NetIncome, still an honest `[]` when a period genuinely has no spend — so
  the categorized total actually captures all real money spent, not just
  the operating-expense subset. And `app/finances/page.tsx` stopped
  computing "this month's expenses" twice: it no longer calls
  `monthToDateExpenses` at all (that raw-Purchase-sum function stays in
  `lib/connectors/quickbooks.ts` for its other real caller, the
  `quickbooks-pulse` agent's `getFinancialSnapshot` chat tool, which labels
  its own number "expenses (purchases)" honestly and isn't part of this
  page). Every "this month's expenses" figure on `/finances` — the top QBO
  card, the header badge's net, the summary tiles, and the category chart —
  now derives from the single categorized QuickBooks read, so a real number
  shows the same way everywhere it appears, and a real API failure shows an
  honest "—" instead of a silently-wrong number standing next to a correct
  one. Regression test in `tests/quickbooks.test.ts` (`MTD expenses vs
  category-chart total`) reproduces the exact $244-vs-$0 scenario with a
  COGS-coded Purchase transaction and asserts the two totals must agree.
- **Comms gravity WORK-lane overflow fix (2026-08-21).** A live QA pass on
  `/comms` found the Sources visualization's WORK column header honestly said
  "25" and 25 node elements genuinely existed in the DOM, but 12 of them sat
  above the visible column area (offsets around -92px/-46px at 1400×862) and
  were clipped and unclickable — PERSONAL (0) and MISC (15) rendered fine.
  Root cause: `CommsGravity.tsx` positioned each priority tier as one
  flex-wrap box anchored only by `bottom: laneBottomPct(tier)%`, with the
  box's own height left to grow unbounded with however many rows the wrap
  produced. `laneBottomPct` is a pure function of tier alone (verified
  on-canvas by its own existing test), but nothing ever bounded the box's
  *height* against how many nodes actually landed in it — so once a tier held
  enough items to need more rows than fit between its anchor and the lane's
  top edge, the extra rows pushed the box's top edge above y=0, where the
  lane's `overflow-hidden` (for its rounded corners) silently clipped them.
  WORK's untagged tier was the only one in production with enough items to
  need that many rows; MISC (15) and PERSONAL (0) never crossed the
  threshold, so the bug was invisible until a lane's count grew. Fixed in
  `lib/comms-gravity.ts`: `laneBandZone(priority)` gives every tier a fixed,
  non-overlapping vertical territory (`{ bottomPct, heightPct }`) that is a
  pure function of the tier alone, never of item count; `bandRowsWithOffsets`
  chunks a tier's items into fixed-width rows and places each row at a
  `bottomPct` that divides the tier's zone evenly across however many rows
  are actually needed — row pitch shrinks as the band grows, so the top row's
  offset is always strictly inside `[zone.bottomPct, zone.bottomPct +
  zone.heightPct)` regardless of node count. `CommsGravity.tsx` now renders
  each tier as N positioned rows via `bandRowsWithOffsets` instead of one
  unbounded flex-wrap box; `laneBottomPct` itself is unchanged (still used to
  derive each zone's floor). Regression tests in `tests/comms-gravity.test.ts`
  construct a 25-item single-tier band (and a stress sweep up to 200) and
  assert every row's `bottomPct` stays inside its tier's zone and therefore
  inside `[0, 100]`; `tests/comms-gravity-component.test.ts` pins that the
  component actually renders through `bandRowsWithOffsets` rather than the
  old unbounded-wrap anchor.
- **`/brain` internal contradictions, fixed (2026-08-21).** A live QA pass on
  `/brain` and the home page's summary cards found five places where the
  page's own copy and status chips disagreed with each other. All five
  turned out to be real defects, not "pick the more-true side and delete the
  other":
  1. *Search provider.* Body copy honestly said grep is the only provider,
     but `components/BrainViz.tsx` hardcoded "ZEROENTROPY · EMBEDDINGS" and
     "SUPABASE · 1240 PAGES · PAUSED" unconditionally, and `BrainQuery.tsx`'s
     busy line claimed "hybrid (local + zeroentropy)". Neither service has
     ever been wired in this codebase — no SDK dependency, no env var, no
     client code touches either; 1240 was a leftover default, not a real
     count. Root cause of the "verified"/"paused" framing specifically: the
     page's `fallbackActive` flag was computed as `!doctor.connected` (is
     the *local grep store* reachable) instead of the actually-relevant fact
     (is a *vector* provider wired) — so a healthy local store read as "the
     real hybrid backend is live, just paused." `lib/brain.ts`'s
     `BrainOverview.doctor` gained a `vector: boolean` field (always `false`
     for both real providers today, by design — a future provider flips it
     in its own `overview()`), `fallbackActive` is now `!doctor.vector`, and
     every chip (`BrainViz`, `BrainQuery`, `BrainCore`'s "no vector provider
     wired" notice, `/brain`'s "search"/doctor annotations, home's G-Brain
     card) derives from that one flag instead of independently guessing.
  2. *Supabase reachability.* Same root cause as #1: "supabase reachable" on
     `/brain` was actually reporting the local store's own connectivity, not
     Supabase's (nothing in this app calls Supabase at all — confirmed via
     `grep`, no `SUPABASE_*` env var, no client dependency). Not "paused",
     simply never integrated. Fixed by the same `vector`-flag change above;
     the line now reads "no vector provider wired" / "vector provider
     reachable" — accurate for the local grep store today and still correct
     the day a real vector backend is registered.
  3. *"No agent runs yet" vs. 70 recorded runs.* `/brain`'s doctor panel
     queries `db.agentRuns.byAgent('data-agent')` — deliberately scoped to
     Data Agent, the one agent tied to the knowledge layer
     (`lib/agents/live-status.ts` maps it to the `'brain'` connector), not a
     wrong table or wrong filter. The bug was purely the bare "no agent runs
     yet" copy reading, to anyone who'd just seen 70 total runs on `/agents`
     or `/analytics`, as "nothing has ever run" — it was only ever reporting
     on this one agent (whose own schedule, per the "every real agent now
     has a real schedule" entry above, may genuinely not have fired yet).
     Now reads "data-agent has not run yet."
  4. *Tool count, three ways.* "Tools 13" (the knowledge-graph legend),
     "TOOLS 10" (the graph's sidebar directory), and "TOOLS · 9" (the
     brain-store pipeline's folder listing) are three legitimately different,
     correctly-computed numbers, not a bug: the legend counts graph NODES
     (`buildKnowledgeGraph` gives a shared tool one node PER department that
     uses it — 13), the directory dedupes those by slug (10 unique tools
     actually wired to an agent), and the pipeline's "tools" folder counts
     markdown DOCUMENTATION pages (one per catalog `Tool` in `lib/seed.ts` —
     9). All three used to render under a bare "Tools"/"TOOLS" label as if
     counting the same thing. Fixed by disambiguating each label instead of
     forcing one number: the legend row reads "Tool nodes"
     (`components/KnowledgeGraph.tsx`'s `LEGEND_LABEL_OVERRIDE`), the
     directory group is titled "Unique tools" (`lib/knowledge-graph.ts`'s
     `graphDirectory`), and the pipeline folder listing reads "tool docs"
     (`app/brain/page.tsx`'s `FOLDER_DISPLAY_NAME`, applied to the other
     generated-doc folders too).
  5. *Health score vs. "ok".* `doctor.healthScore` is never actually
     computed anywhere in this codebase (`lib/brain.ts` always returns
     `null`) — but `/brain`'s footer badge and header line granted "ok"/"all
     green" purely from `connected && warnings.length === 0`, with zero
     regard for whether a real score backed that claim, so "—/100" sat next
     to a green "all green" badge; `PillarRadar`'s center health number was
     hardcoded `text-os-ok` (green) even when rendering "—"; and the home
     page repeated the same pattern in both the Knowledge health tile
     (`overview.doctor.status` is `'ok'` whenever the store has any files,
     independent of the score) and the G-Brain summary card. Fixed with one
     new function, `lib/brain.ts`'s `summarizeDoctor()`: connected +
     checks-all-green + **no real score** now summarizes as `not_scored`
     ("not yet scored"), never `ok`. `ok`/"all green" is only reachable once
     a real score exists. `/brain` and the home page both now render that
     one function's output instead of computing their own "ok" independently
     (which is exactly how they drifted out of sync with each other in the
     first place), and `PillarRadar`'s health number is styled `text-os-dim`
     instead of `text-os-ok` whenever it's null. Tests in
     `tests/brain.test.ts` (`summarizeDoctor`, `doctor.vector`),
     `tests/brain-page.test.ts`, `tests/brain-viz.test.ts`,
     `tests/home-page.test.ts`, and `tests/knowledge-graph.test.ts`.
- **Three more connection-status disagreements found and fixed
  (2026-08-21).** A follow-up review found the OneUp reconciliation above
  hadn't fully reached `/content`, plus two unrelated honesty splits on
  `/integrations` and one on the sidebar:
  1. **`/content`'s "Content pipeline" section still said "No posting
     source is connected" unconditionally**, even after the agent-card fix
     above made the Social Pulse card itself live — the pipeline section
     underneath was a second, separately hardcoded piece of copy the
     earlier fix missed, so the page still contradicted `/social` ("OneUp
     connected · no synced data yet") and `/integrations` ("OneUp
     CONNECTED") the moment `ONEUP_API_KEY` was set. Fixed with
     `lib/content.ts`'s new `contentPipelineStatus()`, which reads the same
     `oneup` entry from `allConnectorStatuses()` `/social` and
     `/integrations` already read and reuses `lib/social.ts`'s
     `socialSourceBadge()` for wording — one source of truth, not a third
     guess. It renders three honest states, not two: not connected /
     connected but nothing synced yet / connected with real synced posts
     (driven by an actual `db.socialPosts` `'published'`-status count —
     never a hardcoded label). Tests in `tests/content.test.ts`.
  2. **`/integrations`'s "Google Calendar — CONNECTED" card sat directly
     above "CAL_1_USER: not set / CAL_1_PASS: not set"** in the API Keys
     panel, even though Calendar demonstrably works (`/comms` shows real
     events). Root cause: `lib/connectors/gcal.ts`'s real calendar
     connector has never read `CAL_1_USER`/`CAL_1_PASS` — it authenticates
     with the same Google `INBOX_*_USER`/`INBOX_*_PASS` app passwords the
     Email group already lists (a Gmail app password also unlocks the
     legacy CalDAV endpoint; see that file's header comment). The CONNECTED
     badge was right; the credential panel was labeling dead vars nothing
     in the codebase ever consulted. Fix: removed the `CAL_1_USER`/
     `CAL_1_PASS` slots from `lib/keys.ts`'s `KEY_SLOTS` entirely (the
     "Calendar" group no longer renders) and noted on `INBOX_1_HOST`'s hint
     that a Google inbox also powers Calendar via CalDAV — the panel now
     only shows credentials something real actually reads.
  3. **`/integrations`'s "Knowledge Store — CONNECTED" card sat above
     "BRAIN_STORE: not set"** — both facts are individually true and
     neither was actually wrong: `BRAIN_STORE` really isn't set, and the
     connector really is connected, because `lib/brain.ts`'s
     `brainStorePath()` deliberately falls back to the bundled
     `knowledge/brain-store/` folder shipped in the repo (documented above
     under "The knowledge layer"). Left unexplained, the juxtaposition read
     as a lie. Fix: `lib/keys.ts`'s `listKeyStatuses()` now attaches a
     `note` to the `BRAIN_STORE` slot ("using the bundled starter store —
     already connected") whenever it's unset but the bundled fallback
     exists (`lib/brain.ts`'s new `bundledBrainStoreExists()`), and
     `ApiKeys.tsx` renders it inline — the CONNECTED badge and the
     credential panel now agree instead of one silently overriding the
     other. Tests in `tests/keys.test.ts`.
  4. **Sidebar footer flickered between "7/7 systems live" and "—/—
     systems live"** on page load, worst on `/integrations` and `/social`.
     Root cause: `components/Sidebar.tsx` fetches `/api/connections`
     client-side after mount and rendered the literal string `'—/—'`
     alongside the same solid green pulsing "ok" LED the real count uses
     whenever that fetch hadn't resolved yet — a loading state disguised as
     a live "zero of zero" reading, not a data bug. Fixed with
     `lib/sidebar-status.ts`'s new pure `systemsLiveDisplay()`: while
     `live` is still `null` it returns `{ label: 'checking systems…',
     loading: true }` and the footer now renders a hollow neutral `.dot.off`
     LED instead of the green pulse; once the count resolves (including a
     genuine `0/0`) it renders the real value with the normal `ok` LED,
     visually and textually distinct from the loading state in every case.
     Tests in `tests/sidebar-status.test.ts`.
- **`/finances` bypassing the `.env.local` credential overlay, plus a
  QuickBooks refresh race and a swallowed connector 'error' state
  (2026-08-21 fix).** A live QA session found `/api/connections` reporting
  QuickBooks connected 8/8 times while `/finances` said "RECONNECT NEEDED"
  8/8 times in the same session — the same grant, disagreeing with itself
  depending which page read it. Root cause: `app/finances/page.tsx` called
  `qboConfigured`, `companyName`, `monthToDateIncome`, `openInvoices`, and
  `monthToDateExpensesByCategory` with bare `process.env` (`qboConfigured`)
  or with no argument at all (the other four, silently falling back to each
  connector function's own `= process.env` default) — the one QuickBooks
  consumer in the codebase that skipped `lib/creds.ts`'s `runtimeEnv()`
  (process.env + a fresh `.env.local` read). `.env.local` is where the
  `/integrations` connect/rotate flow — and production's
  `FOUNDER_OS_ENV_LOCAL`-backed volume file — actually writes rotated
  QuickBooks credentials, so a real, working reconnect never reached this
  page. Every other real caller (`lib/connectors/index.ts`'s
  `quickbooksStatus`, `lib/agents/real.ts`'s `quickbooks-pulse` agent and
  Chief of Staff) already passed `runtimeEnv()`. Fixed by computing
  `const env = runtimeEnv()` once at the top of the page and threading it
  through every QBO call. Regression test in `tests/finances-page.test.ts`
  reads the page's own source (same convention as `tests/funnel-page.test.ts`)
  and pins that every QBO call receives `env`, never bare `process.env` or no
  argument.
  Same review flagged two related defects, fixed alongside: (1)
  `getValidAccessToken` (`lib/connectors/quickbooks.ts`) had no locking
  around its refresh call — Intuit rotates the refresh token on every use
  (the function's own comment says so), so concurrent callers (e.g.
  `/finances` firing 4 QBO calls in one `Promise.all`, plus other pages
  potentially rendering concurrently) could each independently hit the token
  endpoint and invalidate each other's refresh token. A module-level
  in-flight-refresh promise now makes every concurrent caller await the SAME
  refresh instead of firing its own — single-process Next.js server, no
  distributed lock needed. Test in `tests/quickbooks-refresh-lock.test.ts`
  (mocks the token endpoint with an artificial delay and asserts N concurrent
  `getValidAccessToken()` calls produce exactly one real network call, and
  that the lock correctly releases afterward for a genuinely later refresh).
  (2) A connector genuinely in the `'error'` state (a stored grant/key exists
  but the last real API call failed) rendered on `/integrations` as a plain
  "Not connected · Connect →" card — indistinguishable from a tool that was
  never touched, and throwing away the real failure detail
  (`ConnectorStatus.detail`, e.g. "token may be revoked"). `CatalogEntry`
  (`lib/integrations-catalog.ts`) gained a genuine `error: boolean` field
  (true only when a real `connectorId`'s live status is `'error'`, never
  invented, never true alongside `connected`), and `ConnectFlow.tsx` renders
  a third, distinct amber/red "Reconnect needed" chip with the real detail
  message shown as visible body text (not just a title tooltip) and a
  "Reconnect →" action, instead of collapsing into "Not connected". (While
  wiring the new `error` prop into `ConnectFlow`, found and fixed a real prop
  name collision: the component already had an unrelated local
  `[error, setError]` state for transient save/disconnect-request failures,
  which would have silently shadowed the new connector-status prop — renamed
  to `formError`/`setFormError`.) The existing connected/keySaved/never-
  connected states are unchanged for every other connector on the board
  (Gmail, Allo, Calendar, OneUp, Knowledge Store, Anthropic, Slack, Notion,
  etc.). Tests extended in `tests/integrations-catalog.test.ts` and added in
  `tests/connect-flow.test.ts` (source-based, matching
  `tests/funnel-page.test.ts`'s convention — no DOM-rendering harness is
  installed in this repo).
- **`/org` status dots, the Conductor's fake pills, and three stale honesty
  strings, fixed (2026-08-21).** A review of the org chart found it was the
  one page never migrated to the honest-status fix above: `app/org/page.tsx`
  rendered `db.agents.all()`'s static seed `status` completely untouched
  (Home, `/agents`, and `/content` all already compute it live via
  `lib/agents/live-status.ts`'s `liveAgentStatus()`), so 8 of 10 agents
  showed a hollow "planned" dot regardless of what was actually connected or
  had actually run — including Chief of Staff, which `/agents` correctly
  shows ACTIVE with real run history. Fixed by threading the same
  `allConnectorStatuses()` → `liveAgentStatus()` pipeline through before the
  page builds its hierarchy tree; a small "Status" legend (matching the
  page's existing "Life areas" legend styling) now explains the four dot
  states, since none existed before. Regression test in
  `tests/org-page.test.ts` reproduces the exact Chief-of-Staff scenario.
  Separately: (1) `components/ConductorCard.tsx` showed "Broadcast",
  "Orchestration", and "Instances" as three equal capability pills, but the
  Conductor's only real tool is fan-out broadcast (`lib/agents/
  runtime.ts`'s `broadcast()`) — no scheduling or process-instance
  management exists anywhere in the codebase, so the other two were
  decorative. Removed rather than invented a replacement. (2) The Conductor
  SOP (`lib/seed.ts`'s `sopTasks`) claimed it "files the run to agent_runs"
  and "reports non-responders" — `broadcast()` actually only ever writes to
  `broadcasts`/`broadcast_replies` (never `agent_runs`), and every agent
  always produces a reply via its own try/catch (there's no separate
  non-responder detection to report). Reworded to describe what the code
  actually does. (3) `/sops`' intro line said "every agent and person on the
  roster" runs from a written procedure, but `lib/seed.ts`'s `people` array
  has been empty since the original purge — no person has ever been seeded
  — so the sentence implied a roster that doesn't exist. Reworded to name
  the roster as agents-only today. (4) The Data Agent's SOP step and its
  own + its `RuntimeAgent`/seed-agent descriptions (`lib/seed.ts`,
  `lib/agents/real.ts`) all still said "stub until a provider is wired" —
  stale from before `lib/brain.ts`'s bundled markdown-store provider
  shipped; `/brain` and `/integrations` ("Knowledge Store — CONNECTED")
  have both reported a live, real grep-search provider for a while. Reworded
  to match `/brain`'s own honest phrasing ("real grep search … upgradeable
  to a vector provider later") instead of denying a provider exists. (5) The
  Skills catalog's "Knowledge retrieval" card carried the same stale "stub"
  claim and a stale `status: 'planned'` (the same connector is realistically
  always connected in this repo, via the bundled fallback) — fixed the copy
  and the status together so they agree. (6) Separately, "Books pulse" (the
  QuickBooks skill card) hardcoded `status: 'live'` in the seed regardless
  of whether QuickBooks was actually connected. `lib/skills-catalog.ts`
  gained `liveSkillStatus()` (same honest-computed idea as `liveAgentStatus`,
  scoped to this one card) and `app/skills/page.tsx` now reads the real
  QuickBooks connector state before rendering the fallback seeded catalog.
  `SEED_VERSION` bumped to `2026-08-21-org-honesty-fixes` so an
  already-seeded production DB picks up the corrected copy on next touch;
  `knowledge/brain-store`'s generated conductor/data-agent docs were
  regenerated (`npm run brain:docs`) to match. Tests: `tests/org-page.test.ts`,
  `tests/skills-catalog.test.ts`.
- **Hydration mismatch on every load of `/`, `/agents`, `/comms` (2026-08-21
  fix).** `components/AgentActivityFeed.tsx` and `components/WeekCalendar.tsx`
  formatted timestamps with `toLocaleTimeString([], …)` /
  `toLocaleDateString([], …)` — the BROWSER's local timezone/locale —
  directly during render. Next.js server-renders these client components on
  Railway (server TZ = UTC), then React hydrates and re-renders them in the
  visitor's local timezone; the formatted string differs between the two
  passes (e.g. "2:30 PM" vs "10:30 AM"), so React discarded the SSR HTML and
  threw hydration mismatches (#418/#423/#425) on every single page load —
  confirmed live via browser console. Fixed with the standard swap-after-
  mount pattern rather than `suppressHydrationWarning` (which would only
  silence the error while still doing the wasteful re-render and flashing
  the wrong time): each formatter is split into a UTC variant (`clockUTC`,
  `fmtTimeUTC`, `weekdayUTC` — deterministic, used on the render that has to
  match SSR) and a local variant (`clockLocal`, `fmtTimeLocal`,
  `weekdayLocal`), gated by a `hydrated` state flag that starts `false` and
  flips to `true` inside a `useEffect` — which only runs client-side, after
  hydration has already reconciled. `WeekCalendar.tsx` also gained an
  explicit `'use client'` directive (it was already being rendered client-
  side as a descendant of `CommsTabs.tsx`, just undeclared). A repo-wide grep
  for the same call shapes found no other instance of this bug class — the
  remaining `toLocaleDateString`/`toLocaleString` call sites
  (`app/analytics/page.tsx`, `app/finances/page.tsx`,
  `components/AudienceConsistency.tsx`, `components/BusinessIncomeChart.tsx`)
  already pass an explicit `timeZone: 'UTC'` and locale, so they're
  deterministic regardless of where they run. Separately, the Home page's
  agent roster row appended a literal `" ago"` onto `relativeTime()`'s output
  unconditionally, producing "just now ago" for any run in the last minute
  (`relativeTime()` already returns a full phrase for that case and only a
  bare duration like `"5m"` otherwise); fixed with a `relativeTimeAgo()`
  wrapper that only appends the suffix when the value isn't already a
  phrase. Tests in `tests/hydration-safe-clock.test.ts` (source-structure
  assertions plus a determinism check on the UTC formatters — a real
  SSR-vs-client render pass isn't available in Vitest/jsdom) and
  `tests/relative-time-ago.test.ts` (extracts and runs the real
  `relativeTime`/`relativeTimeAgo` bodies against a live "just now" case).
- **Four honesty/safety bugs found and fixed on `/social` and its composer
  (2026-08-21).**
  1. **PostComposer's own "manual only" claim went stale the moment its
     sibling fix shipped.** The "Every real agent now has a real schedule"
     entry above landed `.github/workflows/agent-cron-checks.yml` with a real
     `0 */4 * * *` schedule for social-pulse, and it is confirmed firing in
     production — but `components/PostComposer.tsx`'s footer copy still read
     "Queues only — Social Pulse publishes it, but only when run manually
     from /agents (no automatic schedule is wired up yet)," written for the
     "OneUp status reconciliation" fix two entries above, before the cron
     existed. With `ONEUP_API_KEY` + `ONEUP_CATEGORY_ID` both set, the publish
     path is fully live: a rough/draft caption queued here now auto-publishes
     to the real connected Instagram account within ~4 hours, not "only when
     run manually" — actively dangerous copy for a composer, since it told
     the operator queuing was safe drafting when it was really scheduling a
     near-term live post. Fixed the copy to say plainly that Social Pulse
     runs automatically every ~4 hours and will publish whatever is queued.
     Grepped the rest of the app for the same claim — this was the only
     occurrence.
  2. **`/social` hardcoded `livePosts=[]` / `recentLive=false` /
     `postDays=[]`** unconditionally, with a stale "no posting source
     connected" comment predating OneUp — so the instant Social Pulse
     actually published something, `/content`'s `contentPipelineStatus()`
     (real `db.socialPosts` `'published'`-status count) would correctly show
     it while `/social`, the actual social page, kept insisting no post
     history had ever synced. `lib/social.ts` gained `recentLivePosts()` (one
     row per published-post × platform, newest first, timed by
     `scheduledFor ?? createdAt` since OneUp has no "post immediately" verb —
     `url` stays honestly `null`, OneUp's schedule APIs never return a
     permalink) and `publishedPostDays()` (real `PostDay[]` for the
     posting-consistency chart) — both pure functions over `db.socialPosts`
     rows, same `status === 'published'` filter `/content` already uses, no
     new data source. `app/social/page.tsx` now derives `livePosts`,
     `recentLive`, and `postDays` from these instead of literals. Tests in
     `tests/social.test.ts`.
  3. **`listOneUpFailedPosts` (`lib/connectors/oneup.ts`, OneUp's own
     `/getfailedposts` feed with real `fail_reason`) had zero callers
     anywhere in the app.** A post OneUp rejected (platform mismatch, a
     malformed field) got marked `'failed'` in our own queue immediately,
     but `AgentRunSchema` never persists a run's per-post `data` — only its
     one-line `summary` string — so the real reason vanished the moment the
     triggering `social-pulse` run finished, leaving no trace beyond a
     truncated one-line `/agents` summary. `lib/social-oneup.ts`'s new
     `fetchOneUpFailedPosts()` wires the existing function in behind an
     honest, never-throwing `{ ok: true, posts } | { ok: false, error }`
     result; `/social` renders a "Failed" section (only when there's
     something to show, no empty clutter) combining our own queue's
     `'failed'` rows with OneUp's real `fail_reason` detail — visible and
     explained, not silently gone. No retry flow added (out of scope, kept
     this scoped per the review). Tests in `tests/social-oneup.test.ts`.
  4. **`components/InstagramDmInbox.tsx` claimed a live ManyChat webhook that
     doesn't exist.** Its badge read "SEEDED · LIVE VIA MANYCHAT WEBHOOK" and
     its empty state told the operator messages "appear here as ManyChat
     posts them to /api/webhooks/manychat" — but neither that route nor
     `/api/social/dm/reply` exists anywhere under `app/api` (verified by
     search; both would 404 in production), and no `MANYCHAT_API_KEY` env var
     exists in this codebase either. Fixed the badge to read "seeded ·
     manychat not connected," the empty state to say ManyChat isn't
     connected or built yet, and the send-failure fallback text to stop
     referencing a nonexistent env var — matching the honest-empty-state
     pattern used elsewhere (e.g. `/brain` saying "not configured" rather
     than faking a working search) instead of implying working live
     infrastructure. Building the actual ManyChat integration stays out of
     scope — this only fixes the misleading claim.
- **Three dashboard-review fixes: Run pill wiring, broadcast footgun warning,
  /tasks honesty (2026-08-21).**
  1. *Dead "Run" pill, now real.* The home page's agent row rendered a
     styled `<span>` inside `<Link href="/agents">` that said "Run" but did
     nothing except navigate away on click — `POST /api/agents/[id]/run`
     (the real trigger, backed by `lib/agents/runtime.ts`'s `run()`) already
     existed and worked, it just wasn't wired to anything clickable. The
     `/agents` roster had it worse: no run trigger at all. New
     `components/AgentRunButton.tsx` (same busy/note pattern as
     `AlloSyncButton`/`WebsiteSyncButton`) is a real `<button>` that POSTs
     the run endpoint, disables itself in flight, shows an honest OK/FAILED
     outcome plus the run's own summary, then `router.refresh()`s so the
     row's last-run info updates from the server. On the home page the
     button now sits **outside** the row's `<Link>` (which still wraps just
     the agent name/meta and still navigates to `/agents`) instead of nested
     inside it, so the two controls can't swallow or be confused with each
     other; `/agents`' roster cards (not links to begin with) get the same
     button next to the tier badge.
  2. *Conductor broadcast footgun, now disclosed.* Live testing confirmed
     `lib/agents/runtime.ts`'s `broadcast()` calls
     `agent.respond ? agent.respond(message) : agent.run()` for every agent
     — and only `data-agent` implements `respond()` (`lib/agents/real.ts`).
     Send an ordinary message to `ConductorCard.tsx` (the chat pill on
     `/org`, the only UI that actually calls `POST /api/agents/broadcast` →
     `runtime.broadcast()`) and every other agent runs its **full real
     job** instead of replying: Allo Pulse pulls live calls, Gmail Worker
     polls real unread counts, Social Pulse can PUBLISH queued posts to the
     real Instagram account. `ConductorChat.tsx`/`AgentChat.tsx` on `/agents`
     were checked too and don't carry this risk — they route through
     `chatWithAgent`/`routeConductorMessage` (`lib/agents/chat.ts`,
     `lib/agents/conductor.ts`), which never falls back to `run()` — so the
     warning was added only where the real risk lives: `ConductorCard.tsx`
     now shows a standing, visible notice that sending broadcasts to every
     agent and can trigger real calls/email checks/publishes, not just a
     reply, and points to `/agents` for a side-effect-free chat. The
     broadcast architecture itself is unchanged — this is a disclosure, not
     a redesign.
  3. *`/tasks` honesty + a real create-task affordance.* `TaskBoard.tsx`'s
     intro copy claimed "Agents advance their own cards as they commit and
     finish" — untrue. No agent `run()` in `lib/agents/real.ts` writes to
     `agent_tasks`; the seed ships it permanently empty
     (`lib/seed.ts`'s `agentTasks` array), and the only writers were the
     board's own drag handler and the manual add-task form that lived
     exclusively in `AgentWorkPanel.tsx`'s collapsed drawer on `/agents`.
     Copy now reads "Tasks are created and moved manually today; no agent
     writes to this board on its own yet." `TaskBoard.tsx` also gained its
     own create-task form (agent picker + title, `POST /api/agents/work` —
     the same working CRUD endpoint `AgentWorkPanel` already uses) plus a
     per-card delete (`DELETE /api/agents/work`), so adding or removing a
     task no longer requires knowing about a hidden drawer on a different
     page. Tests: `tests/agent-run-button.test.ts`,
     `tests/conductor-broadcast-warning.test.ts`,
     `tests/task-board-honesty.test.ts`.
- **Two undocumented Railway data-loss risks closed, plus ntfy config made
  visible on `/integrations` (2026-08-21 fix).** A production review of
  Railway's ephemeral-container-filesystem risk — the same class of bug
  `FOUNDER_OS_DB` was fixed for — found two more files with the exact same
  exposure, neither one documented anywhere a Railway operator would look.
  (1) `lib/ledger.ts`'s statement ledger (`data/ledger.db` by default) holds
  every row imported from a `/finances` bank/CC statement upload — real
  financial data with no second copy anywhere. The code already read
  `process.env.LEDGER_DB` correctly (`const DEFAULT_PATH = process.env.
  LEDGER_DB ?? path.join(process.cwd(), 'data', 'ledger.db')`, same shape as
  `lib/data.ts`'s `FOUNDER_OS_DB` line), but `.env.example` and `README.md`
  never mentioned `LEDGER_DB` at all — so nothing prompted whoever manages
  Railway's env vars to actually point it at the mounted volume, and every
  uploaded statement would silently vanish on the next redeploy. (2)
  `lib/creds.ts`'s `.env.local` overlay — where `/integrations`' connect
  flow and QuickBooks token rotation actually write live credentials
  (`envLocalPath()`) — already supported a `FOUNDER_OS_ENV_LOCAL` override
  for exactly this reason (tests already exercised it), but that env var was
  likewise absent from `.env.example` and `README.md`, so a freshly-rotated
  QuickBooks refresh token or a just-pasted API key written through
  `/integrations` in production would be wiped the moment the container
  redeployed. Both were real fixes waiting on documentation, not code —
  fixed by adding both to `.env.example` in the same style as the existing
  `FOUNDER_OS_DB` entry (including the "point at the Railway mounted volume
  in production" comment) and adding a "Deploying to Railway" paragraph to
  `README.md` naming both vars, what each protects, and their default
  (unset) fallback path. Regression test added in `tests/ledger.test.ts`
  (`vi.resetModules()` + a fresh dynamic import, since `DEFAULT_PATH` is
  computed once at module load — unlike `FOUNDER_OS_DB`'s lazy per-call read
  in `getDb()`) pins that `openLedger()` with no argument actually honors
  `LEDGER_DB` when set, so this can't silently regress back to only working
  by coincidence of import order. Separately: `lib/keys.ts`'s `KEY_SLOTS` —
  the list that drives which credentials are visible/editable on
  `/integrations` — was missing `NTFY_TOPIC` and `NTFY_URL` entirely, even
  though `.env.example` already documented both as real Chief-of-Staff push
  config (`lib/chief-of-staff.ts`'s `sendNtfyPush` reads them) and every
  other real credential (QuickBooks, Allo, the knowledge store) had a slot.
  Practical effect: Sean had no way to see whether his ntfy topic was set or
  change it himself from the dashboard — only someone SSHed into Railway's
  env vars could. Fixed by adding both as plain string slots (same pattern
  as `ALLO_API_KEY` — no OAuth flow involved), under a new "Chief of Staff"
  group, with hints pointing at `sendNtfyPush` and noting `NTFY_URL` is
  optional (defaults to `https://ntfy.sh`, only needed when self-hosting).
- **`/workflows` seeded with AAC's first six real processes (2026-08-21).**
  `lib/seed.ts`'s `workflows` array had shipped empty since the original
  purge (the previous build's invented "revenue machine" numbers were ripped
  out entirely rather than backfilled) — `/workflows` rendered nothing but
  its honest empty-state explainer. It now carries six of Sean's actual,
  documented AAC processes, mapped step by step: the FHA 203(k) draw request
  (milestone → HUD consultant inspection → lender release in 3–5 business
  days → pay subs, with the "subs never get ahead of draws" rule carried in
  the subtitle), the standard 14-week full-renovation trade sequence (demo
  through final punch, all 14 weeks present, including the real countertop
  measure → 7–10 day lead time → install gap as its own edge label), the
  permit application process (confirm-required → submit via the correct
  jurisdiction's system, with Detroit ProjectDox's 3–6 week wait and the
  faster suburban jurisdictions' real ranges attached — never start
  permitted work before approval, no exceptions), the post-walkthrough
  review-request follow-up (fires within 48 hours, personalized, with a
  direct Google review link), the Day-1 project kickoff checklist (30%
  deposit through the filed contract), and the lead follow-up cadence (24
  business hour callback through the 3/7/14-day touches to a 21-day stale
  archive). Every step's real detail — title, owner, sequence, jurisdiction
  wait times, lead times — came straight from the documented process; none
  of it was invented. What the `WorkflowSchema` requires but nothing in
  those docs specifies — `revenueUsd`, each step's `hoursPerWeek`, `leakUsd`,
  and `automation` — stays an honest `0`/`null` across all six rather than a
  plausible-sounding guess, matching this repo's standing HONESTY rule
  (empty/zero over invented). Two new tool ids needed real brand entries to
  render on the map: `quickbooks`, `phone`, and `projectdox` (HUD's Detroit
  permitting portal) had no simple-icons match, so they're intentional
  lettermark tiles now (`lib/brand-logos.tsx`'s `LETTERMARK`); the review
  step's `google-reviews` tool reuses the existing `googlebusiness`
  lettermark rather than inventing a new one. All four are wired through
  `lib/workflow-tool-brands.ts`'s `TOOL_BRANDS`, enforced by the existing
  `tests/workflow-tool-brands.test.ts` (that test already loops over every
  tool id any seeded workflow actually uses — no change needed there beyond
  the new brand entries resolving). `SEED_VERSION` bumped to
  `2026-08-21-aac-workflows` so a database seeded before this ships picks
  the six processes up on next touch. New tests in
  `tests/workflow-seed.test.ts` pin the six real workflows by id, assert the
  documented detail (jurisdiction wait times, the countertop lead time, the
  24h/3d/7d/14d/21d follow-up cadence, all 14 renovation weeks) survived
  intact, assert no dollar/hours figure was invented anywhere in the seed,
  and cover the same re-seed idempotency/purge contract `tests/seed.test.ts`
  already holds departments and agents to.
- **The business lens didn't reach `/finances`, `/funnel`, or `/workflows`
  (2026-08-21 fix).** An audit confirmed `/org` and `app/layout.tsx` both
  read the Topbar's shared AAC/Apps/Combined cookie
  (`lib/business-filter.ts`'s `resolveBusinessFilter` +
  `lib/business-filter-server.ts`'s `readBusinessFilterCookie`) correctly —
  but three other business-relevant pages each had their own disconnected
  story:
  1. **`/funnel` had its own `?business=` query param with no cookie
     fallback at all** — a completely separate, parallel toggle from the
     Topbar. With no `?business=` in the URL the page always hardcoded the
     "All clients" tab, so switching the Topbar's AAC/Apps/Combined selector
     while already sitting on `/funnel` did nothing observable; only a
     direct link carrying `?business=aac`/`apps` ever changed what
     rendered. Fixed by falling back to the shared cookie exactly when the
     query param is genuinely absent (`businessParam === undefined`) —
     an explicit `?business=` (even a bogus one) still wins outright, so
     every existing bookmark/deep-link keeps working unchanged, and the
     "All clients" default is preserved whenever the cookie itself reads
     `'all'`.
  2. **`/finances` never read the cookie at all.** QuickBooks' MTD income/
     expenses/net/open-invoices, the AR-aging + invoice-chase section, and
     the uploaded-statement ledger fallback rendered identically regardless
     of which business was selected — even though every one of those
     sources is genuinely AAC-only (QuickBooks is AAC's real, confirmed
     books; `lib/businesses.ts`'s Apps `focus` list already says plainly
     "no dedicated crew yet," and the ledger has no per-business column of
     its own — see `lib/ledger.ts`). The page now computes
     `showAacBooks = businessFilter !== 'apps'` from the shared cookie (same
     `?business=` override + cookie-fallback pattern as `/org`) and gates
     the live QuickBooks fetch, the AR-aging section, and the uploaded-
     ledger read behind it — Combined and AAC both render exactly the real
     numbers they did before this fix; Apps now renders an honest "nothing
     connected for this business yet" notice in place of the QuickBooks
     summary and the expense-category chart, instead of quietly showing
     AAC's real books under an Apps label. The statement-upload form is
     hidden under the Apps filter too, specifically so a statement never
     lands in the one shared ledger table mislabeled as Apps' spend. The
     pre-existing per-business bank-income chart further down the page
     (Vantage / General Operations — the literal account name on each
     uploaded bank statement) is a different, older "business" concept than
     the AAC/Apps taxonomy and stays unscoped by this filter on purpose:
     nothing in the codebase maps a bank account name to `aac`/`apps`, and
     inventing that mapping would violate HONESTY.
  3. **`/workflows` had no business dimension in its schema at all** — a
     `Workflow` couldn't be tagged AAC, Apps, or shared, so the page had
     nothing to scope against the Topbar even in principle (invisible today
     only because `lib/seed.ts`'s `workflows` array has shipped empty since
     the original purge — no invented workflow ever backfilled the gap).
     `WorkflowBusinessSchema` (`lib/schemas.ts`) adds `'aac' | 'apps' |
     'shared'` and `WorkflowSchema` now requires it — 'shared' exists
     because a workflow, unlike a funnel journey, can genuinely be a
     cross-cutting process serving both businesses at once. `lib/db.ts`'s
     `workflows` table gained a `business TEXT NOT NULL DEFAULT 'shared'`
     column (`migrateWorkflowsTable`, same `safeAlter` pattern as every
     other retrofit column here) — a pre-fix on-disk row with no recorded
     business either way backfills to `'shared'`, the one value that never
     hides a real existing workflow from any filter. `lib/workflow-stats.ts`
     gained the pure `workflowsForBusiness()` (mirrors `stagesFor()` in
     `lib/funnel.ts` — a small testable function the page reads rather than
     inlining the filter), and `app/workflows/page.tsx` now resolves the
     same cookie-or-query-param business filter and passes the scoped list
     to `WorkflowMap`. `WorkflowMap.tsx` shows a small AAC/Apps/shared dot on
     each workflow's selector button and, when the filter narrows the list
     to zero while real workflows exist for the other business, says so
     honestly ("no workflows tagged for this business") instead of
     rendering the original "nothing mapped yet, ever" empty state.
  Every page still defaults to Combined (both businesses) exactly as
  before this fix; only the AAC-only and Apps-only selections are newly
  scoped. Tests: `tests/funnel-page.test.ts`, `tests/finances-page.test.ts`,
  `tests/schemas.test.ts` (`WorkflowBusinessSchema`/`WorkflowSchema`),
  `tests/db.test.ts` (workflows round-trip + the pre-fix-schema migration
  path), `tests/workflow-stats.test.ts` (`workflowsForBusiness`), and
  `tests/smoke.test.ts` (both pages now render under an explicit
  `?business=` prop the same way `/org`/`/funnel` already did).
- **Chief of Staff's ntfy push routed through a Mac relay — Railway can't
  reach ntfy.sh at all (2026-08-24 fix).** The "Push-failure honesty" entry
  above (2026-08-21) made a genuinely failed push visible everywhere — but
  it stayed failed. Production kept showing Chief of Staff "Degraded ·
  PUSH FAILED" on every hourly run with no way to see why, because
  `app/agents/page.tsx`'s Activity list truncates `lastRun.summary` to 56
  characters (`.slice(0, 56)`) with the full string only reachable via the
  row's own `title` attribute — reading that (via direct DOM inspection,
  not the visibly rendered/truncated text) surfaced the real error for the
  first time: `fetch failed`. Root-caused with live evidence, not a guess:
  using Railway's own web Console (a root shell directly in the running
  production container — `curl` isn't installed there, so diagnosis used
  Node's native `fetch`/`dns.resolve4` instead), general outbound HTTPS
  works fine (`api.github.com` succeeded in ~40ms) but every connection
  attempt to ntfy.sh's own resolved IP (`159.203.148.75`) timed out — DNS
  resolution itself succeeds, so this isn't a DNS or config problem, most
  likely ntfy.sh (a frequently-abused free service) blocking Railway's
  shared egress IP range. `NTFY_TOPIC` was confirmed correctly set in
  Railway's variables and `NTFY_URL` correctly unset (defaulting to the
  public ntfy.sh) — nothing was misconfigured on our side. Sean's Mac
  reaches ntfy.sh fine (`~/.aac_brain/ntfy.py`'s pushes prove it daily), so
  rather than just recording the failure, a genuinely-failed direct push
  now gets queued for the Mac to forward instead — mirroring the existing
  `voiceQueue`/`speaker_daemon.py` relay architecture already in this repo
  (see below) rather than inventing a new pattern. `lib/chief-of-staff.ts`
  gained `ntfyTargetUrl(env)` (the topic/base-URL computation, pulled out
  of `sendNtfyPush` so a caller can compute the identical target without
  duplicating the logic). `lib/db.ts` gained a `push_queue` table and
  `pushQueue` repo (`enqueue`/`popNext`), structurally identical to
  `voiceQueue` — atomic pop-and-consume, FIFO by `created_at`/id, 24h sweep
  of consumed rows. `app/api/push/relay/route.ts` is a GET-only route (the
  enqueue happens server-side inside `chiefOfStaffRunWith`, never via an
  exposed POST) gated by `PUSH_RELAY_SECRET`, same bearer pattern as
  `VOICE_RELAY_SECRET`; added to `middleware.ts`'s `BYPASS_PREFIXES` for the
  same reason as the other machine-caller routes. `lib/agents/real.ts`'s
  `chiefOfStaffRunWith` now tries `relayFailedPush()` on any genuine direct
  push failure (both a thrown fetch error and a non-2xx ntfy status) before
  giving up: a successful relay enqueue calls `markNotified` (same as a
  direct success, so the next hourly run doesn't re-queue a duplicate) and
  reports `pushFailed: false` with a summary noting it was "relayed via
  Mac (...)" — `pushFailed: true` is now reserved for the case where the
  relay itself can't help either (e.g. the DB write behind it throws), so a
  genuinely undeliverable push is still reported honestly rather than
  silently claimed as handled. On Sean's Mac, `~/.aac_brain/push_relay.py`
  (a new LaunchAgent-scheduled script, `com.aac.brain.push-relay.plist`,
  every 5 minutes since Chief of Staff only runs hourly) polls
  `GET /api/push/relay` with `Authorization: Bearer $PUSH_RELAY_SECRET` and
  forwards whatever comes back straight to ntfy as a dumb transport layer —
  deliberately not reusing `~/.aac_brain/ntfy.py`'s `push()`, which is tied
  to the Brain's own topics/action buttons and unrelated to Chief of
  Staff's. It reuses the already-configured `AAC_BRAIN_URL` for the app's
  base URL rather than asking Sean to set a second URL for the same app;
  only `PUSH_RELAY_SECRET` is new Mac-side config, in `~/.aac_brain/.env`.
  Tests: `tests/chief-of-staff.test.ts` (network-failure and non-2xx-status
  scenarios now assert the relay path — `pushFailed: false`, the signal
  marked notified, and the item actually landing in `pushQueue` — plus a
  new case confirming `pushFailed` can still become `true` when the relay
  queue itself is broken), `tests/push-queue.test.ts` (mirrors
  `tests/voice-queue.test.ts`), `tests/push-relay-route.test.ts` (mirrors
  `tests/voice-queue-route.test.ts`), and a new middleware bypass case in
  `tests/middleware.test.ts`.
- **Client progress tracker — the "Domino's tracker" (2026-08-27).** Sean's
  own framing: "how Domino's does it... your pizza is being prepared...
  going into the oven... keeping them in the loop as things get done." A
  public, homeowner-facing page (`/track/[token]`) that shows a client where
  their job stands, built on the existing `/funnel` pipeline rather than a
  new system. Two halves: the sales-stage half (the existing `FunnelStage`
  pipeline, unchanged) and a new construction-milestone half for once a job
  reaches `active_project` (AAC's own trade sequence has no model anywhere
  in this app until now).
  - `lib/funnel-track-copy.ts` translates 5 of AAC's internal stage ids
    (`walkthrough_scheduled`, `estimate_sent`, `contract_signed`,
    `active_project`, `complete_paid`) into client-facing copy —
    `inquiry`/`follow_up`/`negotiation` and every Apps stage stay internal,
    never surfaced to a client, same principle as this tracker being AAC-only.
  - `lib/schemas.ts`'s new `ProjectMilestoneSchema` + `lib/db.ts`'s
    `project_milestones` table/repo record completed trades. AAC's real
    14-week sequence (from the aac-senior-pm skill, not invented) lives in
    `lib/project-milestones.ts` as `AAC_PROJECT_MILESTONES`;
    `completeMilestone()` mirrors `advanceStage()`'s validate-then-write
    shape and is idempotent by (contact, milestone) — a second call updates
    the date rather than duplicating. Wired to `POST /api/funnel/[id]/
    milestone` (`GET` for the completed list) and a new
    `components/MilestoneControl.tsx` on `/funnel`, right next to
    `StageAdvanceControl` — same explicit-click discipline, only renders
    once an AAC job is `active_project`.
  - `lib/track-token.ts` mints/verifies a stateless HMAC-SHA256 token per
    contact (`TRACK_TOKEN_SECRET`, no dev fallback on purpose) — the token
    itself is the /track link's auth, since a homeowner has no
    `APP_BASIC_AUTH_USER`/`PASS`. `middleware.ts`'s `BYPASS_PREFIXES` gained
    `/track` for exactly this reason (see that file's own comment on the
    trust model — a share-link, not a login).
  - `lib/funnel-notify.ts` sends the actual notification (email via the
    existing `lib/connectors/email.ts`, SMS via a new
    `lib/connectors/sms.ts` — Twilio REST over plain `fetch`, since Allo has
    no MCP/API connector in this repo to reuse for outbound texts) after a
    successful stage move or milestone completion, honest-by-default like
    every other connector: a missing `TRACK_TOKEN_SECRET`/`PUBLIC_APP_URL`,
    no email/phone on file, or a send failure is reported back on the
    route's response (`notify: {...}`), never silently swallowed or claimed
    successful.
  - `app/track/[token]/page.tsx` renders in AAC's actual client-facing
    brand (charcoal `#1C1A17` / gold `#B8894A` / cream `#F6F4EF`, Playfair
    Display + Montserrat — PLAYBOOK/BRAND_REFERENCE.md's APEX palette), not
    the internal `os.*` dashboard theme. Since a homeowner must never see
    the internal Sidebar/Topbar/Command Palette/Conductor dock,
    `app/layout.tsx` now branches on the request path (forwarded by
    `middleware.ts` as an `x-pathname` header, since a Server Component root
    layout has no access to `next/navigation`'s client-only `usePathname`)
    and renders a bare `<html><body>{children}</body></html>` for `/track`
    instead of restructuring every existing route into a Next.js route
    group. Its Google Fonts are loaded via a plain `<link>` tag in that
    branch rather than `next/font/google` — this page also has to import
    cleanly under Vitest (`tests/smoke.test.ts` renders every real
    `page.tsx`), where `next/font`'s SWC-only transform isn't available; a
    plain link tag is also exactly how every other AAC brand document in
    this business already loads fonts. An invalid token, a non-AAC journey,
    and an internal-only stage all render the identical "not found" page —
    never a distinguishing message that would let an outside party probe
    whether a given link maps to something real.
  - New env vars: `TRACK_TOKEN_SECRET`, `PUBLIC_APP_URL`,
    `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` (see
    `.env.example`). Without them the tracker still degrades honestly: no
    `TRACK_TOKEN_SECRET` means no link can be minted (not "worked but
    insecurely"), and Twilio being unset just means SMS doesn't send while
    email still can (if `INBOX_n_*` is already configured).
  - Tests: `tests/project-milestones.test.ts`, `tests/track-token.test.ts`,
    `tests/funnel-track-copy.test.ts`, `tests/funnel-notify.test.ts`,
    `tests/sms.test.ts`, `tests/funnel-milestone-route.test.ts`,
    `tests/track-page.test.ts`, plus extended coverage in
    `tests/middleware.test.ts`, `tests/smoke.test.ts`, and
    `tests/smoke-api.test.ts`.
- **Gmail Worker gains a real junk-triage capability, off by default
  (2026-08-28).** Sean asked for the Gmail Worker's duties to expand beyond
  read-only unread counts to include real triage — specifically detecting
  junk/spam and moving it to Trash (never a permanent delete, never "just
  archive"). The agent's own SOP previously read "Never mark mail read or
  delete anything — read-only by design"; that line described a genuine
  code limitation, not just a policy, since no move/delete tool was ever
  wired to the IMAP connector. `lib/mail-triage.ts` is the new pure
  classifier: exclusions (known CRM contact, existing thread, starred,
  has an attachment, or a client/project keyword like "203k"/"estimate"/
  "permit" in the subject) are checked first and always win outright,
  before any junk signal (host spam flag, a narrow high-precision scam
  phrase list, or a `List-Unsubscribe` header with no prior contact) is
  even evaluated — a message matching neither list is `'review'`, never
  `'junk'`. `lib/connectors/email-triage.ts` is the IMAP-facing runner:
  finds the inbox's real `\Trash`-flagged mailbox via `client.list()`
  (never a guessed folder name — Gmail's is literally `[Gmail]/Trash`),
  and every message evaluated (moved or not) is logged to the new
  `mail_triage_log` table (`lib/db.ts`'s `mailTriageLog` repo,
  `MailTriageLogSchema` in `lib/schemas.ts`) — an append-only audit trail,
  not just a run summary. Entirely gated by `MAIL_TRIAGE_MODE` (unset/`off`
  = the pre-existing read-only behavior, completely unaffected;
  `dry_run` = classify and log, move nothing; `live` = also move confirmed
  junk), `MAIL_TRIAGE_MAX_MOVES` (per-run cap, default 20 — matters most
  on `seanadavis0@gmail.com`/`1solutionsgroup1@gmail.com`, which have years
  of backlog unread mail and would otherwise all get evaluated in one run),
  and `MAIL_TRIAGE_LIVE_INBOXES` (which inbox ids may actually move mail in
  live mode — lets the approved rollout scope live trashing to `inbox-1`
  alone before ever touching the two personal inboxes, with zero code
  change to expand later). `gmailRun` (`lib/agents/real.ts`) calls
  `triageAllInboxes` after its existing unread-count logic and folds a
  short summary in; a triage failure never fails the whole run, since
  unread counts are the primary job. `lib/seed.ts`'s `sop-gmail-worker`
  entry (`SEED_VERSION` bumped to `2026-08-28-gmail-worker-triage-sop`) was
  rewritten to describe this honestly — off by default, phased rollout,
  never a guessed folder, never a permanent delete — rather than either the
  stale "read-only by design" claim or an aspirational overstatement of
  what's live before Sean turns it on. Full approved spec (rollout phases,
  exact criteria, circuit breakers) in
  `docs/gmail-worker-triage-sop.md`. Tests: `tests/mail-triage.test.ts`
  (classifier), `tests/email-triage-run.test.ts` (IMAP runner, mocked
  ImapFlow — mode gating, the per-run cap, missing-Trash-folder handling,
  scoped live inboxes), `tests/mail-triage-log.test.ts` (repo round-trip).
  **Still needs, before Sean's Phase 1 dry-run can start for real:** this
  branch has not been merged — it was built and tested in a clone by a
  Claude/Cowork session with no push access to this repo (see that
  session's handoff for why), so it's landing as a PR for Sean to review
  and merge himself, not a direct commit.
- **Gmail Worker's junk triage rewritten to "Zero-Scan, High-Confidence
  Quarantine" (2026-08-28, same day as the entry above).** After seeing the
  first real dry-run numbers from the three-bucket (junk/review/not_junk)
  model, Sean gave a full redesign spec directly, plus his own reasoning for
  it: "if we make a structure SOP they will follow it and it will bring the
  percentage of hallucination down a lot making it so they don't have to
  improvise on their own." The classifier was already fully deterministic —
  zero LLM involvement, so zero hallucination risk on this path already —
  but the bucket model itself changed shape entirely. `lib/mail-triage.ts`'s
  `classifyForTriage` now scores every non-fast-path message 0-100 via
  `junkConfidence` (host spam flag → 97, a narrow scam-phrase list → 96,
  `List-Unsubscribe` with no prior contact → 75, nothing → 0) and buckets
  into three verdicts instead of the old three: `>= 95` → **trash** (moved
  straight to Trash, capped at `MAIL_TRIAGE_MAX_MOVES`/run, default 20),
  `60-94` → **quarantine** (moved to a new "Quarantine" IMAP mailbox,
  created automatically via `client.mailboxCreate()` — idempotent per
  ImapFlow's own `created: boolean` contract, no separate existence check
  needed — capped at `MAIL_TRIAGE_MAX_QUARANTINE`/run, default 50), `< 60` →
  **protected** (left alone, exactly the old fast-path-exclusion behavior,
  now also the honest default for genuinely ambiguous mail). The five
  fast-path exclusions (known contact, thread reply, starred, attachment,
  client/project keyword) are unchanged and still checked first, before any
  scoring runs.
  The bigger addition is the quarantine's own life cycle, per Sean's
  explicit design: "I will no longer review daily digests. The quarantine
  folder will serve as a silent safety net if a missing email is ever
  brought up." So nothing in this pipeline pings or digests Sean about a
  quarantine verdict, ever — that was already true of the old `review`
  bucket's logging-only behavior, but is now a stated, permanent design
  choice rather than an interim state waiting on a review UI. A quarantined
  message that's never rescued releases itself to **Trash** — never a
  permanent/expunge delete, the same non-negotiable rule this feature has
  carried since its first version — after `MAIL_TRIAGE_QUARANTINE_DAYS`
  (default 14). "Auto-purge" in Sean's own wording was deliberately
  implemented as "move to Trash," not an actual delete; Gmail's own 30-day
  Trash retention is the last word, and this codebase never calls anything
  that expunges a message itself. The expiry sweep (`lib/connectors/
  email-triage.ts`'s `purgeExpiredQuarantine`, run at the end of every live
  `triageInbox` pass via `db.mailTriageLog.dueForPurge()`/`markPurged()`)
  matches by the message's RFC Message-ID header
  (`envelope.messageId`, captured at classification time), never by IMAP
  UID — a UID is only valid within the mailbox that issued it and the
  message gets an entirely new one the moment it's moved into Quarantine. A
  row with no recorded Message-ID, or a Trash-move that fails, stays pending
  and is retried on a later run rather than silently dropped; a row whose
  message is already gone from Quarantine (Sean rescued or deleted it
  himself) is still marked resolved, honestly, with nothing left to move.
  `MailTriageLogSchema` gained `confidence` (0-100), `messageId`
  (nullable), and `purgedAt` (nullable — set once by the sweep, never
  overwritten again); the verdict enum changed from `'junk'|'not_junk'|
  'review'` to `'trash'|'quarantine'|'protected'` — a breaking, undocumented-
  migration change for any pre-existing dry-run rows (there were no shipped
  callers of the old shape to migrate, confirmed by grep, so this was
  accepted rather than versioned). `lib/db.ts` gained a
  `migrateMailTriageLogTable` retrofit (same `safeAlter` pattern as every
  other column addition here) for the three new columns plus a
  `(verdict, moved, purged_at, created_at)` index the purge sweep's query
  uses. `docs/gmail-worker-triage-sop.md` was rewritten in full as the new
  authoritative spec (replacing the original three-bucket document
  entirely, not appending to it); `lib/seed.ts`'s `sop-gmail-worker` entry
  was rewritten to match and `SEED_VERSION` bumped to
  `2026-08-28-gmail-worker-quarantine-sop`. `.env.example` and `lib/keys.ts`
  gained `MAIL_TRIAGE_MAX_QUARANTINE`/`MAIL_TRIAGE_QUARANTINE_DAYS`
  alongside the existing `MAIL_TRIAGE_MAX_MOVES`. Tests fully rewritten for
  the new model: `tests/mail-triage.test.ts` (classifier — fast-path,
  deterministic scoring, bucketing, ambiguous-defaults-to-protected),
  `tests/email-triage-run.test.ts` (IMAP runner, including a new
  `describe('quarantine-expiry sweep')` block covering the Message-ID
  match, not-yet-expired, already-gone, no-Message-ID, and
  never-in-dry_run cases), `tests/mail-triage-log.test.ts` (repo round-trip
  plus new coverage for `dueForPurge`/`markPurged`). Fixing the new tests
  surfaced a latent isolation gap in the existing
  `FOUNDER_OS_DB=':memory:'` test-isolation convention: `lib/data.ts`'s
  `getDb()` singleton persists across every test in a file regardless of
  toggling the env var in `beforeEach`, so multiple tests in one file that
  each insert real `mail_triage_log` rows leaked state into each other
  (confirmed live — two tests failed with rows from earlier tests in the
  same file still present). Fixed by adding `lib/data.ts`'s
  `resetDbForTests()` (closes and drops the cached singleton so the next
  `getDb()` opens a genuinely fresh instance), called alongside setting
  `FOUNDER_OS_DB` in the `triageInbox` describe block's `beforeEach` — a
  test-only export, never called from application code, and a fix any
  future test file hitting the same pattern can reuse.
  **Still not live anywhere:** this is a rewrite of the spec and the code
  behind it, built and tested in the same clone as the entry above, with
  the same no-push-access handoff constraint. The Railway deployment is
  still running the OLD three-bucket dry-run model until Sean reviews and
  merges this PR himself — `MAIL_TRIAGE_MODE=live` has never been enabled
  in production under either version of this feature, and enabling it
  needs its own separate, explicit go-ahead regardless of which model is
  merged.
- **Gmail Worker gains post-triage structured extraction + drafted replies,
  off by default (2026-08-29).** After the Quarantine rewrite above, Sean's
  next ask — filtered through a second round with Gemini producing a
  ground-truth technical spec, reviewed and adjusted before implementation —
  was to extend the Gmail Worker past triage into extracting structured data
  from real client mail and drafting a reply for one-tap approval. Two new
  modules, both running exclusively on messages `lib/mail-triage.ts` already
  classified `protected` (they never touch, or re-decide, the junk verdict):
  `lib/mail-extraction.ts` (intent + project address + dollar amount + draw
  # + invoice #, via fixed regex/keyword patterns — deliberately NOT
  LLM-backed, same reasoning Sean gave for the junk classifier itself: a
  fixed procedure beats a model that can improvise) and `lib/mail-drafts.ts`
  (a templated executive summary + proposed reply built only from fields
  the extractor actually found — a `null` field is stated as "not found,"
  never silently omitted or guessed). Both gated by
  `MAIL_EXTRACTION_ENABLED` (off unless explicitly set `true`).
  `MailExtractionSchema`/`MailDraftSchema` (`lib/schemas.ts`) and two new
  tables (`mail_extractions`, `mail_drafts`, `lib/db.ts`'s `mailExtractions`/
  `mailDrafts` repos, matching `mailTriageLog`'s repo-object pattern rather
  than free functions) persist the results, upserted by `message_id`
  (unlike `mail_triage_log`'s append-only audit trail, an extraction/draft
  is a pure re-derivable function of the message content, so a re-run
  overwrites rather than duplicating — and a draft only overwrites while
  still `pending`, never after a human has already resolved it).
  `lib/connectors/email-triage.ts`'s `triageInbox` calls both, wrapped so a
  body-fetch or extraction failure never fails the message's already-logged
  triage verdict or the rest of the run; the plain-text body fetch
  (`fetchPlainTextBody`) is a best-effort MIME reader (finds the first
  text/plain part via `bodyStructure`, falls back to text/html with tags
  stripped, falls back to the whole message) — not a full MIME parser, and
  documented as such, since `extractMailData`'s patterns are written to
  tolerate a noisier body rather than needing a perfect one.
  **Strict human-in-the-loop, no exceptions:** every draft is created
  `pending`; the only path to `approved`/`edited`/`rejected` — and the only
  place `sendEmailReply` is ever called on agent-generated text — is the
  new `POST /api/comms/approve-draft` route, gated on an explicit action
  from a real person. That route deliberately does NOT trust a
  client-supplied recipient address: it looks up the real sender via the
  new `db.mailTriageLog.byMessageId()` (every message triage evaluates,
  `protected` included, already has a logged `fromAddress`/`inboxId`/
  `subject` row keyed by Message-ID), so a send always goes to the address
  triage itself already verified, never wherever a request body claims.
  A send failure leaves the draft `pending` rather than marking it resolved
  for a message that never actually went out; a second approval attempt on
  an already-resolved draft 409s rather than silently double-sending.
  Tests: `tests/mail-extraction.test.ts` (deterministic parsing, including
  two adversarial false-positive cases — a run-on sentence with a number
  and an unrelated street-suffix word, and a bare number never mistaken for
  a dollar amount without a `$`), `tests/mail-drafts.test.ts` (summary/reply
  never reference a field that wasn't found), `tests/comms-approve-draft-
  route.test.ts` (approve/reject/edit_and_send, the no-auto-send guardrail,
  send-failure-keeps-pending, double-resolve 409, unknown-draft 404).
  `lib/seed.ts`'s `sop-gmail-worker` entry and
  `docs/gmail-worker-triage-sop.md` both updated to describe this honestly;
  `SEED_VERSION` bumped to `2026-08-29-gmail-worker-extraction-drafts-sop`.
  **Merged 2026-08-28** (PR #3, same no-push-access patch/bundle handoff as
  the two Gmail Worker changes above) — live in `rebuild/arise-above` and
  deployed on Railway, but `MAIL_EXTRACTION_ENABLED` still has never been
  set in production, so extraction/drafting does not actually run yet.
  **Zero API cost by design** — worth stating plainly since it's easy to
  assume otherwise given Gemini's original spec named a
  `MAIL_EXTRACTION_MODEL` env var implying an LLM call per message: neither
  `lib/mail-extraction.ts` nor `lib/mail-drafts.ts` calls any model or
  external API at all, for any message, ever. It's regex/keyword matching
  and string templating, the same as `lib/mail-triage.ts`'s junk scorer.
  Turning `MAIL_EXTRACTION_ENABLED` on adds zero incremental LLM/API spend —
  the only per-message cost anywhere in this pipeline is the IMAP fetch
  itself. If a future ask wants the summary/reply to read more naturally via
  an actual LLM, that would be a deliberate, separate architectural change
  from what's built today, not a flag flip, and would need its own explicit
  go-ahead and per-message cost estimate before shipping.
- **`/comms` gains a "Drafts" review tab (2026-08-28).** The piece the
  extraction/drafting feature above was missing: until now,
  `POST /api/comms/approve-draft` existed with no UI in front of it, so a
  pending draft was only visible by querying the database directly.
  `lib/mail-draft-review.ts`'s `pendingDraftReviews()` is a read-only join —
  every `pending` row from `db.mailDrafts.pending()` (new repo method,
  oldest-first) enriched with its extraction (`db.mailExtractions.byId`) and
  its triage-verified sender/subject (`db.mailTriageLog.byMessageId`) — so
  the review card never has to guess at a reply-to address any more than the
  send path itself already refuses to. `app/comms/page.tsx` calls it
  server-side (same pattern as the existing `contactTags`/`gatherCommsFeed`
  calls on that page) and passes the result into a new third tab on
  `CommsTabs` (`components/CommsDrafts.tsx`), alongside Messaging and
  Meetings. Each card shows the intent, extracted fields (only the ones
  actually found — `null` fields are simply omitted from the card, never
  shown as a placeholder), the executive summary, and the proposed reply,
  with three actions that all call the existing
  `POST /api/comms/approve-draft` — **no new send path, no new route that
  can trigger `sendEmailReply`** — Approve & send, Edit (reveals a textarea,
  then Send edited), and Reject. A 404/409 response (already resolved
  elsewhere, e.g. from a concurrent tab) drops the card from the queue
  rather than leaving a dead action behind; any other failure leaves the
  card in place with the error shown inline so it can be retried, matching
  `StageAdvanceControl`'s existing busy/error pattern elsewhere in this
  codebase. Tests: `tests/mail-draft-review.test.ts` (enrichment, oldest-
  first ordering, pending-only filtering, the limit parameter, and an
  honest-fallback case for a draft whose extraction or triage row is
  somehow missing). Empty by default — this tab only ever shows a card once
  `MAIL_EXTRACTION_ENABLED` is set `true` and at least one message has run
  through the pipeline; empty state reads "no drafts waiting for review."
- Credentials go in `.env.local` (gitignored). NEVER commit keys.
- **Production outage: every page 500ing, root cause a migration-ordering bug
  in `lib/db.ts` (2026-08-28 fix).** Right after `MAIL_EXTRACTION_ENABLED` was
  set `true` in Railway (triggering a rebuild+redeploy of the exact same
  commit already live), the entire site started throwing `Application
  error: a server-side exception has occurred` on literally every page —
  `/`, `/integrations`, `/comms`, all of it, same error digest. `/api/keys`
  (the one route that reads only `process.env`, no DB) kept working, which
  narrowed it to `getDb()`. Railway's Deploy Logs showed the real error:
  `SqliteError: no such column: purged_at`. Root cause: `openDb()`'s single
  `db.exec(DDL)` call included `CREATE INDEX ... ON mail_triage_log (...,
  purged_at, ...)`, but that statement ran *before*
  `migrateMailTriageLogTable()` — the function that actually `ALTER TABLE`s
  `purged_at` onto a `mail_triage_log` table created before the quarantine-
  expiry rewrite added that column. On the production volume's real (pre-
  rewrite-shaped) table, the DDL's `CREATE INDEX` statement itself threw,
  aborting the whole `db.exec()` before the migration ever got a chance to
  run — and since `lib/data.ts`'s `getDb()` only caches its module-level
  singleton on a successful return, every single subsequent request re-ran
  (and re-failed) the same `openDb()` call. Not caused by the extraction
  flag itself, and not data loss or corruption — flipping that env var just
  happened to be the trigger for the next cold boot to hit an ordering bug
  that had been latent since the quarantine-expiry columns were added. A
  fresh `:memory:` DB (what every test in this repo uses) never exercises
  this path: its `CREATE TABLE` already includes `purged_at` from a clean
  slate, so the migration is a no-op and the index creation trivially
  succeeds — this is why 1372 passing tests never caught it. Fix: moved the
  `idx_mail_triage_log_purge` index creation to run *after*
  `migrateMailTriageLogTable()` instead of inside the initial DDL block.
  Regression test: `tests/mail-triage-log-legacy-table.test.ts` — builds a
  real on-disk DB with the pre-rewrite `mail_triage_log` shape (no
  confidence/message_id/purged_at) and asserts `openDb()` no longer throws
  and both the migrated columns and the index end up present. Immediate
  production recovery: verify via Railway Deploy Logs / a live page load
  that the fix restored service once deployed.
- **Zero-cost database backups, since Railway's own Backups/PITR require
  the Pro plan (2026-08-29).** Three independent AI reviews of this system
  (Gemini, Perplexity — see the review-brief work from 2026-08-19) all
  flagged the same real gap: the SQLite database is one file on one
  Railway volume with no second copy anywhere. Checking Railway's own
  Backups tab confirmed daily/weekly/monthly volume backups exist as a
  feature, but are gated behind the Pro plan (this project is on Hobby).
  Sean's call, discussed directly: the recurring cost of upgrading the
  whole plan wasn't worth it just for backups when a free alternative
  covers the same real risk (total loss of the one database file — every
  lead, job, invoice, communication log, and QuickBooks OAuth token) at
  effectively zero incremental cost. Built instead:
  - `app/api/backup/export/route.ts` — a new machine-facing route, same
    bearer-secret pattern as every other machine caller in this repo
    (`CRON_SECRET`/`VOICE_RELAY_SECRET`/`PUSH_RELAY_SECRET`/
    `AAC_BRAIN_SECRET`), gated by the new `BACKUP_EXPORT_SECRET`. Opens a
    **separate, readonly** `better-sqlite3` connection to the live database
    and calls its `.backup()` method (SQLite's own online backup API) to a
    tmp file, gzips it, and streams it back — safe to run against the live
    database under WAL mode (unlike a raw `fs.copyFile`, which can catch a
    mid-write torn page), and can never itself hold a lock the live app is
    waiting on since it never touches the `getDb()` singleton.
  - `lib/data.ts` gained `currentDbPath()` — the same `FOUNDER_OS_DB`
    fallback logic `getDb()` already used, pulled out so the export route
    doesn't duplicate (and risk drifting from) that resolution.
  - `.github/workflows/db-backup.yml` — a new scheduled workflow (daily,
    ~4-5am Eastern, plus `workflow_dispatch` for a manual run) that calls
    the export route and commits the dated `.db.gz` file to a dedicated
    `db-backups` branch in this same repo — no new account, no new service,
    just a place Sean already has access to. Prunes anything older than 90
    days, matched by the date encoded in the filename rather than file
    mtime (mtime resets to checkout time on every run, which would prune
    everything or nothing depending on checkout order rather than actual
    backup age).
  - New env var `BACKUP_EXPORT_SECRET` (`.env.example`, `lib/keys.ts` under
    a new "Backups" group) — must be set to the same value in both the
    app's own environment and as a GitHub Actions repo secret, same as
    `CRON_SECRET`.
  - `middleware.ts`'s `BYPASS_PREFIXES` gained `/api/backup` — same
    reasoning as the other machine-caller bypasses (the route's own bearer
    check runs instead of the interactive Basic Auth wall).
  **To restore:** download the dated file from the `db-backups` branch,
  `gunzip` it, and either point `FOUNDER_OS_DB` at the resulting `.db` file
  or copy it over the Railway volume's file directly via the Console tab.
  Tests: `tests/backup-export-route.test.ts` (bearer gating, the `:memory:`
  no-op case, and a real round-trip — writes real rows, exports, gunzips,
  and reopens the result to confirm the rows survived).
  **Update 2026-08-29/30:** merged (PR #6) and fully live — `BACKUP_EXPORT_SECRET`
  is set in both Railway and as a GitHub Actions repo secret, and a manual
  `workflow_dispatch` run was used to confirm the whole path end to end: it
  hit the live app, pulled a real gzip snapshot, and committed
  `backups/founder-os-2026-08-29.db.gz` to the `db-backups` branch. Runs on
  its own nightly schedule from here with no further action needed.
- **Gmail Worker's quarantine bucket was catching real business mail, not
  just junk — found from a real day of dry-run data, fixed before ever
  going live (2026-08-29/30).** Sean asked when junk triage (see the
  "Zero-Scan, High-Confidence Quarantine" entry above) could go live.
  Rather than guessing, pulled the actual `mail_triage_log` table out of
  that morning's automated backup (the feature directly above) and queried
  it — 11,309 real messages logged since the quarantine model shipped. The
  10 `trash` verdicts were all genuine phishing (Best Buy gift-card scam
  mail) — clean. But the `quarantine` bucket (`BULK_UNSUBSCRIBE_CONFIDENCE`,
  triggered by any List-Unsubscribe header from a sender not already in the
  CRM) was catching 574 of its 2,844 messages from three sources that are
  never junk: the business's own domain (`info@`/`wordpress@`/
  `recruiter@ariseaboveconstruction.com` — the WordPress site's contact-form
  and job-application notifications, including a client walkthrough notice,
  a signed BuildStrong SOW reminder, and a 1099-NEC tax form, all
  misclassified in production), Allo the AI receptionist (`withallo.com` —
  124 missed-call/call-answered alerts, i.e. the lead pipeline itself), and
  this app's own uptime monitoring (`healthchecks.io`). Given the design
  Sean approved — quarantine is a silent safety net he does not review
  daily, and anything left unrescued auto-releases to Trash after 14 days —
  this would have quietly aged out real leads and business documents with
  no one watching. Fixed in `lib/mail-triage.ts`: a new
  `TRUSTED_SENDER_DOMAINS` fast-path check (`isTrustedDomain`, matches the
  three domains above and any subdomain) runs before scoring, same tier as
  the existing known-contact/thread/starred/attachment/keyword exclusions —
  a match wins outright, never scored at all. Re-running the fix against
  the same real dry-run data confirms it: 574 of 2,844 previously-quarantined
  messages now correctly classify as `protected`. `MAIL_TRIAGE_MODE` has
  still never been set to `live` in production — this was caught during
  dry-run specifically so it never had to be caught after real mail was
  actually moved. Tests added to `tests/mail-triage.test.ts` covering all
  three trusted domains (including one that still wins outright against a
  host spam flag) plus `isTrustedDomain` itself (subdomain matching, a
  look-alike domain that must NOT match, and a malformed address with no
  `@`). **Update 2026-08-30:** merged (PR #7) and live in production — Railway
  redeployed automatically. `MAIL_TRIAGE_MODE` is still `dry_run`; go live
  stays Sean's separate, explicit decision.
- **Second round of quarantine false positives found and fixed — Intuit,
  LegalShield, and a real contact with no CRM record (2026-08-30/31).**
  Sean asked again whether triage was ready to go live. Rather than
  assuming the first fix (above) was the whole picture, pulled a fresh
  backup (via a manual `workflow_dispatch` of the backup workflow, so the
  data reflected the PR #7 fix's real behavior in production, not the stale
  pre-fix nightly snapshot) and re-checked. The fix confirmed clean for what
  it targeted — 100% of `ariseaboveconstruction.com`/`withallo.com`/
  `healthchecks.io` mail since deploy classified `protected`, and all 40
  `trash` verdicts were still genuine phishing. But three more sources were
  sitting in quarantine, never junk: `intuit.com` and its subdomains (the
  identity/security stream for the QuickBooks account this business's books
  run through — "New Device Log In," "A passkey was added to your Intuit
  Account," "Your Intuit subscription was canceled" — a security alert
  silently aging out to Trash after 14 days is a real risk, not just an
  annoyance), `legalshieldproviders.com` (an active legal service-request
  thread — "Prepare for your call," "You've missed a call" — not
  marketing), and `qtbizsolutions.com` (Briana Banks, a real
  business-development contact on the BuildStrong Detroit Business Plan
  Process whose invites CC `info@ariseaboveconstruction.com` — she has no
  funnel/CRM record of her own since she's a program contact, not a sales
  lead, so the existing known-contact check could never catch her). Sean's
  call, via AskUserQuestion: fix these too before going live, same as the
  first round. Added all three to `lib/mail-triage.ts`'s
  `TRUSTED_SENDER_DOMAINS` (six domains total now) — no change to the
  mechanism, same fast-path tier as everything else. Re-running the fix
  against the same real backup data confirms it: 328 previously-quarantined
  messages (72 qtbizsolutions.com, 72 legalshieldproviders.com, 152 across
  intuit.com and its four subdomains) now correctly classify as `protected`,
  with the subdomain match catching `appcenter.`/`notifications.`/
  `developerrelations.`/`dp.intuit.com` for free. Two more sources were
  flagged as lower-stakes and left alone rather than added reflexively:
  Michigan LARA licensing-board bulletins (code updates, informational, not
  time-critical) and Michigan Builders License marketing mixed with one real
  order confirmation (not security- or relationship-critical) — adding
  every domain that ever shows up in quarantine would eventually swallow the
  bucket's entire purpose. Tests added to `tests/mail-triage.test.ts` for
  all three new domains plus `isTrustedDomain` coverage. 1387 tests passing,
  `tsc --noEmit` clean. **Update 2026-08-31:** merged (PR #8) and live —
  Railway redeployed automatically. `MAIL_TRIAGE_MODE` still `dry_run`.
- **Full census of every quarantine/trash domain, ever — not just the top
  senders by volume (2026-08-31).** After two rounds of finding false
  positives by sampling the highest-volume senders, Sean asked why every
  check kept finding something new and whether everything could just be
  fixed now instead of trickling in one fix at a time. Fair question, and
  the honest answer was that the first two rounds were sampling (top ~25
  domains by volume each time), not a complete review — a domain sending 18
  messages a quarter wouldn't surface by volume alone even if it mattered
  just as much as one sending 2,000. Fixed the actual process, not just the
  data: pulled every distinct sender domain that has EVER landed in
  `quarantine` (130 domains, 23,262 messages) or `trash` (1 domain, 90
  messages, all confirmed genuine Best Buy gift-card phishing — that bucket
  has never had a false positive) across the full history in the backup, not
  a volume-sorted sample, and reviewed all 130 with Sean in one pass via
  targeted questions rather than guessing. Two more real fixes came out of
  it: **Roofr** (real roofing-estimation software Sean uses — a "password
  changed" security alert was being quarantined, same risk class as the
  Intuit alerts from the first fix) and **Adobe Sign** (real e-signature
  platform — a signature reminder for a Greenlawn Cabinet Warranty was
  sitting in quarantine) both added to `TRUSTED_SENDER_DOMAINS`. A third —
  EPA RRP (lead-paint renovator) certification reminders, a real recurring
  compliance requirement for a renovation contractor — could NOT be fixed as
  a domain-trust entry: the mail routes through a shared Constant Contact
  sending pool (`shared1.ccsend.com`) used by unrelated senders, so trusting
  that domain would have opened the door to arbitrary marketing from anyone
  else using the same pool. Added `'rrp certification'`/`'epa rrp'` to the
  existing `CLIENT_KEYWORDS` subject-match list instead — same mechanism
  already used for `203k`/`permit`/`estimate`, narrow and deterministic, and
  confirmed NOT to catch an unrelated subject line from the same shared
  domain (regression test covers exactly this). Two items surfaced but
  deliberately left alone after Sean's review: `securedirectcapitalsource.com`
  ("Funding for Arise Above Construction") and `patricklarcher.com`, both
  more likely solicitation/scam than real correspondence — correctly
  quarantined, not touched.
  **On "why does this keep happening" and "can we just fix everything
  now":** two separate points worth being direct about. First, this was a
  process gap, not a bottomless one — sampling by volume missed the long
  tail; a full census (done above) doesn't have that blind spot, and there
  is no larger population of domains left to discover beyond it. Second,
  and more importantly: `MAIL_TRIAGE_MODE` has been `dry_run` this entire
  time, on every round of this — dry-run only classifies and logs, it has
  never moved or deleted a single real message. Every "false positive"
  found across all three rounds was a correct prediction of what WOULD
  happen if triage went live, not something that actually happened to real
  mail. There has been no live risk at any point.
  **On "run a smoke test instead":** a smoke test (does the app boot, do
  routes respond) would not have caught any of this — every issue found in
  all three rounds was a data-classification correctness question, not a
  crash. `npm test`/`tsc --noEmit` have been green through every round.
  What actually catches this class of bug is exactly the real-production-
  data review done here, not a build-health check.
  1391 tests passing, `tsc --noEmit` clean (`tests/mail-triage.test.ts`
  covers Roofr, Adobe Sign, the RRP keyword match, and the negative case —
  a different sender on the same shared ESP domain with unrelated content
  stays in quarantine). **Update 2026-08-31:** merged (PR #9) and live —
  Railway redeployed automatically. `MAIL_TRIAGE_MODE` still `dry_run`.
- **Two more from the same census, shipped as a small follow-up
  (2026-08-31).** The census turned up two more candidates —
  `buildfh.com` and `formsubmit.co` — that got flagged as "fixing now" in
  the moment but weren't actually in the PR #9 diff. Caught and corrected
  same-day rather than left as a stale promise: `formsubmit.co` is the AAC
  website's own contact-form delivery backend (its "Activate FormSubmit"
  notice names the site's own `aac-website-a0p.pages.dev` domain — inbound
  leads, not third-party mail), a confident domain-trust addition on its
  own. `buildfh.com` needed a second look before its earlier "confident"
  label was warranted: the census view showed only a bare quarantined
  subject ("Hickory") with no context. Pulling that sender's full log
  history showed `chris@buildfh.com` is a real, recurring contact — calendar
  invites CC'd to info@ariseaboveconstruction.com for property walkthroughs,
  a document share ("Navarre.docx"), forwarded property threads ("Fwd: 2468
  Ford") — and the 18 quarantined messages are a repeating automated notice
  from that same sender that happened to lack a thread/attachment signal of
  its own, the same shape as the qtbizsolutions.com fix. Both added to
  `TRUSTED_SENDER_DOMAINS` with tests. 1393 tests passing, `tsc --noEmit`
  clean. **Update 2026-08-31:** merged (PR #10) and live — Railway
  redeployed automatically. With all four census rounds in,
  `MAIL_TRIAGE_MODE` remains Sean's separate, explicit decision — the
  recommended next step is a clean dry-run pass with everything in place,
  then that go-live conversation.
- **Mail-triage cron outage, root cause and fix (2026-08-31).** Sean asked
  to check on the every-30-minute triage cron; it had in fact been failing
  every single business-hours cycle since 00:08 UTC that day, a Railway 502
  after ~5 minutes on `gmail-worker`, confirmed live by re-triggering the
  workflow and watching it fail the same way. Root cause was a real
  architecture gap, not a fluke: `triageInbox` scans `\Unseen` mail every
  run, but `dry_run` mode correctly never marks anything `\Seen` (that would
  be a mailbox mutation dry_run explicitly promises never to make), and
  `'protected'` verdicts never call `messageMove` either — so nothing
  tracked "already classified" between runs. Every 30-minute cycle
  re-fetched and re-scored the ENTIRE cumulative unseen backlog from
  scratch, forever. Confirmed in the production backup: 72,057
  `mail_triage_log` rows for only 3,787 distinct messages across the three
  inboxes (~19x re-scanning), a cost that grew every day and finally
  exceeded the host's timeout once `seanadavis0@` and `1solutionsgroup1@`
  added their own backlogs to the same concurrent `triageAllInboxes` call —
  taking down all three inboxes at once, not just the two new ones.
  Fixed with a cheap bulk envelope pre-fetch (one IMAP round trip for every
  candidate UID, not one per message) that checks each Message-ID against
  `mail_triage_log` before paying for the expensive per-message `fetchOne`
  — already-logged messages are skipped, only genuinely new mail gets
  classified, and the mailbox itself is never touched, so `dry_run`'s
  zero-mutation guarantee is unaffected. Added `MAIL_TRIAGE_MAX_SCAN_PER_RUN`
  (default 300) as defense in depth against a future burst, and an index on
  `mail_triage_log.message_id` since the dedup check now runs on every
  candidate UID, every run, not just occasionally in the purge sweep. Two
  new tests cover the dedup skip and the scan cap. 1395 tests passing,
  `tsc --noEmit` clean. Verified against the same production backup that
  surfaced the bug: the 19x ratio and the exact 00:08 UTC last-successful-
  run timestamp are what this fix addresses. **Update 2026-09-01:** merged
  (PR #11, commit 037065b) and live — Railway redeployed automatically.
  Verification of the next real cron cycle is in progress (scheduled
  self-check).
- **Personal-inbox census: financial-institution content-based rules
  (2026-09-01).** Sean asked to move toward actually cleaning up the two
  personal inboxes; before recommending that, did for them what the
  business inbox already got — a full census of everything that's ever
  landed in their quarantine, not a volume sample. Found a real problem
  domain-trust can't solve: financial institutions send both genuine account
  alerts and marketing from the exact same sending domain, so trusting the
  domain would let marketing through, and not trusting it risks burying a
  real payment problem in Quarantine for up to 14 days. Confirmed concretely
  in the data: a Citi minimum-payment-due alert, a Citizens Bank "we
  couldn't process your payment" notice, two Home Depot commercial-card
  payment-due/needs-attention notices, and an Experian dispute-results
  notice were all sitting in Quarantine right next to Amex Offers, a debt-
  consolidation pitch, and a car-insurance upsell from the same senders.
  Nothing had actually happened — `MAIL_TRIAGE_MODE` has been `dry_run` this
  entire time — but it's the clearest evidence yet for why these two inboxes
  can't go live on the business inbox's domain-trust approach.
  Fixed with a new `FINANCIAL_ALERT_KEYWORDS` subject-phrase list (same
  fast-path-exclusion mechanism as `CLIENT_KEYWORDS`/the EPA RRP fix, applied
  content-first instead of domain-first): phrases specific to a genuine
  account event (a due date, a failed charge, a statement, a dispute
  outcome) rather than vague framing like "action needed" that marketing
  uses just as often as a real notice does — those two ambiguous cases
  (Capital One "please review your income and employment info") were left
  in Quarantine deliberately rather than guessed at; nothing there is ever
  deleted, only released to Trash after 14 days. Also fixed `findMatch` to
  normalize typographic apostrophes/quotes (’‘“”), which the Citizens Bank
  test caught immediately — real mail templates almost never use a plain
  ASCII apostrophe. Verified against the actual production backup by
  reclassifying every distinct quarantined (sender, subject) combination
  from both personal inboxes with the new rules: 18 of 568 flip to
  protected — exactly the payment-due/failed/statement/dispute-result class
  of message — and the other 550, including every Amex Offers/Equifax
  credit-pitch/Rocket Mortgage marketing email checked by hand, still
  quarantine unchanged. 1407 tests passing (12 new, covering both the
  rescued notices and the marketing that must stay caught), `tsc --noEmit`
  clean. **Update 2026-09-01:** merged (PR #12, commit d7d4bcc) and live —
  Railway redeployed automatically. This is still just the content-based
  ruleset landing — going live on either personal inbox remains a separate
  decision, and a fresh dry-run pass with this ruleset in place should run
  for a few days first so any further gaps surface before real mail is ever
  moved.
- **Business-hours cron window extended to 11pm ET (2026-09-01).** Sean
  said he still gets real business email well after close, up to around
  11pm ET, but `agent-cron-checks.yml`'s `every-30` group (gmail-worker,
  calendar-worker, comms-agent) stopped polling at 6pm ET (`12-22` UTC).
  Extended `every-30` and `every-15` (allo-pulse, website-pulse — lead
  intake, extended for the same reason: an evening call or web lead is just
  as real as an evening email, and these are cheap read-only checks) to
  `12-23,0-3` UTC, which is 8am-11:59pm ET — a standard cron hour range
  can't wrap past midnight in one span, so the tail end (8pm-11:59pm ET)
  has to be expressed as the separate `0-3` UTC sub-range. Left `hourly`
  (data-agent, conductor — an internal liveness heartbeat, not a
  customer-facing signal) at the original 6pm ET cutoff; say the word if
  that should move too. Updated both the `on.schedule` cron string and each
  job's matching `if: github.event.schedule == '...'` condition together —
  this workflow's own job-level guard means a cron string changed without
  its `if:` would silently stop that job from ever firing on schedule.
  Verified the new window with `croniter` against a sample day: the
  `every-30` schedule fires continuously from 8:00am to 11:30pm ET with no
  gap, and produces no times outside that window. Config-only change (no
  app code), so there's no `npm test`/`tsc` equivalent to run; the real
  confirmation is a scheduled cron firing after the old 6pm ET cutoff.
  **Update 2026-09-01:** merged (PR #13, commit df61792) and live — GitHub
  Actions picks up `on.schedule` changes from the default branch directly, no
  Railway redeploy needed. Same reminder as always: the DST-hardcoded-in-UTC
  caveat this file already flags means these exact UTC values will need
  revisiting when DST ends in early November.
- **CI workflow added — tests now run automatically before code reaches
  production (2026-09-01).** Sean asked for a "heart to heart" on why
  arise-os looked unstable (Railway crash notifications, GitHub Actions
  failures, an expiring GitHub token). Investigation found the app itself
  wasn't actually unstable: all 13 recent GitHub Actions failures predated
  the mail-triage outage fix (PR #11, 037065b) with zero since, and every
  Railway "Deployment crashed" notification checked (going back 3 days)
  turned out to be the same false positive — `next start` receiving a
  routine SIGTERM when a new deploy replaces the old container, which npm's
  wrapper logs as `npm error signal SIGTERM`, which Railway's crash-detector
  reads as a real crash. The currently active deployment has run 3+ hours
  clean with a single start event. But one real gap surfaced: this repo had
  **no CI workflow at all** — every merge to `rebuild/arise-above` deployed
  straight to production with no automated test gate, and Railway's own
  "Wait for CI" setting (Settings → Deploy) was off. The two real past
  incidents in this log (the `mail_triage_log` migration-ordering bug and
  the mail-triage rescan/timeout outage) both reached production because
  nothing automated verified the change first — the 1400+-test vitest suite
  that would have caught them already existed, it just only ever ran on a
  developer's own machine before merge, never in CI.
  Added `.github/workflows/ci.yml`: runs `npm ci`, `npm run typecheck`
  (`tsc --noEmit`), and `npm test` (vitest) on every push and pull request
  against `rebuild/arise-above`. Verified end-to-end against a clean
  `npm ci` install (not just the sandbox's existing `node_modules`): 1407
  tests passing across 143 files, typecheck clean. **Still needs:** (1) this
  branch has not been merged yet (same no-push-access handoff as every fix
  in this log); (2) even once merged, Railway's "Wait for CI" toggle is a
  separate manual step Sean has to flip himself (Settings → Deploy →
  "Wait for CI") — until then this workflow reports pass/fail on every PR
  but doesn't yet block a deploy from going out in parallel with a failing
  check.
- **GitHub token renewal (2026-09-01).** Investigation (same session as the
  CI workflow above) found two fine-grained PATs tied to this project
  nearing expiry: `arise-console-deploy` (was expiring Sep 5) and
  `founderos-demo-cloud-agent` (expires Sep 11) — found via
  github.com/settings/personal-access-tokens. Could not confirm
  `arise-console-deploy`'s exact scope or what depends on it; GitHub's
  sudo-mode password re-confirmation blocked viewing that without Sean's
  password, which Claude does not enter on his behalf. **Update:** Sean
  regenerated `arise-console-deploy` himself — new 90-day expiration.
  **Update (2026-09-03):** Sean also regenerated `founderos-demo-cloud-agent`
  himself — new expiration in November 2026. Both fine-grained PATs found in
  this entry are now current; nothing outstanding here.
- **Next.js 14 → 15 upgrade (2026-09-01).** Direct follow-through on the CI
  workflow entry above: `npm audit` during that work surfaced 6 high-severity
  CVEs in `next` itself (DoS / HTTP-request-smuggling class, installed
  `14.2.35`, fixed only in `15.0.8+`) that hadn't been surfaced to Sean —
  scoped as its own task, then executed once he said go. Bumped `next` to
  `^15.5.25` (React stayed on 18.3.1 — Next 15 supports React 18.2+, no need
  to touch it). Ran the official `@next/codemod next-async-request-api`
  migration for the breaking change this major version turns on: `cookies()`,
  `headers()`, route `params`, and `searchParams` all became `Promise`-based
  instead of synchronous. Codemod touched 15 files (not the ~26 an initial
  grep suggested — most of the grep hits were `searchParams` read off a
  manually-constructed `URL` object, which was never affected). One codemod
  output was corrected by hand rather than accepted as-is:
  `lib/business-filter-server.ts` had been auto-migrated to the deprecated
  `UnsafeUnwrappedCookies` sync escape hatch — all 5 call sites were already
  inside `async` page components, so it was switched to a real
  `await cookies()` instead of leaving the deprecated shim in a file that
  feeds the business-filter cookie every page reads. Also fixed by hand:
  `next.config.mjs`'s `experimental.serverComponentsExternalPackages` flag,
  stabilized in v15 to a top-level `serverExternalPackages` key (the codemod
  doesn't touch `next.config`). `middleware.ts` — the Basic Auth gate in
  front of ~40 API routes — uses none of the affected APIs and needed no
  code change; its own `tests/middleware.test.ts` passing under the upgrade
  is the verification that Next 15 didn't change its behavior.
  Verified against a clean `npm ci` install: typecheck clean, all 1407 tests
  passing across 143 files (2 pre-existing tests were source-regex
  assertions pinned to the old synchronous call-site text —
  `tests/funnel-page.test.ts` and `tests/track-page.test.ts` — updated to
  match the new, equally-correct `await` form, not weakened). Post-upgrade
  `npm audit`: the 6 high-severity Next CVEs are gone. One moderate `next`
  advisory remains, transitive via bundled `postcss`, with no fix short of
  Next 16 — separate, lower-priority, not addressed here. `mailparser` also
  carries a pre-existing high-severity advisory, unrelated to this upgrade —
  flagged, not touched. **Could not verify:** a full `npm run build` inside
  this sandbox — `next/font/google` fetches `JetBrains Mono` from
  fonts.googleapis.com at build time (same call this app has always made,
  not new to v15), and this sandbox's network egress blocks that host. This
  isn't a new gap: `ci.yml` doesn't run `next build` either (only typecheck +
  test), so the build step's first real verification has always been
  Railway's own build during deploy — same as before this change. **Still
  needs:** merge (same no-push-access handoff as every fix in this log), and
  watching the first real Railway build/deploy after merge to confirm it
  succeeds where this sandbox couldn't check.

## Views

`/` operator console · `/comms` unified email + calendar feed · `/funnel` the
AAC pipeline (flow + radial views) · `/finances` QuickBooks + statement
uploads · `/agents` roster with Run buttons · `/org` hierarchy board with the
business lens (markup frozen — do not restructure) · `/brain` knowledge layer ·
`/aac-brain` the AAC Brain's own operational health (Sean's Mac automation —
distinct from `/brain` above) · `/roadmap` the real rebuild roadmap · `/analytics` real connector numbers ·
`/reference` reference model · `/integrations` connections board ·
`/workflows` `/tasks` `/skills` supporting views. `/social`, `/content`,
`/personas` surfaced into their own "Marketing" nav group (`NAV_MARKETING` in
`lib/nav.ts`) on 2026-08-14 now that OneUp (social connector) is live — they
still render honest empty states wherever there's genuinely nothing yet.
`/track/[token]` — the public, no-login client progress tracker (2026-08-27,
see the Connectors & agents section above) — is NOT part of the internal
dashboard nav; it's reached only via a signed link sent to a client, and
deliberately renders outside the `os.*` shell entirely.

## Conventions

- TDD: failing test first, then implementation. Tests live in `tests/`,
  one file per module; use `FOUNDER_OS_DB=:memory:` pattern (see `tests/db.test.ts`).
- Zod-validate anything that crosses the DB or API boundary.
- HONESTY: no invented numbers anywhere. Empty states say why they're empty
  and what connects them. A connector is "connected" only when it truly is.
- THEME: **Copper is the default** as of 2026-08-14 (`DEFAULT_THEME` in
  `lib/theme.ts`; bare `:root` in `app/globals.css` carries the copper
  tokens) — Sean's call, off the prior monochrome default. Monolith Signal
  (`mono`) remains a fully selectable theme, just no longer bare-root-anchored.
  Tokens live in `tailwind.config.ts` (`os.*`) AND as raw CSS vars in
  `app/globals.css` — keep the two in sync. JetBrains Mono everywhere; square
  corners; hairline borders; color = status only in mono.
- Env vars: `FOUNDER_OS_DB`, `BRAIN_PROVIDER`, `BRAIN_STORE`, `LLM_PROVIDER`,
  plus connector creds in `.env.local`. (`FOUNDER_OS_DB` and the
  `founder-os.db` filename keep their original names for deploy compat.)
- Heavy interaction-driven visualizations load via `next/dynamic`
  (`ssr: false`) behind dimension-matched skeletons (contract in
  `tests/code-splitting.test.ts`).
- Hosting: Railway (see `README.md`). The SQLite store needs a mounted volume
  in production — an ephemeral filesystem silently drops the DB (including
  stored OAuth tokens) on every redeploy. Point `FOUNDER_OS_DB` at a path
  inside the mounted volume.
- `rebuild/arise-above` is the repo's **default branch** (switched from the
  stale `main` on 2026-08-14) — this matters beyond habit: GitHub Actions
  only picks up `on: schedule` and `on: workflow_dispatch` triggers from
  whichever branch is default, so the Chief of Staff cron workflow was
  invisible to GitHub until this switch, independent of its secrets being
  set correctly. `main` still exists but is 15 commits behind and unused.
  Same caveat applies to `.github/workflows/agent-cron-checks.yml` (the
  schedules for the rest of the agent roster, added 2026-08-21) and to any
  future scheduled workflow: it only fires once it lives on whichever branch
  is default at the time, not necessarily the branch it was authored on.

## Multi-agent etiquette

Multiple Claude Code sessions may work on this repo concurrently:

- Commit small checkpoints often (`git log --oneline` to see where others are).
- Run `npm test && npm run typecheck` before claiming anything done.
- Don't kill another session's dev server if one is already running on 4100.
  If your edit crashes the dev server's hot reload, fix it fast: a crash loop
  corrupts `.next` and breaks every session's page chunks (kill the port,
  `rm -rf .next`, restart).
- Leave handoff notes in `docs/` if you stop mid-feature.
