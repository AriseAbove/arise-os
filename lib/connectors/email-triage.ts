/**
 * Gmail Worker's junk-triage runner (2026-08-28) — the IMAP-facing half of
 * the approved SOP; lib/mail-triage.ts holds the pure classifier this calls.
 *
 * Three modes, controlled entirely by env vars so a phase change never needs
 * a code change (matches Sean's approved rollout: dry-run first, then live
 * on one inbox, then expand):
 *   - 'off'     (default): does nothing. The pre-existing read-only
 *     unread-count behavior is completely unaffected by this module.
 *   - 'dry_run': scans unseen mail, classifies it, and records every verdict
 *     to mail_triage_log — but never calls messageMove. Sean reviews the log
 *     before anything real happens.
 *   - 'live':   same scan + classify, and for a 'junk' verdict actually
 *     moves the message to that inbox's real Trash folder (found via the
 *     IMAP \Trash special-use flag — never a guessed folder name) — capped
 *     at MAIL_TRIAGE_MAX_MOVES per run, and only for inboxes listed in
 *     MAIL_TRIAGE_LIVE_INBOXES (unset = every configured inbox, so scoping
 *     to just the AAC inbox first is one env var, not a deploy).
 *
 * A message this can't confidently classify is 'review', never 'junk' — see
 * lib/mail-triage.ts's own header comment for why that ordering is the
 * entire safety story.
 */
import type { ImapFlow } from 'imapflow';
import { imapClientOptions, parseInboxConfigs, type InboxConfig } from '@/lib/connectors/email';
import { classifyForTriage, type MailTriageVerdict } from '@/lib/mail-triage';
import { getDb } from '@/lib/data';

export type TriageMode = 'off' | 'dry_run' | 'live';

export type TriageEnvConfig = {
  mode: TriageMode;
  maxMovesPerRun: number;
  /** null = every configured inbox may move mail in 'live' mode; otherwise
   * only inbox ids in this set (e.g. {'inbox-1'} for "AAC only, for now"). */
  liveInboxIds: Set<string> | null;
};

export function parseTriageConfig(env: Record<string, string | undefined>): TriageEnvConfig {
  const modeRaw = (env.MAIL_TRIAGE_MODE ?? 'off').trim().toLowerCase();
  const mode: TriageMode = modeRaw === 'live' ? 'live' : modeRaw === 'dry_run' ? 'dry_run' : 'off';
  const parsedMax = Number(env.MAIL_TRIAGE_MAX_MOVES ?? 20);
  const maxMovesPerRun = Number.isFinite(parsedMax) && parsedMax >= 0 ? Math.floor(parsedMax) : 20;
  const liveInboxesRaw = env.MAIL_TRIAGE_LIVE_INBOXES?.trim();
  const liveInboxIds = liveInboxesRaw
    ? new Set(
        liveInboxesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;
  return { mode, maxMovesPerRun, liveInboxIds };
}

export type TriageMessageOutcome = {
  uid: number;
  fromAddress: string;
  subject: string;
  verdict: MailTriageVerdict;
  reason: string;
  moved: boolean;
};

export type TriageInboxResult = {
  inboxId: string;
  inboxName: string;
  scanned: number;
  junk: number;
  moved: number;
  review: number;
  notJunk: number;
  /** Set when the inbox is in 'live' scope but no \Trash-flagged mailbox was
   * found — we never guess a folder name, so junk is classified but left in
   * place and this is surfaced honestly rather than silently no-op'd. */
  trashUnavailable: boolean;
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
    junk: 0,
    moved: 0,
    review: 0,
    notJunk: 0,
    trashUnavailable: false,
    outcomes: [],
  };
  if (triageCfg.mode === 'off') return result;

  const liveAllowed =
    triageCfg.mode === 'live' && (triageCfg.liveInboxIds === null || triageCfg.liveInboxIds.has(config.id));

  const client = new ImapFlowCtor(imapClientOptions(config));
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      let trashPath: string | null = null;
      if (liveAllowed) {
        trashPath = await findTrashMailbox(client);
        if (!trashPath) result.trashUnavailable = true;
      }

      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids = searchResult === false ? [] : searchResult;
      let moves = 0;
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
        if (classified.verdict === 'junk') {
          result.junk++;
          if (liveAllowed && trashPath && moves < triageCfg.maxMovesPerRun) {
            try {
              await client.messageMove(uid, trashPath, { uid: true });
              moved = true;
              moves++;
              result.moved++;
            } catch {
              // Left in place; the log entry below still records the verdict
              // honestly even though the move itself failed.
            }
          }
        } else if (classified.verdict === 'review') {
          result.review++;
        } else {
          result.notJunk++;
        }

        result.outcomes.push({
          uid,
          fromAddress,
          subject: subject.slice(0, 200),
          verdict: classified.verdict,
          reason: classified.reason,
          moved,
        });
      }
    } finally {
      lock.release();
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
        reason: outcome.reason,
        moved: outcome.moved,
        mode: triageCfg.mode,
        createdAt: now,
      });
    }
  }

  return { config: triageCfg, results };
}
