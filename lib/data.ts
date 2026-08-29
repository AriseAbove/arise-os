import path from 'node:path';
import fs from 'node:fs';
import { openDb, type FounderDb } from '@/lib/db';
import { SEED_VERSION, seedDatabase } from '@/lib/seed';

/**
 * App-level singleton. Larp-first, real-ready: every page and API route reads
 * through this seeded SQLite database, so swapping in live sources later is a
 * repo-level change, not a UI rewrite.
 */
let instance: FounderDb | null = null;

/** Test-only escape hatch: closes and drops the cached singleton so the next
 * getDb() call opens a brand-new instance (honoring whatever FOUNDER_OS_DB is
 * set to at that moment). Toggling FOUNDER_OS_DB alone isn't enough for true
 * per-test isolation within a single test file — the singleton above persists
 * across tests regardless of the env var, so a `:memory:` DB opened by test 1
 * is still the one test 2 reads unless this is called first (see
 * tests/email-triage-run.test.ts's quarantine-expiry sweep suite, where
 * dry_run/live tests insert real mail_triage_log rows). Never call this from
 * application code.
 */
export function resetDbForTests(): void {
  instance?.close();
  instance = null;
}

/** The on-disk path getDb() resolves FOUNDER_OS_DB to — same fallback logic,
 * pulled out so a caller that needs the real file path (app/api/backup/
 * export/route.ts's DB export) doesn't duplicate it or risk drifting out of
 * sync with what getDb() actually opened. */
export function currentDbPath(): string {
  return process.env.FOUNDER_OS_DB ?? path.join(process.cwd(), 'data', 'founder-os.db');
}

export function getDb(): FounderDb {
  if (instance) return instance;
  const dbPath = currentDbPath();
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  instance = openDb(dbPath);
  // Seed on first touch, and re-seed ONCE whenever the seed baseline version
  // changes (picks up new baseline rows and purges retired ones). Real
  // recorded data always survives a re-seed — the purge clauses only remove
  // rows the seed itself created.
  if (
    instance.departments.all().length === 0 ||
    instance.seedMeta.get('seed_version') !== SEED_VERSION
  ) {
    seedDatabase(instance);
  }
  return instance;
}
