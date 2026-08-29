import { NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { runtimeEnv } from '@/lib/creds';
import { currentDbPath } from '@/lib/data';

// Machine-facing DB export, called nightly by
// .github/workflows/db-backup.yml — a zero-cost, no-new-account substitute
// for Railway's paid volume-backup feature (Backups/PITR require the Pro
// plan; this project is on Hobby, and upgrading purely for that was judged
// not worth the recurring cost at this stage — see CLAUDE.md's changelog).
// GitHub Actions has no access to the Railway volume directly, so this
// route is the only way to get a copy of the live database off of Railway:
// it streams back a gzip-compressed snapshot, which the workflow commits to
// a dedicated `db-backups` branch in this same repo (a place Sean already
// has access to and pays nothing extra for).
//
// Same bearer-token pattern as CRON_SECRET/VOICE_RELAY_SECRET/
// PUSH_RELAY_SECRET/AAC_BRAIN_SECRET: a machine caller that can't do an
// interactive Basic Auth challenge, gated by BACKUP_EXPORT_SECRET, exempted
// from the Basic Auth wall via middleware.ts's BYPASS_PREFIXES, and honest
// like every other connector here — 501 (not a silent 200) when the secret
// isn't configured yet.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const env = runtimeEnv();
  const secret = env.BACKUP_EXPORT_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'BACKUP_EXPORT_SECRET not set — add it to .env.local (and the host env / GitHub Actions repo secrets) to enable scheduled DB backups.',
      },
      { status: 501 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dbPath = currentDbPath();
  if (dbPath === ':memory:') {
    return NextResponse.json(
      { error: 'FOUNDER_OS_DB is :memory: — nothing on disk to back up.' },
      { status: 501 },
    );
  }

  // better-sqlite3's own .backup() wraps SQLite's online backup API — safe
  // to run against the live database while the app keeps reading/writing it
  // (including under WAL mode, which lib/db.ts's openDb() always enables):
  // it checkpoints and copies page-by-page rather than doing a raw
  // fs.copyFile, which could catch a mid-write torn page. A fresh, separate
  // *readonly* connection is opened just for this export rather than
  // reusing the app's getDb() singleton, so a backup request can never
  // itself hold a lock the live app is waiting on.
  const source = new Database(dbPath, { readonly: true });
  const tmpPath = path.join(os.tmpdir(), `founder-os-backup-${Date.now()}-${process.pid}.db`);
  try {
    await source.backup(tmpPath);
  } finally {
    source.close();
  }

  let gzipped: Buffer;
  try {
    gzipped = zlib.gzipSync(fs.readFileSync(tmpPath));
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }

  const filename = `founder-os-${new Date().toISOString().slice(0, 10)}.db.gz`;
  // Buffer's .buffer can be typed ArrayBufferLike (which admits
  // SharedArrayBuffer), which BlobPart/BodyInit reject under this repo's TS
  // lib config — Uint8Array.from() copies into a plain, non-shared
  // ArrayBuffer-backed view instead.
  return new NextResponse(new Blob([Uint8Array.from(gzipped)]), {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(gzipped.length),
    },
  });
}
