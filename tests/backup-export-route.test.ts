import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { GET } from '@/app/api/backup/export/route';

// The nightly DB backup export (2026-08-29) — a zero-cost, no-new-account
// substitute for Railway's paid volume-backup feature (Hobby plan doesn't
// include it; see CLAUDE.md's changelog). Same bearer-secret pattern as
// every other machine-caller route in this repo (CRON_SECRET,
// VOICE_RELAY_SECRET, PUSH_RELAY_SECRET) — gated by BACKUP_EXPORT_SECRET.
describe('/api/backup/export', () => {
  const prevSecret = process.env.BACKUP_EXPORT_SECRET;
  const prevDb = process.env.FOUNDER_OS_DB;
  let dbPath: string;

  beforeEach(() => {
    process.env.BACKUP_EXPORT_SECRET = 'test-secret';
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aac-backup-test-')), 'founder-os.db');
    const seed = new Database(dbPath);
    seed.pragma('journal_mode = WAL');
    seed.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    seed.prepare('INSERT INTO t (v) VALUES (?)').run('real row');
    seed.close();
    process.env.FOUNDER_OS_DB = dbPath;
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.BACKUP_EXPORT_SECRET;
    else process.env.BACKUP_EXPORT_SECRET = prevSecret;
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  const get = (secret = 'test-secret') =>
    GET(new Request('http://test/api/backup/export', { headers: { authorization: `Bearer ${secret}` } }));

  test('rejects an unauthorized GET', async () => {
    const res = await get('wrong');
    expect(res.status).toBe(401);
  });

  test('returns 501 with a setup hint when BACKUP_EXPORT_SECRET is not configured', async () => {
    delete process.env.BACKUP_EXPORT_SECRET;
    const res = await get('anything');
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/BACKUP_EXPORT_SECRET/);
  });

  test('returns 501 when FOUNDER_OS_DB is :memory: — nothing on disk to back up', async () => {
    process.env.FOUNDER_OS_DB = ':memory:';
    const res = await get();
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/:memory:/);
  });

  test('returns a gzip snapshot that decompresses back to the real database, including real rows', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/gzip');
    expect(res.headers.get('content-disposition')).toMatch(/founder-os-\d{4}-\d{2}-\d{2}\.db\.gz/);

    const gzipped = Buffer.from(await res.arrayBuffer());
    const raw = zlib.gunzipSync(gzipped);

    const restoredPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aac-backup-restore-')), 'restored.db');
    fs.writeFileSync(restoredPath, raw);
    const restored = new Database(restoredPath, { readonly: true });
    expect(restored.prepare('SELECT v FROM t').all()).toEqual([{ v: 'real row' }]);
    restored.close();
    fs.rmSync(path.dirname(restoredPath), { recursive: true, force: true });
  });
});
