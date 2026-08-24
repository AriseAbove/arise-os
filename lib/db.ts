import Database from 'better-sqlite3';
import { isValidCron } from '@/lib/cron';
import {
  AgentCronSchema,
  AgentMessageSchema,
  AgentRunSchema,
  AgentSchema,
  AgentTaskSchema,
  BroadcastReplySchema,
  BroadcastSchema,
  ContactTagSchema,
  DepartmentSchema,
  DomainSchema,
  MetricSchema,
  PersonaSchema,
  PhaseSchema,
  RoadmapItemSchema,
  SocialAccountSchema,
  SocialSnapshotSchema,
  EmailListSnapshotSchema,
  SocialDmSchema,
  SocialDmSnapshotSchema,
  SocialDmMessageSchema,
  SocialPostSchema,
  FunnelContactSchema,
  FunnelTouchSchema,
  FunnelJourneySchema,
  PersonSchema,
  SopTaskSchema,
  WorkflowSchema,
  SkillSchema,
  ToolSchema,
  QuickBooksAuthSchema,
  BrainHealthSchema,
  type Agent,
  type AgentCron,
  type AgentMessage,
  type AgentRun,
  type AgentTask,
  type Broadcast,
  type BroadcastReply,
  type ContactTag,
  type Department,
  type Domain,
  type Metric,
  type Persona,
  type Phase,
  type RoadmapItem,
  type SocialAccount,
  type SocialPlatform,
  type SocialSnapshot,
  type EmailListSnapshot,
  type SocialDm,
  type SocialDmSnapshot,
  type SocialDmMessage,
  type SocialPost,
  type SocialPostStatus,
  type FunnelContact,
  type FunnelTouch,
  type FunnelJourney,
  type FunnelBusiness,
  type Person,
  type SopTask,
  type Workflow,
  type Skill,
  type Tool,
  type QuickBooksAuth,
  type BrainHealth,
} from '@/lib/schemas';

const DDL = `
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  "order" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  tier TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  tools TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS roadmap_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  quarter TEXT NOT NULL,
  status TEXT NOT NULL,
  department_id TEXT,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  delta REAL NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  color TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  name TEXT NOT NULL,
  archetype TEXT NOT NULL,
  tagline TEXT NOT NULL,
  summary TEXT NOT NULL,
  accent TEXT NOT NULL,
  north_star TEXT NOT NULL,
  pillars TEXT NOT NULL DEFAULT '[]',
  connectors TEXT NOT NULL DEFAULT '[]',
  metrics TEXT NOT NULL DEFAULT '[]',
  brain_use TEXT NOT NULL,
  signature_play TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS phases (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  push_failed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_calls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_crons (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  schedule TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_tags (
  person TEXT NOT NULL,
  channel TEXT NOT NULL,
  tag TEXT NOT NULL,
  tier INTEGER NOT NULL,
  PRIMARY KEY (person, channel)
);
CREATE TABLE IF NOT EXISTS social_accounts (
  platform TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  url TEXT,
  "order" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS social_snapshots (
  platform TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  followers INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (platform, captured_at)
);
CREATE TABLE IF NOT EXISTS broadcast_replies (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES broadcasts(id),
  agent_id TEXT NOT NULL,
  ok INTEGER NOT NULL,
  reply TEXT NOT NULL DEFAULT '',
  finished_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_list_snapshots (
  captured_at TEXT PRIMARY KEY,
  subscribers INTEGER NOT NULL,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS social_dms (
  platform TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS social_dm_snapshots (
  platform TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  count INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (platform, captured_at)
);
CREATE TABLE IF NOT EXISTS social_dm_messages (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  name TEXT NOT NULL,
  handle TEXT,
  text TEXT NOT NULL,
  direction TEXT NOT NULL,
  tag TEXT,
  ts TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_dm_messages_ts ON social_dm_messages (ts);
CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  caption TEXT NOT NULL,
  media_url TEXT,
  platforms TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduled_for TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  tools TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS sop_tasks (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  assignee_kind TEXT NOT NULL,
  assignee_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS funnel_contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business TEXT NOT NULL,
  status TEXT NOT NULL,
  product TEXT,
  amount_usd REAL,
  cost_usd REAL,
  relationship TEXT NOT NULL DEFAULT 'warm',
  likelihood INTEGER NOT NULL DEFAULT 50,
  email TEXT,
  phone TEXT,
  person TEXT,
  company TEXT,
  role TEXT,
  linkedin TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS funnel_touches (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES funnel_contacts(id),
  seq INTEGER NOT NULL,
  stage TEXT NOT NULL,
  channel TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL,
  at TEXT NOT NULL,
  duration_seconds INTEGER
);
-- 2026-08-20: funnel.journeys() batch-fetches every contact's touches by
-- contact_id (see below) instead of one query per contact; this index is what
-- makes that batch fetch (and the old per-row lookup before it) an index seek
-- instead of a full table scan. Found by today's 3-agent system audit.
CREATE INDEX IF NOT EXISTS idx_funnel_touches_contact ON funnel_touches (contact_id);
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  revenue_usd INTEGER NOT NULL DEFAULT 0,
  ord INTEGER NOT NULL DEFAULT 0,
  steps TEXT NOT NULL DEFAULT '[]',
  business TEXT NOT NULL DEFAULT 'shared'
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_agent_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  tools TEXT NOT NULL DEFAULT '[]',
  markdown TEXT NOT NULL DEFAULT '',
  ord INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS seed_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quickbooks_auth (
  id TEXT PRIMARY KEY,
  realm_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at INTEGER NOT NULL,
  refresh_token_expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS voice_queue (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS brain_health (
  id TEXT PRIMARY KEY,
  pending_actions INTEGER NOT NULL,
  failing_workers INTEGER NOT NULL,
  total_workers INTEGER NOT NULL,
  top_failures TEXT NOT NULL DEFAULT '[]',
  connector_health TEXT NOT NULL DEFAULT '[]',
  last_daily_summary_date TEXT,
  reported_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
`;

