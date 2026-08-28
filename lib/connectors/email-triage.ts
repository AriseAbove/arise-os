/**
 * Gmail Worker's junk-triage runner — the IMAP-facing half of Sean's
 * "Zero-Scan, High-Confidence Quarantine" model (rewritten 2026-08-28, same
 * day as the original triage feature; lib/mail-triage.ts holds the pure
 * classifier this calls).
 *
 * Three modes, controlled entirely by env vars so a phase change never needs
 * a code change:
 *   - 'off'     (default): does nothing. The pre-existing read-only
 *     unread-count behavior is completely unaffected by this module.
 *   - 'dry_run': scans unseen mail, classifies it, and records every verdict
 *     to mail_triage_log — but never calls messageMove and never runs the
 *     quarantine-expiry sweep (there's nothing live to sweep yet).
 *   - 'live':   same scan + classify, and for each verdict:
 *       'trash'      -> moved to the inbox's real Trash folder (found via
 *                       the IMAP \Trash special-use flag — never a guessed
 *                       folder name), capped at MAIL_TRIAGE_MAX_MOVES/run.
 *       'quarantine' -> moved to a "Quarantine" mailbox (created on first
 *                       use), capped at MAIL_TRIAGE_MAX_QUARANTINE/run.
 *       'protected'  -> left exactly where it is. No action, ever.
 *     Only for inboxes listed in MAIL_TRIAGE_LIVE_INBOXES (unset = every
 *     configured inbox).
 *
 * Quarantine-expiry sweep (live mode only): once a quarantined message has
 * sat there past MAIL_TRIAGE_QUARANTINE_DAYS (default 14), it's released to
 * Trash — never expunged/permanently deleted by this code, matching Sean's
 * original hard rule for the whole feature. Message-ID (not UID — a UID is
 * only valid within the mailbox that issued it, and a message gets a new
 * one the moment it's moved) is what lets the sweep find a quarantined
 * message again days later to release it.
 *
 * No notification of any kind fires from this module — Sean's explicit
 * instruction was "do NOT ping or alert me about these messages." The
 * Quarantine folder itself, viewable any time in his own mail client, is
 * the intended safety net, not a push/log-review workflow.
 */
import type { ImapFlow } from 'imapflow';
import { imapClientOptions, parseInboxConfigs, type InboxConfig } from '@/lib/connectors/email';
import { classifyForTriage, type MailTriageVerdict } from '@/lib/mail-triage';
import { getDb } from '@/lib/data';
import type { MailTriageLog } from '@/lib/schemas';

export type TriageMode = 'off' | 'dry_run' | 'live';

export type TriageEnvConfig = {
  mode: TriageMode;
  /** Per-run cap on 'trash' moves — Sean's literal "capped at 20/cycle". */
  maxTrashPerRun: number;
  /** Per-run cap on 'quarantine' moves, and reused as the per-run cap on how
   * many expired quarantine rows the purge sweep releases in one pass —
   * both are "how much Quarantine-folder churn happens in one run", so one
   * knob covers both rather than adding a third env var for a narrower
   * distinction Sean never asked for. */
  maxQuarantinePerRun: number;
  /** Days a message sits in Quarantine before the sweep releases it to
   * Trash. Sean's spec: 14. */
  quarantineDays: number;
  /** null = every configured inbox may move mail in 'live' mode; otherwise
   * only inbox ids in this set (e.g. {'inbox-1'} for "AAC only, for now"). */
  liveInboxIds: Set<string> | null;
};

const QUARANTINE_MAILBOX_NAME = 'Quarantine';
const DEFAULT_MAX_TRASH_PER_RUN = 20;
const DEFAULT_MAX_QUARANTINE_PER_RUN = 50;
const DEFAULT_QUARANTINE_DAYS = 14;

