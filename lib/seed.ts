import type { FounderDb } from '@/lib/db';
import type {
  Agent,
  AgentTask,
  Department,
  Domain,
  EmailListSnapshot,
  FunnelContact,
  FunnelTouch,
  Metric,
  Person,
  Phase,
  RoadmapItem,
  SopTask,
  Workflow,
  Skill,
  SocialAccount,
  SocialDm,
  SocialDmSnapshot,
  SocialDmMessage,
  SocialPost,
  SocialSnapshot,
  Tool,
} from '@/lib/schemas';

// Monochrome palette — the UI is strict black & white; "color" fields carry
// grayscale steps used only for subtle hierarchy.
const GRAY = {
  white: '#fafafa',
  light: '#d4d4d4',
  mid: '#a3a3a3',
  dim: '#737373',
  dark: '#525252',
};

// the operator's five operating pillars (2026-06-12 directive).
const departments: Department[] = [
  { id: 'dept-sales', name: 'Sales', slug: 'sales', tagline: 'Pipeline and deals.', color: GRAY.white, order: 1 },
  { id: 'dept-marketing-growth', name: 'Marketing/Growth', slug: 'marketing-growth', tagline: 'Publishing, content, attention.', color: GRAY.light, order: 2 },
  { id: 'dept-tech', name: 'TECH', slug: 'tech', tagline: 'AI, automations, knowledge layer.', color: GRAY.mid, order: 3 },
  { id: 'dept-finance', name: 'Finances', slug: 'finances', tagline: 'Every processor, one view.', color: GRAY.dim, order: 4 },
  { id: 'dept-comms', name: 'Communications', slug: 'communications', tagline: 'Email + calendar → one feed.', color: GRAY.dark, order: 5 },
  { id: 'dept-clients', name: 'Clients', slug: 'clients', tagline: 'Every client, onboarded and served.', color: GRAY.light, order: 6 },
];