/** Runs a schema-altering statement that only needs to succeed once across
 *  possibly-concurrent connections sharing one on-disk SQLite file (Next.js's
 *  static-generation pool opens several connections to the same production
 *  volume during `next build`, each running the same check-then-ALTER
 *  migration below). The check and the ALTER aren't atomic across separate
 *  processes: one connection can see a column missing, lose the race to
 *  another connection that adds it first, and then crash with `SqliteError:
 *  duplicate column name: <col>` on an ALTER that was always going to be a
 *  no-op. That specific error means "someone else already did this" -- safe
 *  to swallow. Any other error is a real bug and still throws. */
export function safeAlter(db: InstanceType<typeof Database>, sql: string): void {
  try {
    db.exec(sql);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

/** Databases created before the hierarchy build lack these columns. */
function migrateAgentsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set(
    (db.pragma('table_info(agents)') as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has('parent_id')) safeAlter(db, 'ALTER TABLE agents ADD COLUMN parent_id TEXT');
  if (!columns.has('instance')) safeAlter(db, "ALTER TABLE agents ADD COLUMN instance TEXT NOT NULL DEFAULT 'builtin'");
}

/** Databases created before the funnel-space build lack these columns; ones
 *  created before the Phase 2 purge carry the old `venture` column and the
 *  retired demo taxonomy (renamed + cleared here — the old rows were seeded
 *  dummy data in a retired stage model). */
function migrateFunnelContactsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set(
    (db.pragma('table_info(funnel_contacts)') as { name: string }[]).map((c) => c.name),
  );
  if (columns.has('venture') && !columns.has('business')) {
    safeAlter(db, 'ALTER TABLE funnel_contacts RENAME COLUMN venture TO business');
    // Rows in the retired vantage/launchpad taxonomy (and their touches)
    // were invented demo journeys — drop them.
    db.exec("DELETE FROM funnel_touches WHERE contact_id IN (SELECT id FROM funnel_contacts WHERE business NOT IN ('aac', 'apps'))");
    db.exec("DELETE FROM funnel_contacts WHERE business NOT IN ('aac', 'apps')");
    columns.add('business');
  }
  if (!columns.has('relationship')) safeAlter(db, "ALTER TABLE funnel_contacts ADD COLUMN relationship TEXT NOT NULL DEFAULT 'warm'");
  if (!columns.has('likelihood')) safeAlter(db, 'ALTER TABLE funnel_contacts ADD COLUMN likelihood INTEGER NOT NULL DEFAULT 50');
  if (!columns.has('email')) safeAlter(db, 'ALTER TABLE funnel_contacts ADD COLUMN email TEXT');
  if (!columns.has('phone')) safeAlter(db, 'ALTER TABLE funnel_contacts ADD COLUMN phone TEXT');
  // dossier identity (Round 15) — the human behind the deal
  for (const col of ['person', 'company', 'role', 'linkedin']) {
    if (!columns.has(col)) safeAlter(db, `ALTER TABLE funnel_contacts ADD COLUMN ${col} TEXT`);
  }
  // 2026-08-24: cost/margin tracking (lib/funnel-card.ts) — lets a journey
  // carry actual/estimated job cost alongside the deal amount so profit per
  // job is computable, not just revenue.
  if (!columns.has('cost_usd')) safeAlter(db, 'ALTER TABLE funnel_contacts ADD COLUMN cost_usd REAL');
}

/** Databases created before lib/funnel-score.ts lack the column that lets a
 *  lead's score actually differentiate on call quality — see that module's
 *  header comment for why. Existing rows read back NULL (no duration on
 *  record), which lib/funnel-score.ts treats as "unknown," not "short." */
function migrateFunnelTouchesTable(db: InstanceType<typeof Database>): void {
  const columns = new Set(
    (db.pragma('table_info(funnel_touches)') as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has('duration_seconds')) safeAlter(db, 'ALTER TABLE funnel_touches ADD COLUMN duration_seconds INTEGER');
}

// Skills gained a `markdown` (SKILL.md) column after first ship. Add it, and
// clear the stale rows so the re-seed backfills each skill's doc.
function migrateSkillsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set((db.pragma('table_info(skills)') as { name: string }[]).map((c) => c.name));
  if (columns.size > 0 && !columns.has('markdown')) {
    safeAlter(db, "ALTER TABLE skills ADD COLUMN markdown TEXT NOT NULL DEFAULT ''");
    db.exec('DELETE FROM skills');
  }
}

// brain_health gained connector_health (2026-08-21) — live Allo/Railway
// checks from world_state_builder.py, riding the same heartbeat push as
// pending_actions/failing_workers. Existing rows default to '[]' (an empty
// connector list is honest, not fabricated) until the next Mac heartbeat.
function migrateBrainHealthTable(db: InstanceType<typeof Database>): void {
  const columns = new Set((db.pragma('table_info(brain_health)') as { name: string }[]).map((c) => c.name));
  if (columns.size > 0 && !columns.has('connector_health')) {
    safeAlter(db, "ALTER TABLE brain_health ADD COLUMN connector_health TEXT NOT NULL DEFAULT '[]'");
  }
}

// Databases created before the /workflows business-lens fix (2026-08-21)
// lack the `business` column. DEFAULT 'shared' backfills every existing row
// as visible under any business selection — honest, since nothing about a
// pre-existing workflow's real AAC/Apps ownership was recorded either way,
// and 'shared' is the option that never hides a real row from view.
function migrateWorkflowsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set((db.pragma('table_info(workflows)') as { name: string }[]).map((c) => c.name));
  if (columns.size > 0 && !columns.has('business')) {
    safeAlter(db, "ALTER TABLE workflows ADD COLUMN business TEXT NOT NULL DEFAULT 'shared'");
  }
}

// Runs recorded before 2026-08-21 lack push_failed — the column that keeps a
// genuinely failed Chief of Staff ntfy push from being reported as full
// success (see lib/analytics.ts's runOutcomeCounts). DEFAULT 0 backfills
// every existing row as "no push failure recorded" — honest, since those
// runs' own `ok`/`summary` are untouched and still readable for the real
// history of what happened.
function migrateAgentRunsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set((db.pragma('table_info(agent_runs)') as { name: string }[]).map((c) => c.name));
  if (!columns.has('push_failed')) safeAlter(db, 'ALTER TABLE agent_runs ADD COLUMN push_failed INTEGER NOT NULL DEFAULT 0');
}

