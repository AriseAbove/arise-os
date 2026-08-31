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
  MailTriageLogSchema,
  MailExtractionSchema,
  MailDraftSchema,
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
  ProjectMilestoneSchema,
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
  type MailTriageLog,
  type MailExtraction,
  type MailDraft,
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
  type ProjectMilestone,
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
-- Construction-phase milestones (the client tracker's "which trade is done"
-- half, distinct from FunnelStage's sales-pipeline half) — one row per
-- contact per completed milestone id, see lib/project-milestones.ts.
CREATE TABLE IF NOT EXISTS project_milestones (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES funnel_contacts(id),
  milestone_id TEXT NOT NULL,
  label TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_milestones_contact ON project_milestones (contact_id);
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
CREATE TABLE IF NOT EXISTS push_queue (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS mail_triage_log (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL,
  inbox_name TEXT NOT NULL,
  uid INTEGER NOT NULL,
  from_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  verdict TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  moved INTEGER NOT NULL,
  mode TEXT NOT NULL,
  message_id TEXT,
  purged_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_triage_log_created ON mail_triage_log (created_at DESC);
CREATE TABLE IF NOT EXISTS mail_extractions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  inbox_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  project_address TEXT,
  dollar_amount REAL,
  draw_number INTEGER,
  invoice_number TEXT,
  confidence INTEGER NOT NULL,
  extracted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mail_drafts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  extraction_id TEXT NOT NULL,
  executive_summary TEXT NOT NULL,
  proposed_reply_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

// Same-day rewrite (2026-08-28): the "Zero-Scan, High-Confidence
// Quarantine" model added a confidence score and the Message-ID tracking
// the 14-day quarantine-expiry sweep needs (UIDs don't survive an IMAP
// move — Message-ID does). A pre-rewrite row (that one night's dry-run
// testing, before this table had any real reader) backfills confidence to
// 0 and message_id/purged_at to NULL — honest defaults, not real values.
function migrateMailTriageLogTable(db: InstanceType<typeof Database>): void {
  const columns = new Set((db.pragma('table_info(mail_triage_log)') as { name: string }[]).map((c) => c.name));
  if (columns.size === 0) return;
  if (!columns.has('confidence')) {
    safeAlter(db, 'ALTER TABLE mail_triage_log ADD COLUMN confidence INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.has('message_id')) {
    safeAlter(db, 'ALTER TABLE mail_triage_log ADD COLUMN message_id TEXT');
  }
  if (!columns.has('purged_at')) {
    safeAlter(db, 'ALTER TABLE mail_triage_log ADD COLUMN purged_at TEXT');
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
  migrateMailTriageLogTable(db);
  // Deliberately created AFTER the migration above, not inside the initial
  // DDL block: a production mail_triage_log table that predates the
  // purged_at column (added same-day as the quarantine-expiry rewrite,
  // 2026-08-28) doesn't get that column until migrateMailTriageLogTable's
  // ALTER runs. Indexing purged_at inside the DDL's single db.exec() call —
  // which runs BEFORE any migrate*Table() function — threw `SqliteError: no
  // such column: purged_at` on exactly that legacy table shape, which
  // aborted the whole exec() and left `instance` unset in lib/data.ts's
  // getDb(), so EVERY subsequent request re-threw the same error trying to
  // open the db again — a site-wide outage (see the 2026-08-28 CLAUDE.md
  // entry for the incident). A fresh ':memory:' test db never hits this: its
  // CREATE TABLE already includes purged_at, so the migration is a no-op and
  // the ordering bug never gets exercised.
  db.exec('CREATE INDEX IF NOT EXISTS idx_mail_triage_log_purge ON mail_triage_log (verdict, moved, purged_at, created_at)');
  // Added 2026-08-31 alongside the triage-run dedup fix: byMessageId() below
  // is now called once per candidate UID on every scan (the fix for that
  // day's outage), not just occasionally by the purge sweep — an unindexed
  // scan over a 30k+-row table on every single message would just trade one
  // performance cliff for another. Same "after the migration, not in the
  // initial DDL" placement as idx_mail_triage_log_purge above, for the same
  // legacy-table-shape reason.
  db.exec('CREATE INDEX IF NOT EXISTS idx_mail_triage_log_message_id ON mail_triage_log (message_id)');

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

  const rowToProjectMilestone = (r: any): ProjectMilestone =>
    ProjectMilestoneSchema.parse({
      id: r.id,
      contactId: r.contact_id,
      milestoneId: r.milestone_id,
      label: r.label,
      completedAt: r.completed_at,
    });

  const projectMilestones = {
    /** Completed milestones for one contact, in the order they were
     *  completed — NOT catalog order, since a real job can do trades out of
     *  the typical sequence (e.g. tile before cabinets on a rush job). The
     *  tracker UI sorts by the catalog's own order for display; this is the
     *  honest record of what actually happened and when. */
    forContact(contactId: string): ProjectMilestone[] {
      return (
        db
          .prepare('SELECT * FROM project_milestones WHERE contact_id = ? ORDER BY completed_at, id')
          .all(contactId) as any[]
      ).map(rowToProjectMilestone);
    },
    insert(m: ProjectMilestone): void {
      ProjectMilestoneSchema.parse(m);
      db.prepare(
        'INSERT OR REPLACE INTO project_milestones (id, contact_id, milestone_id, label, completed_at) VALUES (?, ?, ?, ?, ?)',
      ).run(m.id, m.contactId, m.milestoneId, m.label, m.completedAt);
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

  /** Fallback relay queue for Chief of Staff's ntfy push (2026-08-24). Live
   *  diagnosis from Railway's own Console confirmed this service cannot
   *  reach ntfy.sh's resolved IP at all (every attempt times out — general
   *  outbound HTTPS is fine, e.g. api.github.com succeeds in ~40ms), most
   *  likely ntfy.sh blocking Railway's shared egress IP range. Sean's Mac
   *  reaches ntfy.sh fine — the AAC Brain's own pushes prove it — so
   *  lib/agents/real.ts's chiefOfStaffRunWith enqueues here whenever a
   *  direct sendNtfyPush attempt fails at the network level, and a small
   *  poller on the Mac (~/.aac_brain/push_relay.py, same pattern as the
   *  voice relay above) GETs /api/push/relay and forwards the exact
   *  url/title/body to ntfy itself, which it can actually reach. Same
   *  lifecycle as voiceQueue: atomic pop-and-consume, 24h sweep. */
  const pushQueue = {
    enqueue(item: { id: string; url: string; title: string; body: string; createdAt: string }): void {
      db.prepare('INSERT INTO push_queue (id, url, title, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
        item.id,
        item.url,
        item.title,
        item.body,
        item.createdAt,
      );
    },
    popNext(now: string): { id: string; url: string; title: string; body: string; createdAt: string } | null {
      return db.transaction(() => {
        const row = db
          .prepare(
            'SELECT id, url, title, body, created_at as createdAt FROM push_queue WHERE consumed_at IS NULL ORDER BY created_at ASC, id ASC LIMIT 1',
          )
          .get() as { id: string; url: string; title: string; body: string; createdAt: string } | undefined;
        if (row) {
          db.prepare('UPDATE push_queue SET consumed_at = ? WHERE id = ?').run(now, row.id);
        }
        const cutoff = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000).toISOString();
        db.prepare('DELETE FROM push_queue WHERE consumed_at IS NOT NULL AND consumed_at < ?').run(cutoff);
        return row ?? null;
      })();
    },
  };

  /** Gmail Worker's junk-triage audit trail — see MailTriageLogSchema. Insert
   * is append-only (no update/delete of the classification itself); the only
   * mutation ever made to an existing row is markPurged, closing out a
   * quarantine row once the 14-day sweep has resolved it one way or the
   * other. The whole point is an unedited record of what the triage pass
   * actually decided, in dry_run or live mode. */
  function rowToMailTriageLog(r: any): MailTriageLog {
    return MailTriageLogSchema.parse({
      id: r.id,
      inboxId: r.inbox_id,
      inboxName: r.inbox_name,
      uid: r.uid,
      fromAddress: r.from_address,
      subject: r.subject,
      verdict: r.verdict,
      confidence: r.confidence,
      reason: r.reason,
      moved: Boolean(r.moved),
      mode: r.mode,
      messageId: r.message_id ?? null,
      purgedAt: r.purged_at ?? null,
      createdAt: r.created_at,
    });
  }

  const mailTriageLog = {
    insert(entry: MailTriageLog): void {
      MailTriageLogSchema.parse(entry);
      db.prepare(
        `INSERT INTO mail_triage_log
          (id, inbox_id, inbox_name, uid, from_address, subject, verdict, confidence, reason, moved, mode, message_id, purged_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entry.id,
        entry.inboxId,
        entry.inboxName,
        entry.uid,
        entry.fromAddress,
        entry.subject,
        entry.verdict,
        entry.confidence,
        entry.reason,
        entry.moved ? 1 : 0,
        entry.mode,
        entry.messageId,
        entry.purgedAt,
        entry.createdAt,
      );
    },
    recent(limit: number): MailTriageLog[] {
      return (
        db.prepare('SELECT * FROM mail_triage_log ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit) as any[]
      ).map(rowToMailTriageLog);
    },
    /** The real fromAddress/inboxId/subject for a message, keyed by
     * Message-ID — every message triage ever looks at gets a row here
     * (including 'protected' verdicts), so this is the one durable, honest
     * source for "who do I actually reply to" behind the approve-draft
     * route, rather than trusting a client-supplied address. Most recent
     * row wins if a Message-ID somehow appears more than once. */
    byMessageId(messageId: string): MailTriageLog | null {
      const row = db
        .prepare('SELECT * FROM mail_triage_log WHERE message_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
        .get(messageId) as any;
      return row ? rowToMailTriageLog(row) : null;
    },
    /** Quarantine rows still awaiting the expiry sweep, past `olderThanIso`,
     * oldest first (process the longest-waiting ones first) — the query the
     * 14-day purge sweep runs. Scoped to a single inbox since the sweep runs
     * per-inbox against a live IMAP connection. */
    dueForPurge(inboxId: string, olderThanIso: string, limit: number): MailTriageLog[] {
      return (
        db
          .prepare(
            `SELECT * FROM mail_triage_log
             WHERE inbox_id = ? AND verdict = 'quarantine' AND moved = 1 AND purged_at IS NULL AND created_at <= ?
             ORDER BY created_at ASC LIMIT ?`,
          )
          .all(inboxId, olderThanIso, limit) as any[]
      ).map(rowToMailTriageLog);
    },
    /** Marks a quarantine row resolved by the expiry sweep — released to
     * Trash, or found already gone. Idempotent no-op if already marked. */
    markPurged(id: string, purgedAt: string): void {
      db.prepare('UPDATE mail_triage_log SET purged_at = ? WHERE id = ? AND purged_at IS NULL').run(purgedAt, id);
    },
  };

  /** Gmail Worker's post-triage structured extraction — see
   * MailExtractionSchema. One row per 'protected' message actually run
   * through lib/mail-extraction.ts; insert is idempotent by message_id
   * (a re-run of the same message overwrites rather than duplicating, since
   * message_id is UNIQUE and extraction is a pure re-derivable function of
   * the message content — unlike mail_triage_log, this isn't an append-only
   * audit trail). */
  function rowToMailExtraction(r: any): MailExtraction {
    return MailExtractionSchema.parse({
      id: r.id,
      messageId: r.message_id,
      inboxId: r.inbox_id,
      intent: r.intent,
      projectAddress: r.project_address ?? null,
      dollarAmount: r.dollar_amount ?? null,
      drawNumber: r.draw_number ?? null,
      invoiceNumber: r.invoice_number ?? null,
      confidence: r.confidence,
      extractedAt: r.extracted_at,
    });
  }

  const mailExtractions = {
    insert(entry: MailExtraction): void {
      MailExtractionSchema.parse(entry);
      db.prepare(
        `INSERT INTO mail_extractions
          (id, message_id, inbox_id, intent, project_address, dollar_amount, draw_number, invoice_number, confidence, extracted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           id = excluded.id, inbox_id = excluded.inbox_id, intent = excluded.intent,
           project_address = excluded.project_address, dollar_amount = excluded.dollar_amount,
           draw_number = excluded.draw_number, invoice_number = excluded.invoice_number,
           confidence = excluded.confidence, extracted_at = excluded.extracted_at`,
      ).run(
        entry.id,
        entry.messageId,
        entry.inboxId,
        entry.intent,
        entry.projectAddress,
        entry.dollarAmount,
        entry.drawNumber,
        entry.invoiceNumber,
        entry.confidence,
        entry.extractedAt,
      );
    },
    byMessageId(messageId: string): MailExtraction | null {
      const row = db.prepare('SELECT * FROM mail_extractions WHERE message_id = ?').get(messageId) as any;
      return row ? rowToMailExtraction(row) : null;
    },
    byId(id: string): MailExtraction | null {
      const row = db.prepare('SELECT * FROM mail_extractions WHERE id = ?').get(id) as any;
      return row ? rowToMailExtraction(row) : null;
    },
  };

  /** Executive summary + proposed reply for one extracted message — see
   * MailDraftSchema. Strict human-in-the-loop: created 'pending' and only
   * ever moved to 'approved'/'edited'/'rejected' by
   * POST /api/comms/approve-draft, never automatically. */
  function rowToMailDraft(r: any): MailDraft {
    return MailDraftSchema.parse({
      id: r.id,
      messageId: r.message_id,
      extractionId: r.extraction_id,
      executiveSummary: r.executive_summary,
      proposedReplyText: r.proposed_reply_text,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }

  const mailDrafts = {
    insert(entry: MailDraft): void {
      MailDraftSchema.parse(entry);
      db.prepare(
        `INSERT INTO mail_drafts
          (id, message_id, extraction_id, executive_summary, proposed_reply_text, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           id = excluded.id, extraction_id = excluded.extraction_id,
           executive_summary = excluded.executive_summary, proposed_reply_text = excluded.proposed_reply_text,
           updated_at = excluded.updated_at
         WHERE mail_drafts.status = 'pending'`,
      ).run(
        entry.id,
        entry.messageId,
        entry.extractionId,
        entry.executiveSummary,
        entry.proposedReplyText,
        entry.status,
        entry.createdAt,
        entry.updatedAt,
      );
    },
    byMessageId(messageId: string): MailDraft | null {
      const row = db.prepare('SELECT * FROM mail_drafts WHERE message_id = ?').get(messageId) as any;
      return row ? rowToMailDraft(row) : null;
    },
    byId(id: string): MailDraft | null {
      const row = db.prepare('SELECT * FROM mail_drafts WHERE id = ?').get(id) as any;
      return row ? rowToMailDraft(row) : null;
    },
    /** Every draft still awaiting a human decision, oldest first — the query
     * behind the /comms "Drafts" review tab. Oldest-first so the queue is
     * worked in the order messages actually arrived, not last-in-first-out. */
    pending(limit = 100): MailDraft[] {
      return (
        db
          .prepare("SELECT * FROM mail_drafts WHERE status = 'pending' ORDER BY created_at ASC, rowid ASC LIMIT ?")
          .all(limit) as any[]
      ).map(rowToMailDraft);
    },
    /** The only way a draft's status ever changes — called exclusively from
     * POST /api/comms/approve-draft after a real human tap. `editedText`
     * overwrites the proposed reply only when provided (an EDIT_AND_SEND
     * action); approve/reject leave the original draft text intact for the
     * record. No-op (0 rows) if the draft is no longer 'pending' — an
     * already-resolved draft can't be resolved a second time. */
    updateStatus(id: string, status: 'approved' | 'edited' | 'rejected', updatedAt: string, editedText?: string): void {
      if (editedText !== undefined) {
        db.prepare(
          "UPDATE mail_drafts SET status = ?, proposed_reply_text = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
        ).run(status, editedText, updatedAt, id);
      } else {
        db.prepare("UPDATE mail_drafts SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'").run(
          status,
          updatedAt,
          id,
        );
      }
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
    projectMilestones,
    seedMeta,
    voiceQueue,
    pushQueue,
    mailTriageLog,
    mailExtractions,
    mailDrafts,
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
