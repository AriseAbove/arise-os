import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { openDb } from '@/lib/db';

/**
 * Reproduces the 2026-08-28 production outage: a real mail_triage_log table
 * created by an earlier deploy (before the "Zero-Scan, High-Confidence
 * Quarantine" rewrite added confidence/message_id/purged_at) sat on the
 * Railway volume without those columns. openDb()'s single db.exec(DDL) call
 * used to include `CREATE INDEX ... ON mail_triage_log (..., purged_at, ...)`
 * ahead of migrateMailTriageLogTable()'s ALTER TABLE that actually adds the
 * column -- so on a legacy table, that CREATE INDEX statement itself threw
 * `SqliteError: no such column: purged_at`, aborting the whole exec() call
 * before the migration ever ran. Since lib/data.ts's getDb() only caches its
 * singleton on a successful return, every single request re-threw the same
 * error trying to open the db again -- a site-wide outage, not just a
 * mail-triage bug. A fresh ':memory:' db (what every other test in this repo
 * uses) never exercises this: its CREATE TABLE already includes purged_at,
 * so the migration is a no-op and the ordering bug stays invisible -- this
 * test is deliberately file-backed so it starts from a legacy on-disk shape
 * instead.
 */
describe('openDb — legacy mail_triage_log table (pre-dates purged_at)', () => {
  let dbPath: string;

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
  });

  test('opens without throwing, and migrates + indexes the legacy table', () => {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aac-db-test-')), 'legacy.db');

    // Simulate the pre-rewrite schema: mail_triage_log exists, but without
    // confidence/message_id/purged_at (and no seed data needed for this).
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE mail_triage_log (
        id TEXT PRIMARY KEY,
        inbox_id TEXT NOT NULL,
        inbox_name TEXT NOT NULL,
        uid INTEGER NOT NULL,
        from_address TEXT NOT NULL,
        subject TEXT NOT NULL,
        verdict TEXT NOT NULL,
        reason TEXT NOT NULL,
        moved INTEGER NOT NULL,
        mode TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    legacy.close();

    // The actual regression: this used to throw
    // `SqliteError: no such column: purged_at` and leave getDb()'s singleton
    // unset, so every future request failed identically.
    expect(() => openDb(dbPath)).not.toThrow();

    const db = new Database(dbPath);
    const columns = new Set((db.pragma('table_info(mail_triage_log)') as { name: string }[]).map((c) => c.name));
    expect(columns.has('confidence')).toBe(true);
    expect(columns.has('message_id')).toBe(true);
    expect(columns.has('purged_at')).toBe(true);

    const indexes = (db.pragma('index_list(mail_triage_log)') as { name: string }[]).map((i) => i.name);
    expect(indexes).toContain('idx_mail_triage_log_purge');
    db.close();
  });
});