type AgentRow = {
  id: string;
  department_id: string;
  name: string;
  role: string;
  status: string;
  tier: string;
  description: string;
  model: string;
  tools: string;
  parent_id: string | null;
  instance: string;
};

function rowToAgent(row: AgentRow): Agent {
  return AgentSchema.parse({
    id: row.id,
    departmentId: row.department_id,
    name: row.name,
    role: row.role,
    status: row.status,
    tier: row.tier,
    description: row.description,
    model: row.model,
    tools: JSON.parse(row.tools),
    parentId: row.parent_id,
    instance: row.instance,
  });
}

/** Exported so tests can assert on it directly (openDb doesn't expose the
 *  raw Database connection, and a fresh connection can't read back another
 *  connection's pragma setting from the file). See the comment at its call
 *  site in openDb for why this needs to be generous, not the SQLite
 *  default of 0. */
export const BUSY_TIMEOUT_MS = 20000;

export function openDb(path: string) {
  const db = new Database(path);
  // WAL allows concurrent readers, but a second concurrent writer (e.g. two
  // Next.js static-generation workers opening the same on-disk file at
  // build time, or a build racing the live production process on the same
  // mounted volume) still hits SQLITE_BUSY without this — wait instead of
  // failing the build immediately. Bumped 5000 → 20000 after Railway build
  // failure on the "Docs: document the honest-tools chatTools fix" commit:
  // it threw `SqliteError: database is locked` (SQLITE_BUSY) right on this
  // very pragma call, before any seeding/migration code ran — the 5s budget
  // wasn't enough to outlast a live production write held open at the same
  // moment. This is the third known instance of build-time SSG contending
  // with the shared on-disk file (see db-migration-race.test.ts and
  // db-reseed-race.test.ts for the earlier two); a bigger timeout is the
  // same "wait it out" fix as those, just applied to the pragma itself
  // rather than a migration or a reseed.
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.pragma('journal_mode = WAL');
  db.exec(DDL);
  migrateAgentsTable(db);
  migrateFunnelContactsTable(db);
  migrateFunnelTouchesTable(db);
  migrateSkillsTable(db);
  migrateBrainHealthTable(db);
  migrateAgentRunsTable(db);
  migrateWorkflowsTable(db);

  /** Shared purge guard: drop every row whose id is not in the seed's list
      (empty list = drop all — avoids invalid `NOT IN ()` SQL). */
  const deleteNotIn = (table: string) => (ids: string[]): void => {
    if (ids.length === 0) {
      db.prepare(`DELETE FROM ${table}`).run();
      return;
    }
    const placeholders = ids.map(() => '?').join(', ');
    db.prepare(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`).run(...ids);
  };

  const departments = {
    all(): Department[] {
      return db
        .prepare('SELECT * FROM departments ORDER BY "order"')
        .all()
        .map((r) => DepartmentSchema.parse(r));
    },
    insert(d: Department): void {
      db.prepare(
        'INSERT OR REPLACE INTO departments (id, name, slug, tagline, color, "order") VALUES (?, ?, ?, ?, ?, ?)',
      ).run(d.id, d.name, d.slug, d.tagline, d.color, d.order);
    },
    deleteWhereIdNotIn(ids: string[]): void {
      if (ids.length === 0) {
        db.prepare('DELETE FROM departments').run();
        return;
      }
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM departments WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const agents = {
    all(): Agent[] {
      return (db.prepare('SELECT * FROM agents ORDER BY tier, name').all() as AgentRow[]).map(rowToAgent);
    },
    byDepartment(departmentId: string): Agent[] {
      return (
        db
          .prepare('SELECT * FROM agents WHERE department_id = ? ORDER BY tier, name')
          .all(departmentId) as AgentRow[]
      ).map(rowToAgent);
    },
    insert(a: Agent): void {
      db.prepare(
        'INSERT OR REPLACE INTO agents (id, department_id, name, role, status, tier, description, model, tools, parent_id, instance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        a.id, a.departmentId, a.name, a.role, a.status, a.tier, a.description, a.model,
        JSON.stringify(a.tools), a.parentId, a.instance,
      );
    },
    deleteWhereIdNotIn(ids: string[]): void {
      if (ids.length === 0) {
        db.prepare('DELETE FROM agents').run();
        return;
      }
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM agents WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const tools = {
    all(): Tool[] {
      return db
        .prepare('SELECT * FROM tools ORDER BY category, name')
        .all()
        .map((r) => ToolSchema.parse(r));
    },
    insert(t: Tool): void {
      db.prepare(
        'INSERT OR REPLACE INTO tools (id, name, category, status, color, description) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(t.id, t.name, t.category, t.status, t.color, t.description);
    },
    deleteWhereIdNotIn: deleteNotIn('tools'),
  };

  const roadmap = {
    all(): RoadmapItem[] {
      return db
        .prepare('SELECT * FROM roadmap_items ORDER BY quarter, title')
        .all()
        .map((r: any) =>
          RoadmapItemSchema.parse({
            id: r.id,
            title: r.title,
            quarter: r.quarter,
            status: r.status,
            departmentId: r.department_id,
            description: r.description,
          }),
        );
    },
    insert(item: RoadmapItem): void {
      db.prepare(
        'INSERT OR REPLACE INTO roadmap_items (id, title, quarter, status, department_id, description) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(item.id, item.title, item.quarter, item.status, item.departmentId, item.description);
    },
    deleteWhereIdNotIn: deleteNotIn('roadmap_items'),
  };

  const metrics = {
    all(): Metric[] {
      return db
        .prepare('SELECT * FROM metrics ORDER BY label')
        .all()
        .map((r) => MetricSchema.parse(r));
    },
    insert(m: Metric): void {
      db.prepare(
        'INSERT OR REPLACE INTO metrics (id, key, label, value, unit, delta, period) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(m.id, m.key, m.label, m.value, m.unit, m.delta, m.period);
    },
    deleteWhereIdNotIn: deleteNotIn('metrics'),
  };

  const domains = {
    all(): Domain[] {
      return db
        .prepare('SELECT * FROM domains ORDER BY number')
        .all()
        .map((r: any) => DomainSchema.parse({ ...r, items: JSON.parse(r.items) }));
    },
    insert(d: Domain): void {
      db.prepare('INSERT OR REPLACE INTO domains (id, number, title, color, items) VALUES (?, ?, ?, ?, ?)').run(
        d.id,
        d.number,
        d.title,
        d.color,
        JSON.stringify(d.items),
      );
    },
    deleteWhereIdNotIn: deleteNotIn('domains'),
  };

  const personas = {
    all(): Persona[] {
      return db
        .prepare('SELECT * FROM personas ORDER BY ord')
        .all()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) =>
          PersonaSchema.parse({
            id: r.id,
            order: r.ord,
            name: r.name,
            archetype: r.archetype,
            tagline: r.tagline,
            summary: r.summary,
            accent: r.accent,
            northStar: r.north_star,
            pillars: JSON.parse(r.pillars),
            connectors: JSON.parse(r.connectors),
            metrics: JSON.parse(r.metrics),
            brainUse: r.brain_use,
            signaturePlay: r.signature_play,
          }),
        );
    },
    insert(p: Persona): void {
      db.prepare(
        `INSERT OR REPLACE INTO personas
          (id, ord, name, archetype, tagline, summary, accent, north_star, pillars, connectors, metrics, brain_use, signature_play)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        p.id,
        p.order,
        p.name,
        p.archetype,
        p.tagline,
        p.summary,
        p.accent,
        p.northStar,
        JSON.stringify(p.pillars),
        JSON.stringify(p.connectors),
        JSON.stringify(p.metrics),
        p.brainUse,
        p.signaturePlay,
      );
    },
  };

  const personasClear = {
    clearAll(): void {
      db.prepare('DELETE FROM personas').run();
    },
  };

  const phases = {
    all(): Phase[] {
      return db
        .prepare('SELECT * FROM phases ORDER BY number')
        .all()
        .map((r: any) => PhaseSchema.parse({ ...r, items: JSON.parse(r.items) }));
    },
    insert(p: Phase): void {
      db.prepare('INSERT OR REPLACE INTO phases (id, number, title, items) VALUES (?, ?, ?, ?)').run(
        p.id,
        p.number,
        p.title,
        JSON.stringify(p.items),
      );
    },
    deleteWhereIdNotIn: deleteNotIn('phases'),
  };

  const rowToRun = (r: any): AgentRun =>
    AgentRunSchema.parse({
      id: r.id,
      agentId: r.agent_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      ok: Boolean(r.ok),
      summary: r.summary,
      pushFailed: Boolean(r.push_failed),
    });

  const agentRuns = {
    byAgent(agentId: string): AgentRun[] {
      return db
        .prepare('SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY started_at DESC')
        .all(agentId)
        .map(rowToRun);
    },
    recent(limit: number): AgentRun[] {
      return db
        .prepare('SELECT * FROM agent_runs ORDER BY started_at DESC, rowid DESC LIMIT ?')
        .all(limit)
        .map(rowToRun);
    },
    insert(run: AgentRun): void {
      db.prepare(
        'INSERT OR REPLACE INTO agent_runs (id, agent_id, started_at, finished_at, ok, summary, push_failed) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(run.id, run.agentId, run.startedAt, run.finishedAt, run.ok ? 1 : 0, run.summary, run.pushFailed ? 1 : 0);
    },
  };

  const rowToMessage = (r: any): AgentMessage =>
    AgentMessageSchema.parse({
      id: r.id,
      agentId: r.agent_id,
      role: r.role,
      content: r.content,
      toolCalls: JSON.parse(r.tool_calls || '[]'),
      createdAt: r.created_at,
    });

  const agentMessages = {
    insert(m: AgentMessage): void {
      const parsed = AgentMessageSchema.parse(m);
      db.prepare(
        'INSERT OR REPLACE INTO agent_messages (id, agent_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(parsed.id, parsed.agentId, parsed.role, parsed.content, JSON.stringify(parsed.toolCalls), parsed.createdAt);
    },
    /** Full conversation for one agent, oldest → newest (ready to replay). */
    byAgent(agentId: string): AgentMessage[] {
      return db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY created_at ASC, rowid ASC')
        .all(agentId)
        .map(rowToMessage);
    },
    recent(limit: number): AgentMessage[] {
      return db
        .prepare('SELECT * FROM agent_messages ORDER BY created_at DESC, rowid DESC LIMIT ?')
        .all(limit)
        .map(rowToMessage);
    },
  };

  const rowToReply = (r: any): BroadcastReply =>
    BroadcastReplySchema.parse({
      id: r.id,
      broadcastId: r.broadcast_id,
      agentId: r.agent_id,
      ok: Boolean(r.ok),
      reply: r.reply,
      finishedAt: r.finished_at,
    });

  const broadcasts = {
    insert(b: { id: string; message: string; createdAt: string }): void {
      db.prepare('INSERT OR REPLACE INTO broadcasts (id, message, created_at) VALUES (?, ?, ?)').run(
        b.id, b.message, b.createdAt,
      );
    },
    insertReply(r: BroadcastReply): void {
      db.prepare(
        'INSERT OR REPLACE INTO broadcast_replies (id, broadcast_id, agent_id, ok, reply, finished_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(r.id, r.broadcastId, r.agentId, r.ok ? 1 : 0, r.reply, r.finishedAt);
    },
    recent(limit: number): Broadcast[] {
      const rows = db
        .prepare('SELECT * FROM broadcasts ORDER BY created_at DESC, rowid DESC LIMIT ?')
        .all(limit) as { id: string; message: string; created_at: string }[];
      const replyStmt = db.prepare('SELECT * FROM broadcast_replies WHERE broadcast_id = ? ORDER BY agent_id');
      return rows.map((b) =>
        BroadcastSchema.parse({
          id: b.id,
          message: b.message,
          createdAt: b.created_at,
          replies: replyStmt.all(b.id).map(rowToReply),
        }),
      );
    },
  };

  const rowToTask = (r: any): AgentTask =>
    AgentTaskSchema.parse({
      id: r.id, agentId: r.agent_id, title: r.title, status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at,
    });

  const agentTasks = {
    insert(t: AgentTask): void {
      AgentTaskSchema.parse(t);
      db.prepare(
        'INSERT OR REPLACE INTO agent_tasks (id, agent_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(t.id, t.agentId, t.title, t.status, t.createdAt, t.updatedAt);
    },
    byAgent(agentId: string): AgentTask[] {
      return db
        .prepare('SELECT * FROM agent_tasks WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC')
        .all(agentId)
        .map(rowToTask);
    },
    all(): AgentTask[] {
      return db.prepare('SELECT * FROM agent_tasks ORDER BY created_at DESC, rowid DESC').all().map(rowToTask);
    },
    setStatus(id: string, status: AgentTask['status'], updatedAt: string): void {
      AgentTaskSchema.shape.status.parse(status);
      db.prepare('UPDATE agent_tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id);
    },
    remove(id: string): void {
      db.prepare('DELETE FROM agent_tasks WHERE id = ?').run(id);
    },
  };

  const rowToCron = (r: any): AgentCron =>
    AgentCronSchema.parse({
      id: r.id, agentId: r.agent_id, schedule: r.schedule, description: r.description,
      enabled: Boolean(r.enabled), createdAt: r.created_at,
    });

  const agentCrons = {
    insert(c: AgentCron): void {
      AgentCronSchema.parse(c);
      if (!isValidCron(c.schedule)) throw new Error(`invalid cron schedule: ${c.schedule}`);
      db.prepare(
        'INSERT OR REPLACE INTO agent_crons (id, agent_id, schedule, description, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(c.id, c.agentId, c.schedule, c.description, c.enabled ? 1 : 0, c.createdAt);
    },
    byAgent(agentId: string): AgentCron[] {
      return db
        .prepare('SELECT * FROM agent_crons WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC')
        .all(agentId)
        .map(rowToCron);
    },
    all(): AgentCron[] {
      return db.prepare('SELECT * FROM agent_crons ORDER BY created_at DESC, rowid DESC').all().map(rowToCron);
    },
    setEnabled(id: string, enabled: boolean): void {
      db.prepare('UPDATE agent_crons SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
    },
    remove(id: string): void {
      db.prepare('DELETE FROM agent_crons WHERE id = ?').run(id);
    },
  };

  const contactTags = {
    upsert(t: ContactTag): void {
      ContactTagSchema.parse(t);
      db.prepare(
        'INSERT INTO contact_tags (person, channel, tag, tier) VALUES (?, ?, ?, ?) ON CONFLICT(person, channel) DO UPDATE SET tag = excluded.tag, tier = excluded.tier',
      ).run(t.person, t.channel, t.tag, t.tier);
    },
    all(): ContactTag[] {
      return (db.prepare('SELECT * FROM contact_tags ORDER BY tier, person').all() as ContactTag[]).map(
        (r) => ContactTagSchema.parse(r),
      );
    },
    byTier(tier: number): ContactTag[] {
      return (
        db.prepare('SELECT * FROM contact_tags WHERE tier = ? ORDER BY person').all(tier) as ContactTag[]
      ).map((r) => ContactTagSchema.parse(r));
    },
    remove(person: string, channel: string): void {
      db.prepare('DELETE FROM contact_tags WHERE person = ? AND channel = ?').run(person, channel);
    },
  };

  const rowToSnapshot = (r: any): SocialSnapshot =>
    SocialSnapshotSchema.parse({
      platform: r.platform,
      capturedAt: r.captured_at,
      followers: r.followers,
      source: r.source,
    });

  const social = {
    upsertAccount(a: SocialAccount): void {
      SocialAccountSchema.parse(a);
      db.prepare(
        'INSERT OR REPLACE INTO social_accounts (platform, handle, url, "order") VALUES (?, ?, ?, ?)',
      ).run(a.platform, a.handle, a.url, a.order);
    },
    accounts(): SocialAccount[] {
      return db
        .prepare('SELECT * FROM social_accounts ORDER BY "order"')
        .all()
        .map((r) => SocialAccountSchema.parse(r));
    },
    insertSnapshot(s: SocialSnapshot): void {
      SocialSnapshotSchema.parse(s);
      db.prepare(
        'INSERT OR REPLACE INTO social_snapshots (platform, captured_at, followers, source) VALUES (?, ?, ?, ?)',
      ).run(s.platform, s.capturedAt, s.followers, s.source);
    },
    snapshots(platform: SocialPlatform): SocialSnapshot[] {
      return db
        .prepare('SELECT * FROM social_snapshots WHERE platform = ? ORDER BY captured_at')
        .all(platform)
        .map(rowToSnapshot);
    },
    latest(): SocialSnapshot[] {
      return db
        .prepare(
          `SELECT * FROM social_snapshots s
           WHERE captured_at = (SELECT MAX(captured_at) FROM social_snapshots WHERE platform = s.platform)
           ORDER BY platform`,
        )
        .all()
        .map(rowToSnapshot);
    },
    upsertDm(d: SocialDm): void {
      SocialDmSchema.parse(d);
      db.prepare(
        'INSERT OR REPLACE INTO social_dms (platform, count, updated_at) VALUES (?, ?, ?)',
      ).run(d.platform, d.count, d.updatedAt);
    },
    dms(): SocialDm[] {
      return db
        .prepare(
          `SELECT d.platform, d.count, d.updated_at AS updatedAt FROM social_dms d
           LEFT JOIN social_accounts a ON a.platform = d.platform
           ORDER BY a."order"`,
        )
        .all()
        .map((r) => SocialDmSchema.parse(r));
    },
    insertDmSnapshot(s: SocialDmSnapshot): void {
      SocialDmSnapshotSchema.parse(s);
      db.prepare(
        'INSERT OR REPLACE INTO social_dm_snapshots (platform, captured_at, count, source) VALUES (?, ?, ?, ?)',
      ).run(s.platform, s.capturedAt, s.count, s.source);
    },
    dmSnapshots(platform?: SocialPlatform): SocialDmSnapshot[] {
      const rows = platform
        ? db
            .prepare('SELECT platform, captured_at AS capturedAt, count, source FROM social_dm_snapshots WHERE platform = ? ORDER BY captured_at')
            .all(platform)
        : db
            .prepare('SELECT platform, captured_at AS capturedAt, count, source FROM social_dm_snapshots ORDER BY platform, captured_at')
            .all();
      return rows.map((r) => SocialDmSnapshotSchema.parse(r));
    },
    // Individual DM messages (the inbox). Fed live by POST /api/webhooks/manychat;
    // seeded until then. Upsert by id so replayed webhooks don't duplicate.
    upsertDmMessage(m: SocialDmMessage): void {
      SocialDmMessageSchema.parse(m);
      db.prepare(
        `INSERT OR REPLACE INTO social_dm_messages
           (id, platform, subscriber_id, name, handle, text, direction, tag, ts, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(m.id, m.platform, m.subscriberId, m.name, m.handle, m.text, m.direction, m.tag, m.ts, m.source);
    },
    /** Purge retired seeded rows (Phase 2): dummy follower/DM history and
        stale config-sourced snapshots leave the DB on re-seed; live-recorded
        rows survive. */
    deleteSeeded(): void {
      db.prepare("DELETE FROM social_snapshots WHERE source IN ('seed-dummy', 'zernio-config')").run();
      db.prepare("DELETE FROM social_dm_snapshots WHERE source LIKE 'seed%'").run();
      db.prepare("DELETE FROM social_dm_messages WHERE source LIKE 'seed%'").run();
      db.prepare('DELETE FROM social_dms').run();
    },
    deleteAccountsWherePlatformNotIn(platforms: string[]): void {
      if (platforms.length === 0) {
        db.prepare('DELETE FROM social_accounts').run();
        return;
      }
      const placeholders = platforms.map(() => '?').join(', ');
      db.prepare(`DELETE FROM social_accounts WHERE platform NOT IN (${placeholders})`).run(...platforms);
    },
    dmMessages(platform?: SocialPlatform): SocialDmMessage[] {
      const cols =
        'id, platform, subscriber_id AS subscriberId, name, handle, text, direction, tag, ts, source';
      const rows = platform
        ? db.prepare(`SELECT ${cols} FROM social_dm_messages WHERE platform = ? ORDER BY ts DESC`).all(platform)
        : db.prepare(`SELECT ${cols} FROM social_dm_messages ORDER BY ts DESC`).all();
      return rows.map((r) => SocialDmMessageSchema.parse(r));
    },
  };

  const emailList = {
    insertSnapshot(s: EmailListSnapshot): void {
      EmailListSnapshotSchema.parse(s);
      db.prepare(
        'INSERT OR REPLACE INTO email_list_snapshots (captured_at, subscribers, source) VALUES (?, ?, ?)',
      ).run(s.capturedAt, s.subscribers, s.source);
    },
    // Drop seed-sourced rows so a re-seed is authoritative — the real Beehiiv
    // baseline replaces any retired dummy history. Live-synced snapshots
    // (source 'beehiiv') are preserved.
    deleteSeeded(): void {
      db.prepare("DELETE FROM email_list_snapshots WHERE source LIKE 'seed%'").run();
    },
    snapshots(): EmailListSnapshot[] {
      return db
        .prepare('SELECT captured_at AS capturedAt, subscribers, source FROM email_list_snapshots ORDER BY captured_at')
        .all()
        .map((r) => EmailListSnapshotSchema.parse(r));
    },
    latest(): EmailListSnapshot | null {
      const row = db
        .prepare('SELECT captured_at AS capturedAt, subscribers, source FROM email_list_snapshots ORDER BY captured_at DESC LIMIT 1')
        .get();
      return row ? EmailListSnapshotSchema.parse(row) : null;
    },
  };

  const rowToPost = (r: {
    id: string;
    caption: string;
    media_url: string | null;
    platforms: string;
    status: string;
    scheduled_for: string | null;
    created_at: string;
  }): SocialPost =>
    SocialPostSchema.parse({
      id: r.id,
      caption: r.caption,
      mediaUrl: r.media_url,
      platforms: JSON.parse(r.platforms),
      status: r.status,
      scheduledFor: r.scheduled_for,
      createdAt: r.created_at,
    });

  const socialPosts = {
    enqueue(p: SocialPost): void {
      SocialPostSchema.parse(p);
      db.prepare(
        `INSERT OR REPLACE INTO social_posts (id, caption, media_url, platforms, status, scheduled_for, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(p.id, p.caption, p.mediaUrl, JSON.stringify(p.platforms), p.status, p.scheduledFor, p.createdAt);
    },
    all(): SocialPost[] {
      return db
        .prepare('SELECT * FROM social_posts ORDER BY created_at DESC')
        .all()
        .map((r) => rowToPost(r as Parameters<typeof rowToPost>[0]));
    },
    remove(id: string): void {
      db.prepare('DELETE FROM social_posts WHERE id = ?').run(id);
    },
    setStatus(id: string, status: SocialPostStatus): void {
      db.prepare('UPDATE social_posts SET status = ? WHERE id = ?').run(status, id);
    },
    queued(): SocialPost[] {
      return db
        .prepare("SELECT * FROM social_posts WHERE status = 'queued' ORDER BY created_at DESC")
        .all()
        .map((r) => rowToPost(r as Parameters<typeof rowToPost>[0]));
    },
  };

  const people = {
    all(): Person[] {
      return db
        .prepare('SELECT * FROM people ORDER BY department_id, name')
        .all()
        .map((r: any) =>
          PersonSchema.parse({
            id: r.id,
            departmentId: r.department_id,
            name: r.name,
            role: r.role,
            tools: JSON.parse(r.tools),
          }),
        );
    },
    insert(p: Person): void {
      PersonSchema.parse(p);
      db.prepare(
        'INSERT OR REPLACE INTO people (id, department_id, name, role, tools) VALUES (?, ?, ?, ?, ?)',
      ).run(p.id, p.departmentId, p.name, p.role, JSON.stringify(p.tools));
    },
    deleteWhereIdNotIn(ids: string[]): void {
      if (ids.length === 0) {
        db.prepare('DELETE FROM people').run();
        return;
      }
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM people WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const sopTasks = {
    all(): SopTask[] {
      return db
        .prepare('SELECT * FROM sop_tasks ORDER BY department_id, title')
        .all()
        .map((r: any) =>
          SopTaskSchema.parse({
            id: r.id,
            departmentId: r.department_id,
            title: r.title,
            summary: r.summary,
            steps: JSON.parse(r.steps),
            assigneeKind: r.assignee_kind,
            assigneeId: r.assignee_id,
          }),
        );
    },
    insert(t: SopTask): void {
      SopTaskSchema.parse(t);
      db.prepare(
        'INSERT OR REPLACE INTO sop_tasks (id, department_id, title, summary, steps, assignee_kind, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(t.id, t.departmentId, t.title, t.summary, JSON.stringify(t.steps), t.assigneeKind, t.assigneeId);
    },
    deleteWhereIdNotIn(ids: string[]): void {
      if (ids.length === 0) {
        db.prepare('DELETE FROM sop_tasks').run();
        return;
      }
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM sop_tasks WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const workflows = {
    all(): Workflow[] {
      return db
        .prepare('SELECT * FROM workflows ORDER BY ord, name')
        .all()
        .map((r: any) =>
          WorkflowSchema.parse({
            id: r.id,
            name: r.name,
            subtitle: r.subtitle,
            revenueUsd: r.revenue_usd,
            order: r.ord,
            steps: JSON.parse(r.steps),
            business: r.business,
          }),
        );
    },
    insert(w: Workflow): void {
      WorkflowSchema.parse(w);
      db.prepare(
        'INSERT OR REPLACE INTO workflows (id, name, subtitle, revenue_usd, ord, steps, business) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(w.id, w.name, w.subtitle, w.revenueUsd, w.order, JSON.stringify(w.steps), w.business);
    },
    deleteWhereIdNotIn(ids: string[]): void {
      if (ids.length === 0) {
        db.prepare('DELETE FROM workflows').run();
        return;
      }
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM workflows WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const skills = {
    all(): Skill[] {
      return db
        .prepare('SELECT * FROM skills ORDER BY ord, name')
        .all()
        .map((r: any) =>
          SkillSchema.parse({
            id: r.id,
            name: r.name,
            category: r.category,
            description: r.description,
            ownerAgentId: r.owner_agent_id,
            status: r.status,
            tools: JSON.parse(r.tools),
            markdown: r.markdown,
            order: r.ord,
          }),
        );
    },
    insert(s: Skill): void {
      SkillSchema.parse(s);
      db.prepare(
        'INSERT OR REPLACE INTO skills (id, name, category, description, owner_agent_id, status, tools, markdown, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(s.id, s.name, s.category, s.description, s.ownerAgentId, s.status, JSON.stringify(s.tools), s.markdown, s.order);
    },
    deleteWhereIdNotIn(ids: string[]): void {
      if (ids.length === 0) {
        db.prepare('DELETE FROM skills').run();
        return;
      }
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM skills WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const rowToFunnelTouch = (r: any): FunnelTouch =>
    FunnelTouchSchema.parse({
      id: r.id,
      contactId: r.contact_id,
      seq: r.seq,
      stage: r.stage,
      channel: r.channel,
      label: r.label,
      source: r.source,
      at: r.at,
      durationSeconds: r.duration_seconds ?? null,
    });

  const funnel = {
    insertContact(c: FunnelContact): void {
      FunnelContactSchema.parse(c);
      db.prepare(
        'INSERT OR REPLACE INTO funnel_contacts (id, name, business, status, product, amount_usd, cost_usd, relationship, likelihood, email, phone, person, company, role, linkedin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(c.id, c.name, c.business, c.status, c.product, c.amountUsd, c.costUsd, c.relationship, c.likelihood, c.email, c.phone, c.person, c.company, c.role, c.linkedin, c.createdAt);
    },
    insertTouch(t: FunnelTouch): void {
      FunnelTouchSchema.parse(t);
      db.prepare(
        'INSERT OR REPLACE INTO funnel_touches (id, contact_id, seq, stage, channel, label, source, at, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(t.id, t.contactId, t.seq, t.stage, t.channel, t.label, t.source, t.at, t.durationSeconds);
    },
    /** Contacts with their touches in journey order, newest contact first. */
    journeys(business?: FunnelBusiness): FunnelJourney[] {
      const rows = (
        business
          ? db.prepare('SELECT * FROM funnel_contacts WHERE business = ? ORDER BY created_at DESC, id').all(business)
          : db.prepare('SELECT * FROM funnel_contacts ORDER BY created_at DESC, id').all()
      ) as any[];
      // 2026-08-20: was one SELECT per contact (N+1) even with the index above;
      // batch-fetch every touch for this page in one query and group in JS.
      // Found by today's 3-agent system audit.
      const touchesByContact = new Map<string, any[]>();
      if (rows.length > 0) {
        const placeholders = rows.map(() => '?').join(',');
        const allTouches = db
          .prepare(`SELECT * FROM funnel_touches WHERE contact_id IN (${placeholders}) ORDER BY contact_id, seq`)
          .all(...rows.map((r) => r.id)) as any[];
        for (const t of allTouches) {
          const bucket = touchesByContact.get(t.contact_id);
          if (bucket) bucket.push(t);
          else touchesByContact.set(t.contact_id, [t]);
        }
      }
      return rows.map((r) =>
        FunnelJourneySchema.parse({
          id: r.id,
          name: r.name,
          business: r.business,
          status: r.status,
          product: r.product,
          amountUsd: r.amount_usd,
          costUsd: r.cost_usd,
          relationship: r.relationship,
          likelihood: r.likelihood,
          email: r.email,
          phone: r.phone,
          person: r.person,
          company: r.company,
          role: r.role,
          linkedin: r.linkedin,
          createdAt: r.created_at,
          touches: (touchesByContact.get(r.id) ?? []).map(rowToFunnelTouch),
        }),
      );
    },
  };

  const seedMeta = {
    get(key: string): string | null {
      const row = db.prepare('SELECT value FROM seed_meta WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    set(key: string, value: string): void {
      db.prepare('INSERT OR REPLACE INTO seed_meta (key, value) VALUES (?, ?)').run(key, value);
    },
  };

  /** The voice-relay queue behind Zoey's speaker daemon (Sean's local
   *  ~/.cowork_speaker/speaker_daemon.py). Any session — cloud or on-device
   *  — enqueues a short reply here; the daemon polls it over the network
   *  instead of needing a fresh device-folder grant every new session. See
   *  project_cowork_speaker_voice_system.md in project memory. */
  const voiceQueue = {
    enqueue(item: { id: string; text: string; createdAt: string }): void {
      db.prepare('INSERT INTO voice_queue (id, text, created_at) VALUES (?, ?, ?)').run(
        item.id,
        item.text,
        item.createdAt,
      );
    },
    /** Atomically pops the oldest unconsumed item (FIFO by created_at, id as
     *  a stable tiebreak) and marks it consumed, so a daemon retry or a
     *  second poller never speaks the same line twice. Also sweeps consumed
     *  rows older than 24h so the table never grows unbounded — this is a
     *  low-volume personal relay, not an audit log. Returns null when empty. */
    popNext(now: string): { id: string; text: string; createdAt: string } | null {
      return db.transaction(() => {
        const row = db
          .prepare(
            'SELECT id, text, created_at as createdAt FROM voice_queue WHERE consumed_at IS NULL ORDER BY created_at ASC, id ASC LIMIT 1',
          )
          .get() as { id: string; text: string; createdAt: string } | undefined;
        if (row) {
          db.prepare('UPDATE voice_queue SET consumed_at = ? WHERE id = ?').run(now, row.id);
        }
        const cutoff = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000).toISOString();
        db.prepare('DELETE FROM voice_queue WHERE consumed_at IS NOT NULL AND consumed_at < ?').run(cutoff);
        return row ?? null;
      })();
    },
  };

  const funnelClear = {
    /** Drop every funnel row — used by the seed to purge retired demo journeys. */
    clearAll(): void {
      db.prepare('DELETE FROM funnel_touches').run();
      db.prepare('DELETE FROM funnel_contacts').run();
    },
  };

  const quickbooksAuth = {
    /** The single stored grant, or null when QuickBooks has never been
        connected (or was disconnected). */
    get(): QuickBooksAuth | null {
      const row = db.prepare('SELECT * FROM quickbooks_auth WHERE id = ?').get('default') as
        | {
            id: string;
            realm_id: string;
            access_token: string;
            refresh_token: string;
            access_token_expires_at: number;
            refresh_token_expires_at: number;
            updated_at: string;
          }
        | undefined;
      if (!row) return null;
      return QuickBooksAuthSchema.parse({
        id: row.id,
        realmId: row.realm_id,
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        accessTokenExpiresAt: row.access_token_expires_at,
        refreshTokenExpiresAt: row.refresh_token_expires_at,
        updatedAt: row.updated_at,
      });
    },
    save(a: QuickBooksAuth): void {
      QuickBooksAuthSchema.parse(a);
      db.prepare(
        `INSERT OR REPLACE INTO quickbooks_auth
           (id, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(a.id, a.realmId, a.accessToken, a.refreshToken, a.accessTokenExpiresAt, a.refreshTokenExpiresAt, a.updatedAt);
    },
    clear(): void {
      db.prepare('DELETE FROM quickbooks_auth WHERE id = ?').run('default');
    },
  };

  /** Health of the AAC Brain — Sean's separate Mac-based automation system
      (~/.aac_brain: worker failure tracking, the Phase 9 action-drafting
      queue). Pushed here by stateio.py's heartbeat(), gated by
      AAC_BRAIN_SECRET (app/api/aac-brain/route.ts). Single latest-snapshot
      row, upserted on every push — no fabricated trend line, matches the
      rest of this repo's honest-status convention. */
  const brainHealth = {
    latest(): BrainHealth | null {
      const row = db.prepare('SELECT * FROM brain_health WHERE id = ?').get('aac_brain') as
        | {
            id: string;
            pending_actions: number;
            failing_workers: number;
            total_workers: number;
            top_failures: string;
            connector_health: string;
            last_daily_summary_date: string | null;
            reported_at: string;
            received_at: string;
          }
        | undefined;
      if (!row) return null;
      return BrainHealthSchema.parse({
        id: row.id,
        pendingActions: row.pending_actions,
        failingWorkers: row.failing_workers,
        totalWorkers: row.total_workers,
        topFailures: JSON.parse(row.top_failures),
        connectors: JSON.parse(row.connector_health || '[]'),
        lastDailySummaryDate: row.last_daily_summary_date,
        reportedAt: row.reported_at,
        receivedAt: row.received_at,
      });
    },
    upsert(snapshot: BrainHealth): void {
      BrainHealthSchema.parse(snapshot);
      db.prepare(
        `INSERT INTO brain_health
           (id, pending_actions, failing_workers, total_workers, top_failures, connector_health, last_daily_summary_date, reported_at, received_at)
         VALUES (@id, @pendingActions, @failingWorkers, @totalWorkers, @topFailures, @connectorHealth, @lastDailySummaryDate, @reportedAt, @receivedAt)
         ON CONFLICT(id) DO UPDATE SET
           pending_actions = excluded.pending_actions,
           failing_workers = excluded.failing_workers,
           total_workers = excluded.total_workers,
           top_failures = excluded.top_failures,
           connector_health = excluded.connector_health,
           last_daily_summary_date = excluded.last_daily_summary_date,
           reported_at = excluded.reported_at,
           received_at = excluded.received_at`,
      ).run({
        id: snapshot.id,
        pendingActions: snapshot.pendingActions,
        failingWorkers: snapshot.failingWorkers,
        totalWorkers: snapshot.totalWorkers,
        topFailures: JSON.stringify(snapshot.topFailures),
        connectorHealth: JSON.stringify(snapshot.connectors),
        lastDailySummaryDate: snapshot.lastDailySummaryDate,
        reportedAt: snapshot.reportedAt,
        receivedAt: snapshot.receivedAt,
      });
    },
  };

  return {
    departments,
    agents,
    tools,
    roadmap,
    metrics,
    domains,
    personas: { ...personas, ...personasClear },
    phases,
    agentRuns,
    agentMessages,
    agentTasks,
    agentCrons,
    broadcasts,
    contactTags,
    social,
    emailList,
    socialPosts,
    funnel: { ...funnel, ...funnelClear },
    seedMeta,
    voiceQueue,
    people,
    sopTasks,
    workflows,
    skills,
    quickbooksAuth,
    brainHealth,
    /** Runs `fn` inside a single SQLite transaction. Used to wrap the whole
        reseed (lib/seed.ts's seedDatabase) as one atomic write instead of
        dozens of separate auto-committed statements — see
        tests/db-reseed-race.test.ts for why that matters under concurrent
        writers (Next.js's build-time static-generation worker pool). */
    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },
    close: () => db.close(),
  };
}

export type FounderDb = ReturnType<typeof openDb>;