// The roster IS the runtime — every row here maps 1:1 to a RuntimeAgent in
// lib/agents/real.ts (enforced by tests/seed.test.ts). No larp agents.
//
// Shape: top-level agents (parentId null) are INSTANCE slots — each one is
// what becomes its own OpenClaw Hermes / Claude Code process on the dedicated host
// (`instance` records that binding; everything is 'builtin' until then).
// Worker rows underneath them do one specific task each and sit at the
// bottom of the hierarchy.
const agents: Agent[] = [
  // ── TECH: command + knowledge ───────────────────────────────────────────
  {
    id: 'conductor',
    departmentId: 'dept-tech',
    name: 'Conductor',
    role: 'Broadcast & Orchestration',
    status: 'active',
    tier: 'lead',
    description: 'Fans a message out to every agent at once and reports fleet size and run history from the DB.',
    model: 'fan-out runtime',
    tools: ['broadcast'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'data-agent',
    departmentId: 'dept-tech',
    name: 'Data Agent',
    role: 'Knowledge Search',
    status: 'planned',
    tier: 'lead',
    description: 'Answers questions from the knowledge layer through the brain provider abstraction — real grep search over the bundled markdown store today, upgradeable to a vector provider later.',
    model: 'brain provider',
    tools: ['brain'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'chief-of-staff',
    departmentId: 'dept-tech',
    name: 'Chief of Staff',
    role: 'Proactive Monitor',
    status: 'planned',
    tier: 'lead',
    description: 'Watches the funnel, QuickBooks, and inboxes for hot leads, overdue invoices, and unread work mail; pushes only what is new via ntfy. Activates as each source connects — real even with zero sources configured (reports nothing outstanding, honestly).',
    model: 'signal engine + ntfy',
    tools: ['funnel', 'quickbooks', 'imap', 'ntfy'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Communications: one instance, two channel workers feeding /comms ────
  {
    id: 'comms-agent',
    departmentId: 'dept-comms',
    name: 'Comms Agent',
    role: 'Unified Communications Instance',
    status: 'active',
    tier: 'lead',
    description: 'Owns the unified /comms feed. Aggregates its channel workers and reports which are live.',
    model: 'aggregate of workers',
    tools: ['comms-feed'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'gmail-worker',
    departmentId: 'dept-comms',
    name: 'Gmail Worker',
    role: 'IMAP Inboxes ×4',
    status: 'planned',
    tier: 'worker',
    description: 'Pulls unread counts and recent mail from up to four IMAP inboxes into /comms. Activates when INBOX_* creds land.',
    model: 'imapflow',
    tools: ['imap'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  {
    id: 'calendar-worker',
    departmentId: 'dept-comms',
    name: 'Calendar Worker',
    role: 'Schedule Feed',
    status: 'planned',
    tier: 'worker',
    description: 'Upcoming events from ICS/CalDAV calendar feeds. Activates when CAL_* creds land.',
    model: 'node-ical',
    tools: ['calendar'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  // ── Sales ────────────────────────────────────────────────────────────────
  {
    id: 'allo-pulse',
    departmentId: 'dept-sales',
    name: 'Allo Pulse',
    role: 'Lead Intake',
    status: 'planned',
    tier: 'lead',
    description: 'Pulls the Allo (248) 717-1417 call log and files inbound lead calls into the AAC pipeline at Inquiry. Activates when ALLO_API_KEY lands.',
    model: 'allo rest api',
    tools: ['allo'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'website-pulse',
    departmentId: 'dept-sales',
    name: 'Website Pulse',
    role: 'Lead Intake',
    status: 'planned',
    tier: 'lead',
    description: 'Reads FormSubmit.co website-form notification emails from the connected inbox and files them into the AAC pipeline at Inquiry. No new credentials — activates the moment an INBOX_* slot is set (the same one Comms already reads).',
    model: 'imap + formsubmit parser',
    tools: ['imap'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Marketing/Growth ────────────────────────────────────────────────────
  {
    id: 'social-pulse',
    departmentId: 'dept-marketing-growth',
    name: 'Social Pulse',
    role: 'Publishing',
    status: 'planned',
    tier: 'lead',
    description: 'Publishes posts queued on the Social tab through OneUp\'s real API. Activates when ONEUP_API_KEY + ONEUP_CATEGORY_ID land.',
    model: 'oneup rest api',
    tools: ['oneup'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Finances ─────────────────────────────────────────────────────────────
  {
    id: 'quickbooks-pulse',
    departmentId: 'dept-finance',
    name: 'QuickBooks Pulse',
    role: 'Books Monitor',
    status: 'planned',
    tier: 'lead',
    description: 'Reports the QuickBooks connection state; month-to-date income and expenses once the OAuth grant lands.',
    model: 'quickbooks api',
    tools: ['quickbooks'],
    parentId: null,
    instance: 'builtin',
  },
];

// ── Humans in the process ─────────────────────────────────────────────────────
// Empty on purpose: the previous seed carried invented staff. Real hires get
// added here when they exist — a name in this file means a real person.
const people: Person[] = [];

// ── SOP tasks — every agent's job, written out ───────────────────────────────
// One task per worker, one worker per task (monogamous; tests enforce it).
// The chain the /brain graph draws: department → task → worker → tools.
const sopTasks: SopTask[] = [
  {
    id: 'sop-conductor', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'conductor',
    title: 'Broadcast directives across the fleet',
    summary: 'One message in, every agent briefed, replies collected.',
    steps: [
      'Receive the directive from the operator console',
      'Resolve the target list: the whole fleet, or the pillar the directive names',
      'Fan the message out to every target at once and stamp each send',
      'Wait for every agent to answer and record each reply to broadcast_replies',
      'Surface a failure as its own agent\'s honest error text, never a silent gap',
    ],
  },
  {
    id: 'sop-data-agent', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'data-agent',
    title: 'Answer questions from the knowledge layer',
    summary: 'Search through the provider abstraction, honest fallbacks.',
    steps: [
      'Parse the incoming question into a search query',
      'Run the query through the configured brain provider',
      'Report an honest empty result when the query matches nothing in the store',
      'Return cited passages with their source notes, never invented ones',
      'Log unanswerable questions as gaps to fill',
    ],
  },
  {
    id: 'sop-chief-of-staff', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'chief-of-staff',
    title: 'Watch the playing field, push only what is new',
    summary: 'Funnel + QuickBooks + inbox signals, deduped, pushed via ntfy.',
    steps: [
      'Gather hot/fading leads from the funnel\'s own attention model',
      'Pull overdue and open QuickBooks invoices where the OAuth grant is connected',
      'Pull unread work-lane email from the unified comms feed where an inbox is connected',
      'Drop every signal already pushed on a prior run — dedupe by signal id in seed_meta',
      'Push only genuinely new high-severity signals to NTFY_TOPIC; report honestly when nothing is outstanding',
    ],
  },
  {
    id: 'sop-comms-agent', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'comms-agent',
    title: 'Compose the unified comms feed',
    summary: 'Email and calendar, one timeline at /comms.',
    steps: [
      'Collect fresh output from the Gmail and Calendar workers',
      'Dedupe and merge everything into one ordered timeline',
      'Mark which channels are live and which are awaiting credentials',
      'Surface the merged feed to /comms and the operator console',
      'Report per-channel errors honestly instead of hiding a dead source',
    ],
  },
  {
    id: 'sop-gmail-worker', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'gmail-worker',
    title: 'Triage the inboxes',
    summary: 'Up to four IMAP inboxes, honest unread counts, junk quarantined or trashed by confidence — silently.',
    steps: [
      'Poll each configured IMAP inbox for unread counts and recent mail',
      'Report per-inbox errors instead of hiding a dead connection',
      'Feed recent messages into the unified comms timeline',
      // Junk triage is OFF by default (MAIL_TRIAGE_MODE unset) — the three
      // steps above are the only thing that runs until Sean turns it on.
      // "Zero-Scan, High-Confidence Quarantine" model (2026-08-28, Sean's
      // spec) — deterministic confidence scoring, never an LLM judgment:
      'Fast-path safety first: a known contact, an existing thread, a starred message, an attachment, or a client/project keyword bypasses junk scoring entirely and is never touched',
      'Score everything else for junk-confidence. >=95% -> junk. 60-94% -> ambiguous. <60% -> left alone',
      'In dry_run mode: log every verdict, move nothing',
      'In live mode: >=95% confidence moves to Trash (capped per run); 60-94% moves to a Quarantine folder, silently, no alert; under 60% passes straight to the inbox untouched — never a permanent delete, never a guessed folder',
      'Quarantined mail with no other action releases itself to Trash after 14 days — the Quarantine folder is the safety net, checked in Gmail directly if a missing email is ever brought up, not a daily digest',
      'Log every triage decision to an audit trail, whether or not anyone reviews it day to day',
    ],
  },
  {
    id: 'sop-calendar-worker', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'calendar-worker',
    title: 'Surface the schedule',
    summary: 'Upcoming events from every connected calendar feed.',
    steps: [
      'Fetch the ICS/CalDAV feed for each configured calendar account',
      'Merge events across calendars into one upcoming list',
      'Extract join links so meetings are one click away',
      'Report honestly when no calendar credentials are set',
      'Skip cancelled events and expand recurring ones correctly',
    ],
  },
  {
    id: 'sop-quickbooks-pulse', departmentId: 'dept-finance', assigneeKind: 'agent', assigneeId: 'quickbooks-pulse',
    title: 'Report the books truthfully',
    summary: 'QuickBooks connection state, income and expenses.',
    steps: [
      'Check the stored OAuth grant and refresh tokens before they expire',
      'Pull month-to-date income and expenses from QuickBooks once connected',
      'List open invoices with balances and due dates',
      'Report not-configured honestly until the grant lands — no faked money',
      'Surface token-refresh failures the moment they happen',
    ],
  },
  {
    id: 'sop-allo-pulse', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'allo-pulse',
    title: 'File every real lead call',
    summary: 'Allo call log → AAC pipeline, spam stays out.',
    steps: [
      'Pull the call log from the Allo REST API with the scoped key',
      'Open a new journey at Inquiry for every first-time legitimate caller',
      'Append a touch to the existing journey on repeat calls — idempotent by call id',
      'Keep spam, hangups, and outbound legs out of the pipeline',
      'Never move a journey stage — stage changes are Sean’s decision',
    ],
  },
  {
    id: 'sop-website-pulse', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'website-pulse',
    title: 'File every real website form submission',
    summary: 'FormSubmit.co notification emails → AAC pipeline, specific attribution kept.',
    steps: [
      'Search the connected inbox for FormSubmit.co notification emails from the last 45 days',
      'Parse both live forms\' field layouts (the booking form and the main-site contact form)',
      'Open a new journey at Inquiry for every first-time submitter, or merge onto an existing one by phone/email',
      'Fold the "how found AAC" answer into the touch label so Google/Referral attribution stays specific, not just "Website"',
      'Drop submissions with no phone or email — not reachable, not a lead',
      'Never move a journey stage — stage changes are Sean’s decision',
    ],
  },
  {
    id: 'sop-social-pulse', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'social-pulse',
    title: 'Publish every queued post through OneUp',
    summary: 'Social tab queue → real OneUp accounts, honest per-post outcomes.',
    steps: [
      'Pull every post queued on the Social tab (status: queued)',
      'Match each post\'s platforms to OneUp\'s real connected accounts',
      'Publish via OneUp\'s scheduletextpost/scheduleimagepost API',
      'Mark a post failed with the real reason on a platform mismatch or a rejected post — never silently drop it',
      'Never post without ONEUP_CATEGORY_ID configured — no guessed category',
    ],
  },
];

// The honest tool list: only what this OS actually integrates with today.
// status 'available' = implemented, goes live when credentials land.
const tools: Tool[] = [
  { id: 'tool-imap', name: 'Email (4 IMAP slots)', category: 'Comms', status: 'available', color: GRAY.light, description: 'Client implemented for 4 inboxes — set INBOX_1..4_HOST/_USER/_PASS.' },
  { id: 'tool-calendar', name: 'Calendar (ICS/CalDAV)', category: 'Comms', status: 'available', color: GRAY.mid, description: 'Upcoming events across calendar feeds — set CAL_1_USER/_PASS.' },
  { id: 'tool-quickbooks', name: 'QuickBooks', category: 'Finance', status: 'available', color: GRAY.white, description: 'The real books: MTD income/expenses + open invoices once the OAuth grant lands.' },
  { id: 'tool-llm', name: 'Claude API', category: 'AI', status: 'available', color: GRAY.light, description: 'LLM lane for agent chat — set ANTHROPIC_API_KEY (stub provider in tests).' },
  { id: 'tool-allo', name: 'Allo (call log)', category: 'Sales', status: 'available', color: GRAY.light, description: 'AI receptionist call log → funnel lead intake — set ALLO_API_KEY (Conversations Read scope).' },
  { id: 'tool-oneup', name: 'OneUp (social publish)', category: 'Marketing', status: 'available', color: GRAY.mid, description: 'Publishes Social-tab posts to real connected accounts — set ONEUP_API_KEY + ONEUP_CATEGORY_ID.' },
  { id: 'tool-ntfy', name: 'ntfy (push)', category: 'AI', status: 'available', color: GRAY.dim, description: 'Chief of Staff push notifications — set NTFY_TOPIC (optional NTFY_URL for a self-hosted instance).' },
  { id: 'tool-brain-store', name: 'Markdown knowledge store', category: 'Knowledge', status: 'available', color: GRAY.mid, description: 'Point BRAIN_STORE at a folder of markdown — grep search + capture, no external service.' },
  { id: 'tool-railway', name: 'Railway (hosting)', category: 'Infrastructure', status: 'connected', color: GRAY.dim, description: 'Production host; SQLite lives on a mounted volume so redeploys keep data.' },
];

// The real rebuild roadmap — what has actually shipped and what is next.
const roadmap: RoadmapItem[] = [
  { id: 'rm-p0', title: 'Phase 0: foundation', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Railway volume mounted (DB survives deploys), creds hygiene, ownership docs.' },
  { id: 'rm-p1', title: 'Phase 1: business lens', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'AAC / Apps / Combined switcher; businesses replace the demo ventures.' },
  { id: 'rm-p2', title: 'Phase 2: the purge', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Demo connectors, invented data, and fictional roster removed; AAC pipeline in the funnel.' },
  { id: 'rm-qbo', title: 'Reconnect QuickBooks', quarter: '2026-Q3', status: 'done', departmentId: 'dept-finance', description: 'Live: /finances is pulling real QuickBooks data — company name, MTD income/expenses, and open invoices (confirmed $178,262 across 67 unpaid invoices with real customer/address data). The token is valid; no reconnect needed.' },
  { id: 'rm-email', title: 'Connect the inboxes', quarter: '2026-Q3', status: 'done', departmentId: 'dept-comms', description: 'Live: INBOX_1 is connected and pulling real mail into /comms (1 inbox, thousands of real messages triaged). Inboxes 2-4 are open slots for whenever there\'s a second address to add — not required.' },
  { id: 'rm-cal', title: 'Connect the calendar', quarter: '2026-Q3', status: 'done', departmentId: 'dept-comms', description: 'Live: the calendar connector reuses the same Gmail app password already sitting in INBOX_1 (CalDAV over the existing credential, no separate setup) — /comms shows Calendar: Connected with real events.' },
  { id: 'rm-allo', title: 'Allo call log → funnel', quarter: '2026-Q3', status: 'done', departmentId: 'dept-sales', description: 'Live: ALLO_API_KEY is set and Allo Pulse is pulling real inbound calls into the pipeline — 170+ real Inquiry-stage leads on /funnel right now, tagged ALLO with call summaries.' },
  { id: 'rm-website-leads', title: 'Website form leads → funnel', quarter: '2026-Q3', status: 'done', departmentId: 'dept-sales', description: 'Website Pulse reads FormSubmit.co notification emails from the connected inbox and files them into the pipeline, tagged by real source (not a blanket "Website" bucket) — no new credentials, reuses the Comms inbox. Radial funnel attribution sharpened to match.' },
  { id: 'rm-chief-of-staff', title: 'Chief of Staff: proactive signals', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Live: NTFY_TOPIC and CRON_SECRET are set on Railway, CRON_SECRET and ARISE_OS_URL are set as GitHub Actions secrets, and the repo\'s default branch was switched from the stale main to rebuild/arise-above — scheduled and manually-dispatched workflows only run off the default branch, so that switch was the real unlock, not just the secrets. First manual run succeeded (Chief of Staff check #1). Runs hourly, 8am-6pm Eastern.' },
  { id: 'rm-sops', title: 'Agent SOPs, surfaced', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Every agent and person\'s written Standard Operating Procedure gets its own readable page (/sops) instead of being buried in the knowledge graph — the checklist each worker actually follows, in one place.' },
  { id: 'rm-apps-funnel', title: 'Define the Apps funnel', quarter: '2026-Q4', status: 'done', departmentId: 'dept-sales', description: 'Decided and shipped: Apps is a product funnel, not a sales pipeline, since Sean builds and publishes the apps himself. Real stages now live in code: Discovered, Installed, Activated, Trial started, Subscribed, Retained. The Apps tab on /funnel filters by these, and the flow canvas now renders the real Apps hubs too (honestly at zero — no Apps journeys yet). The radial view stays AAC-only: its rim is AAC\'s real lead-source wedges (phone, Google, website, social, referral), which Apps has no equivalent data for, so radial is disabled for Apps rather than showing wedges that don\'t mean anything for it.' },
  { id: 'rm-crm', title: 'CRM: Allo stays source of truth', quarter: '2026-Q4', status: 'done', departmentId: 'dept-sales', description: 'Decided: the Allo CRM stays the source of truth for leads — no HubSpot sync. Every inbound call already flows into /funnel via Allo Pulse; nothing further to build here.' },
  { id: 'rm-agent-cron', title: 'Schedule the rest of the agent roster', quarter: '2026-Q3', status: 'now', departmentId: 'dept-tech', description: 'A production review found only Chief of Staff had a real schedule — the other 9 real agents only ever ran from the manual "Run" button on /agents, so most of the roster showed zero run history. app/api/cron/[agentId]/route.ts generalizes the old single-agent cron route (same CRON_SECRET gate, same 501-when-unconfigured honesty) and .github/workflows/agent-cron-checks.yml adds a real GitHub Actions schedule per agent at a cadence sized to what it does. In code now; "now" not "done" because GitHub Actions only fires scheduled workflows off whichever branch is the repo default (rebuild/arise-above) — this flips to done once that\'s merged there and a first real scheduled run has actually landed in agent_runs, the same bar Chief of Staff itself had to clear.' },
];

// Honest zeros — these flip to live numbers as connectors come online.
const metrics: Metric[] = [
  { id: 'metric-unread', key: 'unread_total', label: 'Unread (all inboxes)', value: 0, unit: 'emails', delta: 0, period: 'pending creds' },
  { id: 'metric-brain', key: 'brain_pages', label: 'Brain-store Pages', value: 0, unit: 'pages', delta: 0, period: 'run Data Agent' },
  { id: 'metric-qbo-net', key: 'qbo_net_mtd', label: 'QuickBooks Net (MTD)', value: 0, unit: 'usd', delta: 0, period: 'pending OAuth' },
  { id: 'metric-runs', key: 'agent_runs', label: 'Agent Runs Logged', value: 0, unit: 'runs', delta: 0, period: 'all time' },
];

const domains: Domain[] = [
  { id: 'brm-1', number: 1, title: 'Command & Memory', color: GRAY.white, items: ['Operator dashboard', 'Agent run history', 'Markdown knowledge store'] },
  { id: 'brm-2', number: 2, title: 'Email Operations', color: GRAY.light, items: ['Four IMAP inboxes', 'Unread triage', 'Per-inbox health'] },
  { id: 'brm-3', number: 3, title: 'Schedule', color: GRAY.light, items: ['CalDAV calendar feeds', 'Meeting join links', 'Week-ahead view'] },
  { id: 'brm-4', number: 4, title: 'Books & Revenue', color: GRAY.mid, items: ['QuickBooks income/expenses', 'Open invoices', 'Statement uploads'] },
  { id: 'brm-5', number: 5, title: 'Lead Pipeline', color: GRAY.mid, items: ['AAC stages inquiry → paid', 'Decay + attention queues', 'Allo call log (planned)'] },
  { id: 'brm-6', number: 6, title: 'Agent Runtime', color: GRAY.dim, items: ['Registry + run()', 'Persisted run log', 'Honest failure states'] },
  { id: 'brm-7', number: 7, title: 'Infrastructure', color: GRAY.dim, items: ['Railway hosting', 'Mounted volume for SQLite', 'Deploy pipeline'] },
  { id: 'brm-8', number: 8, title: 'Security', color: GRAY.dark, items: ['.env.local secrets (gitignored)', 'Read-only connector scopes', 'No keys in repo'] },
];

const phases: Phase[] = [
  { id: 'phase-0', number: 1, title: 'Foundation', items: ['Railway volume', 'Creds hygiene', 'Ownership docs'] },
  { id: 'phase-1', number: 2, title: 'Business Lens', items: ['AAC / Apps switcher', 'businesses.ts', 'Explicit business args'] },
  { id: 'phase-2', number: 3, title: 'The Purge', items: ['Demo connectors out', 'Invented data out', 'AAC pipeline in'] },
  { id: 'phase-3', number: 4, title: 'Real Connections', items: ['QuickBooks OAuth', 'Email + calendar creds', 'Allo call log → funnel'] },
];

// Real Arise Above Construction accounts — handles only, no invented
// follower counts. Snapshot history stays empty until a real source records
// it; the dashboards render honest nulls.
const socialAccounts: SocialAccount[] = [
  { platform: 'instagram', handle: '@ariseaboveconstruction', url: 'https://instagram.com/ariseaboveconstruction', order: 1 },
];

const socialBaseline: SocialSnapshot[] = [];
const emailListBaseline: EmailListSnapshot[] = [];
const socialDms: SocialDm[] = [];
const socialDmMessages: SocialDmMessage[] = [];
const socialDmSnapshots: SocialDmSnapshot[] = [];
const socialPosts: SocialPost[] = [];

// ── Funnel journeys ─────────────────────────────────────────────────────────
// Empty on purpose: the previous seed carried ~12 invented client journeys.
// Real AAC leads land here (via the Allo call log, a CRM sync, or manual
// entry) in the real pipeline: inquiry → follow_up → walkthrough_scheduled →
// estimate_sent → negotiation → contract_signed → active_project →
// complete_paid. Apps journeys reuse these stages as a flagged placeholder
// until Arise Above Apps defines its own funnel.
const funnelContacts: FunnelContact[] = [];
const funnelTouches: FunnelTouch[] = [];

// Workflows were empty on purpose: the previous seed shipped the original
// creator's invented revenue machines (fake $ figures throughout). These six
// are AAC's actual documented processes, mapped one at a time as Sean writes
// them down — steps, owners, and sequence are real; `revenueUsd`,
// `hoursPerWeek`, `leakUsd`, and `automation` are honestly 0/null across the
// board because no real dollar or time-logged figure backs any of these yet
// (HONESTY: an invented number is worse than an honest zero — see
// tests/workflow-seed.test.ts). Fill those in only once a real number exists
// to attach to a specific step.
const workflows: Workflow[] = [
  {
    id: 'wf-203k-draw-request',
    name: '203(k) Draw Request',
    subtitle: 'FHA 203(k) renovation loans: milestone completion through fund release. Rule: subs never get ahead of draws.',
    revenueUsd: 0,
    business: 'aac',
    order: 0,
    steps: [
      { id: 'wf-203k-s1', title: 'Complete milestone of work', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: 'call to schedule inspection', leakUsd: null, automation: null },
      { id: 'wf-203k-s2', title: 'Call HUD consultant to schedule inspection', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['phone'], edgeLabel: 'inspection scheduled', leakUsd: null, automation: null },
      { id: 'wf-203k-s3', title: 'Consultant inspects & approves draw', ownerKind: 'human', owner: 'HUD Consultant · 3rd party', hoursPerWeek: 0, tools: [], edgeLabel: 'draw approved', leakUsd: null, automation: null },
      { id: 'wf-203k-s4', title: 'Lender releases funds (3–5 business days)', ownerKind: 'human', owner: 'Lender · 3rd party', hoursPerWeek: 0, tools: [], edgeLabel: 'funds released', leakUsd: null, automation: null },
      { id: 'wf-203k-s5', title: 'Pay subs & materials from the draw', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['quickbooks'], edgeLabel: null, leakUsd: null, automation: null },
    ],
  },
  {
    id: 'wf-reno-trade-sequence',
    name: 'Full Renovation Trade Sequence',
    subtitle: 'Standard 14-week sub-trade order for a full residential renovation, demo through final punch.',
    revenueUsd: 0,
    business: 'aac',
    order: 1,
    steps: [
      { id: 'wf-reno-s1', title: 'Week 1 — Demo crew', ownerKind: 'human', owner: 'Demo crew · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s2', title: 'Week 2 — Rough plumbing', ownerKind: 'human', owner: 'Plumber · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s3', title: 'Week 3 — Rough electrical', ownerKind: 'human', owner: 'Electrician · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s4', title: 'Week 4 — HVAC rough', ownerKind: 'human', owner: 'HVAC tech · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s5', title: 'Week 5 — Insulation', ownerKind: 'human', owner: 'Insulation crew · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s6', title: 'Week 6 — Drywall hang & finish', ownerKind: 'human', owner: 'Drywall crew · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s7', title: 'Week 7 — Paint (prime + 2 coats)', ownerKind: 'human', owner: 'Painter · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s8', title: 'Week 8 — Cabinets', ownerKind: 'human', owner: 'Cabinet installer · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s9', title: 'Week 9 — Tile setter', ownerKind: 'human', owner: 'Tile setter · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s10', title: 'Week 10 — Countertops: measure', ownerKind: 'human', owner: 'Countertop fabricator · Sub', hoursPerWeek: 0, tools: [], edgeLabel: '7–10 day lead time', leakUsd: null, automation: null },
      { id: 'wf-reno-s11', title: 'Week 10 — Countertops: install', ownerKind: 'human', owner: 'Countertop fabricator · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s12', title: 'Week 11 — Trim carpenter + interior doors', ownerKind: 'human', owner: 'Trim carpenter · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s13', title: 'Week 12 — Finish electrical + finish plumbing', ownerKind: 'human', owner: 'Electrician + Plumber · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s14', title: 'Week 13 — Flooring (last trade in)', ownerKind: 'human', owner: 'Flooring installer · Sub', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-reno-s15', title: 'Week 14 — Final punch + paint touch-ups', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
    ],
  },
  {
    id: 'wf-permit-application',
    name: 'Permit Application',
    subtitle: "Confirm requirement, submit to the right jurisdiction, never start permitted work before approval — no exceptions.",
    revenueUsd: 0,
    business: 'aac',
    order: 2,
    steps: [
      { id: 'wf-permit-s1', title: 'Confirm whether a permit is required', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: 'structural, panel/circuit, plumbing rough-in, HVAC replacement, reroof, basement finish, additions/ADUs', leakUsd: null, automation: null },
      { id: 'wf-permit-s2', title: "Submit via the jurisdiction's system", ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['projectdox'], edgeLabel: 'Detroit ProjectDox 3–6wk · Southfield/Farmington Hills 1–2wk · West Bloomfield 2–3wk · Oakland Co. townships 1–3wk', leakUsd: null, automation: null },
      { id: 'wf-permit-s3', title: 'Wait for approval — never start before it, no exceptions', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
    ],
  },
  {
    id: 'wf-review-request-followup',
    name: 'Review Request Follow-Up',
    subtitle: 'Sent within 48 hours of the final walk-through — personalized, with a direct Google review link.',
    revenueUsd: 0,
    business: 'aac',
    order: 3,
    steps: [
      { id: 'wf-review-s1', title: 'Final walk-through completed', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: 'within 48 hours', leakUsd: null, automation: null },
      { id: 'wf-review-s2', title: 'Send personalized email referencing the project', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['gmail'], edgeLabel: 'include review link', leakUsd: null, automation: null },
      { id: 'wf-review-s3', title: 'Include direct Google review link', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['google-reviews'], edgeLabel: 'thank the client', leakUsd: null, automation: null },
      { id: 'wf-review-s4', title: 'Thank the client for trusting AAC', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
    ],
  },
  {
    id: 'wf-project-kickoff-checklist',
    name: 'Project Kickoff Checklist',
    subtitle: 'Day 1 of a signed job: deposit through the filed contract.',
    revenueUsd: 0,
    business: 'aac',
    order: 4,
    steps: [
      { id: 'wf-kickoff-s1', title: 'Collect deposit (minimum 30%)', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['quickbooks'], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-kickoff-s2', title: 'Apply for permit if required', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-kickoff-s3', title: 'Order materials — long-lead items first (cabinets, tile, fixtures)', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-kickoff-s4', title: 'Confirm sub schedule — who starts when', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['phone'], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-kickoff-s5', title: 'Hold client kickoff meeting (schedule, communication, site access)', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['calendar'], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-kickoff-s6', title: 'Create job folder', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
      { id: 'wf-kickoff-s7', title: 'File signed contract', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
    ],
  },
  {
    id: 'wf-lead-followup-cadence',
    name: 'Lead Follow-Up Cadence',
    subtitle: 'From first inquiry to archive: callback, walk-through, estimate, and three follow-up touches.',
    revenueUsd: 0,
    business: 'aac',
    order: 5,
    steps: [
      { id: 'wf-lead-s1', title: 'Sean calls back within 24 business hours', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['phone'], edgeLabel: 'walk-through scheduled', leakUsd: null, automation: null },
      { id: 'wf-lead-s2', title: 'Walk-through scheduled via booking calendar link', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['calendar'], edgeLabel: 'estimate due in 3 business days', leakUsd: null, automation: null },
      { id: 'wf-lead-s3', title: 'Estimate sent within 3 business days of walk-through', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['gmail'], edgeLabel: 'no response?', leakUsd: null, automation: null },
      { id: 'wf-lead-s4', title: 'Follow up at 3, 7, and 14 days if no response', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: ['gmail'], edgeLabel: 'still no response at 21 days', leakUsd: null, automation: null },
      { id: 'wf-lead-s5', title: 'Mark stale & archive at 21 days (unless client re-engages)', ownerKind: 'human', owner: 'Sean · Owner', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null },
    ],
  },
];

// Seeded agent tasks are gone — the previous list was invented work items.
// Real tasks are created from the UI (insert-by-id keeps user tasks intact).
const agentTasks: AgentTask[] = [];

const SKILL_STATUS_NOTE: Record<string, string> = {
  live: 'Live in production. The owning agent runs this today.',
  learning: 'In training. Runs with a human in the loop while it calibrates.',
  planned: 'Planned. Scoped and queued, not yet wired.',
};

/** Compose a real-ready SKILL.md doc from a skill's fields (viewed from its card). */
function skillDoc(s: Omit<Skill, 'markdown'>): string {
  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const toolLine = s.tools.length ? s.tools.map((t) => `\`${t}\``).join(', ') : 'no external tools';
  return `---
name: ${slug}
description: ${s.description}
category: ${s.category}
status: ${s.status}
---

# ${s.name}

${s.description}

## When to use
Reach for this when the ${s.category.toLowerCase()} flow needs to ${s.name.toLowerCase()}. It runs on ${toolLine}.

## Status
${SKILL_STATUS_NOTE[s.status] ?? s.status}
`;
}

// The capability library the agent workforce draws on. Only skills that map
// to a real implemented lane appear here — no larp capabilities.
const skills: Omit<Skill, 'markdown'>[] = [
  { id: 'skill-triage', name: 'Inbox triage', category: 'Ops', description: 'Unread counts and recent mail across up to four IMAP inboxes, honest per-inbox errors.', ownerAgentId: 'gmail-worker', status: 'live', tools: ['imap'], order: 0 },
  { id: 'skill-schedule', name: 'Schedule awareness', category: 'Ops', description: 'Upcoming events merged across connected calendar feeds, join links extracted.', ownerAgentId: 'calendar-worker', status: 'live', tools: ['calendar'], order: 1 },
  { id: 'skill-books', name: 'Books pulse', category: 'Finance', description: 'QuickBooks month-to-date income, expenses, and open invoices once the OAuth grant lands.', ownerAgentId: 'quickbooks-pulse', status: 'live', tools: ['quickbooks'], order: 2 },
  { id: 'skill-retrieval', name: 'Knowledge retrieval', category: 'Ops', description: 'Search over the knowledge layer so every agent shares one memory — real grep search over the bundled markdown store today, upgradeable to a vector provider behind the same interface later.', ownerAgentId: 'data-agent', status: 'live', tools: ['brain'], order: 3 },
];

/** Bump when the seed content changes shape — existing DBs re-seed once to
 *  pick up the new baseline (and purge retired rows). */
export const SEED_VERSION = '2026-08-28-gmail-worker-quarantine-sop';

export function seedDatabase(db: FounderDb): void {
  // The whole reseed runs as ONE SQLite transaction, not ~100 separate
  // auto-committed statements. Two reasons: (1) atomicity — a mid-seed
  // failure now rolls back instead of leaving a half-written baseline: some
  // rows on the new version, others still stale; (2) concurrency safety —
  // Next.js's build-time static-generation worker pool opens several
  // connections to the same on-disk production file, and each one that sees
  // a stale seed_version independently runs this whole function. Before this
  // wrap, that meant many workers interleaving ~100 unbatched writes each,
  // which could hold the SQLite write lock long enough to exceed the 5s
  // busy_timeout (Railway build failure on commit aa9094d — a version-string
  // bump with zero schema changes still triggered `SqliteError: database is
  // locked`, proving the migration-only busy_timeout fix in openDb didn't
  // cover this). A single transaction shrinks each worker's lock-holding
  // window to one fast commit, so a losing worker's wait comfortably fits
  // inside busy_timeout instead of queuing behind dozens of others' retries.
  db.transaction(() => seedDatabaseBody(db));
}

function seedDatabaseBody(db: FounderDb): void {
  // INSERT OR REPLACE in every repo makes re-seeding idempotent by id.
  for (const d of departments) db.departments.insert(d);
  for (const a of agents) db.agents.insert(a);
  // The roster IS the runtime: rows that left the roster leave the DB too,
  // and departments that left the operating model go with them.
  db.agents.deleteWhereIdNotIn(agents.map((a) => a.id));
  db.departments.deleteWhereIdNotIn(departments.map((d) => d.id));
  for (const p of people) db.people.insert(p);
  db.people.deleteWhereIdNotIn(people.map((p) => p.id));
  for (const t of sopTasks) db.sopTasks.insert(t);
  db.sopTasks.deleteWhereIdNotIn(sopTasks.map((t) => t.id));
  for (const w of workflows) db.workflows.insert(w);
  db.workflows.deleteWhereIdNotIn(workflows.map((w) => w.id));
  for (const s of skills) db.skills.insert({ ...s, markdown: skillDoc(s) });
  db.skills.deleteWhereIdNotIn(skills.map((s) => s.id));
  for (const t of agentTasks) db.agentTasks.insert(t); // insert-by-id; user tasks coexist
  // Drop the retired invented task rows from any DB seeded before the purge.
  for (let i = 1; i <= 11; i++) db.agentTasks.remove(`task-seed-${i}`);
  for (const t of tools) db.tools.insert(t);
  db.tools.deleteWhereIdNotIn(tools.map((t) => t.id));
  for (const r of roadmap) db.roadmap.insert(r);
  db.roadmap.deleteWhereIdNotIn(roadmap.map((r) => r.id));
  for (const m of metrics) db.metrics.insert(m);
  db.metrics.deleteWhereIdNotIn(metrics.map((m) => m.id));
  for (const d of domains) db.domains.insert(d);
  db.domains.deleteWhereIdNotIn(domains.map((d) => d.id));
  db.personas.clearAll(); // persona templates were demo content — retired
  for (const p of phases) db.phases.insert(p);
  db.phases.deleteWhereIdNotIn(phases.map((p) => p.id));
  for (const a of socialAccounts) db.social.upsertAccount(a);
  // Retired invented follower/DM history leaves the DB on re-seed; anything a
  // real source recorded survives.
  db.social.deleteSeeded();
  db.social.deleteAccountsWherePlatformNotIn(socialAccounts.map((a) => a.platform));
  for (const s of socialBaseline) db.social.insertSnapshot(s);
  for (const d of socialDms) db.social.upsertDm(d);
  for (const s of socialDmSnapshots) db.social.insertDmSnapshot(s);
  for (const m of socialDmMessages) db.social.upsertDmMessage(m);
  // Retired dummy email history leaves the DB on re-seed; the real Beehiiv
  // baseline is authoritative. Live-synced snapshots survive.
  db.emailList.deleteSeeded();
  for (const s of emailListBaseline) db.emailList.insertSnapshot(s);
  for (const p of socialPosts) db.socialPosts.enqueue(p);
  db.socialPosts.remove('post-seed-1'); // retired invented queue item
  for (const c of funnelContacts) db.funnel.insertContact(c);
  for (const t of funnelTouches) db.funnel.insertTouch(t);
  db.seedMeta.set('seed_version', SEED_VERSION);
}
