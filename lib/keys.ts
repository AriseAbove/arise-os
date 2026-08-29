/**
 * API key management for the Connections board. Keys live in .env.local
 * (gitignored) — this module lists slot status with MASKED values and
 * writes updates. Raw secret values never leave the server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { bundledBrainStoreExists } from '@/lib/brain';

export type KeySlot = { envVar: string; label: string; group: string; hint?: string };

export const KEY_SLOTS: KeySlot[] = [
  {
    envVar: 'INBOX_1_HOST',
    label: 'Inbox 1 host',
    group: 'Email',
    hint: 'a Google host also powers Calendar via CalDAV — see lib/connectors/gcal.ts',
  },
  { envVar: 'INBOX_1_USER', label: 'Inbox 1 user', group: 'Email' },
  { envVar: 'INBOX_1_PASS', label: 'Inbox 1 app password', group: 'Email', hint: 'Gmail app password' },
  { envVar: 'INBOX_2_HOST', label: 'Inbox 2 host', group: 'Email' },
  { envVar: 'INBOX_2_USER', label: 'Inbox 2 user', group: 'Email' },
  { envVar: 'INBOX_2_PASS', label: 'Inbox 2 app password', group: 'Email' },
  { envVar: 'INBOX_3_HOST', label: 'Inbox 3 host', group: 'Email' },
  { envVar: 'INBOX_3_USER', label: 'Inbox 3 user', group: 'Email' },
  { envVar: 'INBOX_3_PASS', label: 'Inbox 3 app password', group: 'Email' },
  { envVar: 'INBOX_4_HOST', label: 'Inbox 4 host', group: 'Email' },
  { envVar: 'INBOX_4_USER', label: 'Inbox 4 user', group: 'Email' },
  { envVar: 'INBOX_4_PASS', label: 'Inbox 4 app password', group: 'Email' },
  // Deliberately no separate "Calendar" credential slots (CAL_1_USER/
  // CAL_1_PASS used to live here but nothing ever read them — see
  // 2026-08-21 fix in CLAUDE.md). lib/connectors/gcal.ts's real calendar
  // connector authenticates with the SAME Google INBOX_*_USER/_PASS app
  // passwords above (a Gmail app password also unlocks the legacy CalDAV
  // endpoint), so those dead vars showing "not set" next to a genuinely
  // CONNECTED Calendar card was the actual bug: the credential panel was
  // labeling the wrong env vars, not the badge lying.
  { envVar: 'QUICKBOOKS_CLIENT_ID', label: 'QuickBooks client id', group: 'QuickBooks' },
  { envVar: 'QUICKBOOKS_CLIENT_SECRET', label: 'QuickBooks client secret', group: 'QuickBooks' },
  { envVar: 'BRAIN_STORE', label: 'Knowledge store path', group: 'Knowledge', hint: 'folder of markdown files' },
  { envVar: 'ALLO_API_KEY', label: 'Allo API key', group: 'Allo', hint: 'Conversations Read scope' },
  {
    envVar: 'NTFY_TOPIC',
    label: 'ntfy topic',
    group: 'Chief of Staff',
    hint: 'pick any hard-to-guess topic name — sendNtfyPush (lib/chief-of-staff.ts) reads this',
  },
  {
    envVar: 'NTFY_URL',
    label: 'ntfy server URL',
    group: 'Chief of Staff',
    hint: 'optional — defaults to https://ntfy.sh; set only when self-hosting',
  },
  {
    envVar: 'BACKUP_EXPORT_SECRET',
    label: 'DB backup export secret',
    group: 'Backups',
    hint: 'long random string — must match the same value as a GitHub Actions repo secret; see .github/workflows/db-backup.yml',
  },
  {
    envVar: 'TRACK_TOKEN_SECRET',
    label: 'Tracker token secret',
    group: 'Client Tracker',
    hint: 'long random string — signs /track/[token] links, lib/track-token.ts',
  },
  {
    envVar: 'PUBLIC_APP_URL',
    label: 'Public app URL',
    group: 'Client Tracker',
    hint: 'this app\'s own base URL, used to build the /track link sent to clients',
  },
  { envVar: 'TWILIO_ACCOUNT_SID', label: 'Twilio account SID', group: 'Client Tracker' },
  { envVar: 'TWILIO_AUTH_TOKEN', label: 'Twilio auth token', group: 'Client Tracker' },
  { envVar: 'TWILIO_FROM_NUMBER', label: 'Twilio sending number', group: 'Client Tracker' },
  {
    envVar: 'MAIL_TRIAGE_MODE',
    label: 'Mail triage mode',
    group: 'Mail Triage',
    hint: 'off (default) / dry_run / live — see lib/connectors/email-triage.ts',
  },
  {
    envVar: 'MAIL_TRIAGE_MAX_MOVES',
    label: 'Mail triage max trash moves/run',
    group: 'Mail Triage',
    hint: 'live mode only — >=95% confidence junk, moved straight to Trash — defaults to 20',
  },
  {
    envVar: 'MAIL_TRIAGE_MAX_QUARANTINE',
    label: 'Mail triage max quarantine moves/run',
    group: 'Mail Triage',
    hint: 'live mode only — 60-94% confidence, moved to the Quarantine folder — defaults to 50',
  },
  {
    envVar: 'MAIL_TRIAGE_QUARANTINE_DAYS',
    label: 'Mail triage quarantine expiry (days)',
    group: 'Mail Triage',
    hint: 'a quarantined message with no other action releases to Trash after this many days — defaults to 14',
  },
  {
    envVar: 'MAIL_TRIAGE_LIVE_INBOXES',
    label: 'Mail triage live inboxes',
    group: 'Mail Triage',
    hint: 'comma-separated inbox ids (e.g. inbox-1) — unset means every configured inbox',
  },
  {
    envVar: 'MAIL_EXTRACTION_ENABLED',
    label: 'Mail extraction + drafts enabled',
    group: 'Mail Triage',
    hint: 'true/false — deterministic post-triage extraction + draft generation for protected mail, off by default. See lib/mail-extraction.ts',
  },
];

export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

export type KeyStatus = KeySlot & { present: boolean; masked: string; note?: string };

export function listKeyStatuses(env: Record<string, string | undefined> = process.env): KeyStatus[] {
  return KEY_SLOTS.map((slot) => {
    const value = env[slot.envVar] ?? '';
    const present = value.length > 0;
    // BRAIN_STORE is the one slot whose "not set" can sit directly under a
    // genuinely CONNECTED badge (Knowledge Store falls back to the bundled
    // knowledge/brain-store/ folder — see lib/brain.ts). Left as a bare "not
    // set" this reads as a contradiction; the note makes both facts visible
    // and consistent instead of one silently overriding the other.
    const note =
      slot.envVar === 'BRAIN_STORE' && !present && bundledBrainStoreExists(env)
        ? 'using the bundled starter store — already connected'
        : undefined;
    return { ...slot, present, masked: maskSecret(value), note };
  });
}

const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

/** Update or append KEY=value in an env file, preserving everything else. */
export function upsertEnvLocal(filePath: string, key: string, value: string): void {
  if (!ENV_NAME_RE.test(key)) throw new Error(`invalid env var name: ${key}`);
  if (/[\n\r]/.test(value)) throw new Error('value must be a single line');

  let lines: string[] = [];
  try {
    lines = fs.readFileSync(filePath, 'utf8').split('\n');
  } catch {
    // file does not exist yet — start fresh
  }

  const prefix = `${key}=`;
  let replaced = false;
  const next = lines.map((line) => {
    if (!replaced && line.trim().startsWith(prefix)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!replaced) {
    while (next.length > 0 && next[next.length - 1].trim() === '') next.pop();
    next.push(`${key}=${value}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${next.join('\n')}\n`, 'utf8');
}