export function parseTriageConfig(env: Record<string, string | undefined>): TriageEnvConfig {
  const modeRaw = (env.MAIL_TRIAGE_MODE ?? 'off').trim().toLowerCase();
  const mode: TriageMode = modeRaw === 'live' ? 'live' : modeRaw === 'dry_run' ? 'dry_run' : 'off';

  const parsedMaxTrash = Number(env.MAIL_TRIAGE_MAX_MOVES ?? DEFAULT_MAX_TRASH_PER_RUN);
  const maxTrashPerRun = Number.isFinite(parsedMaxTrash) && parsedMaxTrash >= 0 ? Math.floor(parsedMaxTrash) : DEFAULT_MAX_TRASH_PER_RUN;

  const parsedMaxQuarantine = Number(env.MAIL_TRIAGE_MAX_QUARANTINE ?? DEFAULT_MAX_QUARANTINE_PER_RUN);
  const maxQuarantinePerRun =
    Number.isFinite(parsedMaxQuarantine) && parsedMaxQuarantine >= 0 ? Math.floor(parsedMaxQuarantine) : DEFAULT_MAX_QUARANTINE_PER_RUN;

  const parsedDays = Number(env.MAIL_TRIAGE_QUARANTINE_DAYS ?? DEFAULT_QUARANTINE_DAYS);
  const quarantineDays = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.floor(parsedDays) : DEFAULT_QUARANTINE_DAYS;

  const liveInboxesRaw = env.MAIL_TRIAGE_LIVE_INBOXES?.trim();
  const liveInboxIds = liveInboxesRaw
    ? new Set(
        liveInboxesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;
  return { mode, maxTrashPerRun, maxQuarantinePerRun, quarantineDays, liveInboxIds };
}

export type TriageMessageOutcome = {
  uid: number;
  fromAddress: string;
  subject: string;
  verdict: MailTriageVerdict;
  confidence: number;
  reason: string;
  moved: boolean;
  messageId: string | null;
};

export type TriageInboxResult = {
  inboxId: string;
  inboxName: string;
  scanned: number;
  trashed: number;
  quarantined: number;
  protectedCount: number;
  /** Quarantine rows the expiry sweep resolved this run (released to Trash,
   * or found already gone) — 0 whenever nothing was due yet. */
  purged: number;
  /** Set when the inbox is in 'live' scope but no \Trash-flagged mailbox was
   * found — we never guess a folder name, so 'trash' verdicts are still
   * classified and logged but left in place, surfaced honestly here rather
   * than silently no-op'd. */
  trashUnavailable: boolean;
  /** Same idea for Quarantine: set only if creating/finding the folder
   * itself failed (a real IMAP error), not merely "didn't need it yet". */
  quarantineUnavailable: boolean;
  error?: string;
  outcomes: TriageMessageOutcome[];
};

/** Real MIME attachment check: walks bodyStructure looking for any part with
 * an 'attachment' disposition. Deliberately conservative — a message with
 * any attachment is excluded from junk consideration entirely (see
 * lib/mail-triage.ts). */
export function hasAttachmentPart(structure: unknown): boolean {
  if (!structure || typeof structure !== 'object') return false;
  const node = structure as { disposition?: string | null; childNodes?: unknown[] };
  if (node.disposition && String(node.disposition).toLowerCase() === 'attachment') return true;
  if (Array.isArray(node.childNodes)) {
    return node.childNodes.some(hasAttachmentPart);
  }
  return false;
}

async function findTrashMailbox(client: ImapFlow): Promise<string | null> {
  const list = await client.list();
  const trash = list.find((m) => m.specialUse === '\\Trash');
  return trash?.path ?? null;
}

/** Finds the "Quarantine" mailbox, creating it on first use. mailboxCreate
 * reports `created: false` (not an error) when it already exists, so this
 * is safe to call every run without a separate existence check; the
 * try/catch below only guards against a server that genuinely throws on a
 * duplicate CREATE instead of following that contract. */
async function findOrCreateQuarantineMailbox(client: ImapFlow): Promise<string | null> {
  try {
    const info = await client.mailboxCreate(QUARANTINE_MAILBOX_NAME);
    return info.path;
  } catch {
    try {
      const list = await client.list();
      const found = list.find((m) => m.path === QUARANTINE_MAILBOX_NAME || m.name === QUARANTINE_MAILBOX_NAME);
      return found?.path ?? null;
    } catch {
      return null;
    }
  }
}

/** Releases expired Quarantine rows to Trash. Matched by Message-ID, never
 * UID (a UID is only meaningful within the mailbox that issued it — the
 * same message gets a different UID the moment it lands in a new folder).
 * A row with no recorded Message-ID, or one whose message can no longer be
 * found in Quarantine (Sean rescued it, or something else moved/deleted
 * it), is still marked resolved rather than retried forever — the sweep's
 * job is closing the loop honestly, not guaranteeing a move happened. */
async function purgeExpiredQuarantine(
  client: ImapFlow,
  quarantinePath: string,
  trashPath: string | null,
  dueRows: MailTriageLog[],
  nowIso: string,
): Promise<{ released: number; alreadyGone: number; skippedNoTrash: number; skippedNoMessageId: number }> {
  const outcome = { released: 0, alreadyGone: 0, skippedNoTrash: 0, skippedNoMessageId: 0 };
  if (dueRows.length === 0) return outcome;

  const db = getDb();
  const lock = await client.getMailboxLock(quarantinePath);
  try {
    for (const row of dueRows) {
      if (!row.messageId) {
        // Nothing reliable to search on — leave pending rather than guess
        // at a UID that's almost certainly stale by now.
        outcome.skippedNoMessageId++;
        continue;
      }
      if (!trashPath) {
        // Can't release anywhere real — leave pending until Trash exists.
        outcome.skippedNoTrash++;
        continue;
      }
      let uids: number[] = [];
      try {
        const found = await client.search({ header: { 'message-id': row.messageId } }, { uid: true });
        uids = found === false ? [] : found;
      } catch {
        continue; // search failed — retry next sweep, don't mark resolved
      }
      if (uids.length === 0) {
        db.mailTriageLog.markPurged(row.id, nowIso);
        outcome.alreadyGone++;
        continue;
      }
      let moveFailed = false;
      for (const uid of uids) {
        try {
          await client.messageMove(uid, trashPath, { uid: true });
        } catch {
          moveFailed = true;
        }
      }
      if (!moveFailed) {
        db.mailTriageLog.markPurged(row.id, nowIso);
        outcome.released++;
      }
      // A failed move leaves the row unmarked — retried on the next sweep.
    }
  } finally {
    lock.release();
  }
  return outcome;
}

export async function triageInbox(
  config: InboxConfig,
  triageCfg: TriageEnvConfig,
  knownSenders: ReadonlySet<string>,
  ImapFlowCtor: typeof ImapFlow,
): Promise<TriageInboxResult> {
  const result: TriageInboxResult = {
    inboxId: config.id,
    inboxName: config.name,
    scanned: 0,
    trashed: 0,
    quarantined: 0,
    protectedCount: 0,
    purged: 0,
    trashUnavailable: false,
    quarantineUnavailable: false,
    outcomes: [],
  };
  if (triageCfg.mode === 'off') return result;

  const liveAllowed =
    triageCfg.mode === 'live' && (triageCfg.liveInboxIds === null || triageCfg.liveInboxIds.has(config.id));

  const client = new ImapFlowCtor(imapClientOptions(config));
  try {
    await client.connect();

    let trashPath: string | null = null;
    let quarantinePath: string | null = null;
    if (liveAllowed) {
      trashPath = await findTrashMailbox(client);
      if (!trashPath) result.trashUnavailable = true;
      quarantinePath = await findOrCreateQuarantineMailbox(client);
      if (!quarantinePath) result.quarantineUnavailable = true;
    }

    const lock = await client.getMailboxLock('INBOX');
    try {
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids = searchResult === false ? [] : searchResult;
      let trashMoves = 0;
      let quarantineMoves = 0;
      for (const uid of uids) {
        const msg = await client.fetchOne(
          uid,
          { envelope: true, flags: true, bodyStructure: true, headers: ['list-unsubscribe', 'x-spam-flag'] },
          { uid: true },
        );
        if (!msg) continue;
        result.scanned++;

        const from = msg.envelope?.from?.[0];
        const fromAddress = from?.address ?? 'unknown';
        const subject = msg.envelope?.subject ?? '(no subject)';
        const headerText = msg.headers ? msg.headers.toString('utf8').toLowerCase() : '';
        const messageId = msg.envelope?.messageId ?? null;

        const classified = classifyForTriage({
          fromAddress,
          fromName: from?.name,
          subject,
          hasListUnsubscribe: headerText.includes('list-unsubscribe:'),
          hostSpamFlag: /x-spam-flag:\s*yes/.test(headerText),
          hasAttachments: hasAttachmentPart(msg.bodyStructure),
          flagged: msg.flags?.has('\\Flagged') ?? false,
          isThreadReply: Boolean(msg.envelope?.inReplyTo),
          knownSenders,
        });

        let moved = false;
        if (classified.verdict === 'trash') {
          result.trashed++;
          if (liveAllowed && trashPath && trashMoves < triageCfg.maxTrashPerRun) {
            try {
              await client.messageMove(uid, trashPath, { uid: true });
              moved = true;
              trashMoves++;
            } catch {
              // Left in place; the log entry below still records the verdict honestly.
            }
          }
        } else if (classified.verdict === 'quarantine') {
          result.quarantined++;
          if (liveAllowed && quarantinePath && quarantineMoves < triageCfg.maxQuarantinePerRun) {
            try {
              await client.messageMove(uid, quarantinePath, { uid: true });
              moved = true;
              quarantineMoves++;
            } catch {
              // Left in place; retried next run.
            }
          }
        } else {
          result.protectedCount++;
        }

        result.outcomes.push({
          uid,
          fromAddress,
          subject: subject.slice(0, 200),
          verdict: classified.verdict,
          confidence: classified.confidence,
          reason: classified.reason,
          moved,
          messageId,
        });
      }
    } finally {
      lock.release();
    }

    // Quarantine-expiry sweep — live mode only, only once Quarantine itself
    // is reachable, and only ever releasing to a real Trash folder.
    if (liveAllowed && quarantinePath) {
      const cutoffIso = new Date(Date.now() - triageCfg.quarantineDays * 24 * 60 * 60 * 1000).toISOString();
      const due = getDb().mailTriageLog.dueForPurge(config.id, cutoffIso, triageCfg.maxQuarantinePerRun);
      const sweep = await purgeExpiredQuarantine(client, quarantinePath, trashPath, due, new Date().toISOString());
      result.purged = sweep.released + sweep.alreadyGone;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    await client.logout().catch(() => {});
  }
  return result;
}

/** Every known contact email across both businesses, lowercased — the real
 * exclusion source for "sender is a known contact" (see lib/mail-triage.ts).
 * Honest-empty on any DB failure rather than throwing: a triage pass that
 * can't reach the CRM should degrade to "no known senders", never crash the
 * whole inbox scan over an unrelated table. */
function knownContactSenders(): ReadonlySet<string> {
  try {
    const journeys = getDb().funnel.journeys();
    return new Set(
      journeys.map((j) => j.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e)),
    );
  } catch {
    return new Set();
  }
}

export type TriageRunSummary = {
  config: TriageEnvConfig;
  results: TriageInboxResult[];
};

export async function triageAllInboxes(
  env: Record<string, string | undefined> = process.env,
): Promise<TriageRunSummary> {
  const triageCfg = parseTriageConfig(env);
  const inboxes = parseInboxConfigs(env);
  if (triageCfg.mode === 'off' || inboxes.length === 0) {
    return { config: triageCfg, results: [] };
  }

  const { ImapFlow: RealImapFlow } = await import('imapflow');
  const knownSenders = knownContactSenders();
  const results = await Promise.all(
    inboxes.map((cfg) => triageInbox(cfg, triageCfg, knownSenders, RealImapFlow)),
  );

  const db = getDb();
  const now = new Date().toISOString();
  for (const r of results) {
    for (const outcome of r.outcomes) {
      db.mailTriageLog.insert({
        id: `${r.inboxId}-${outcome.uid}-${now}`,
        inboxId: r.inboxId,
        inboxName: r.inboxName,
        uid: outcome.uid,
        fromAddress: outcome.fromAddress,
        subject: outcome.subject,
        verdict: outcome.verdict,
        confidence: outcome.confidence,
        reason: outcome.reason,
        moved: outcome.moved,
        mode: triageCfg.mode,
        messageId: outcome.messageId,
        purgedAt: null,
        createdAt: now,
      });
    }
  }

  return { config: triageCfg, results };
}
