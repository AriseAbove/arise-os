import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { parseTriageConfig, triageInbox, hasAttachmentPart } from '@/lib/connectors/email-triage';
import type { InboxConfig } from '@/lib/connectors/email';
import { getDb, resetDbForTests } from '@/lib/data';

const config: InboxConfig = {
  id: 'inbox-1',
  name: 'AAC',
  host: 'imap.gmail.com',
  port: 993,
  user: 'aac@example.com',
  pass: 'app-pass',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
};

type FakeMessage = {
  uid: number;
  envelope: { from: [{ address: string; name?: string }]; subject: string; inReplyTo?: string | null; messageId?: string };
  flags: Set<string>;
  bodyStructure?: { disposition?: string | null; childNodes?: unknown[] };
  headers: Buffer;
};

/** Minimal stand-in for ImapFlow covering exactly the surface triageInbox
 * calls: connect, getMailboxLock, list/mailboxCreate (Trash + Quarantine
 * discovery), search (both the unseen-inbox scan and the purge sweep's
 * Message-ID lookup), fetchOne, messageMove, logout. Every move is recorded
 * on `moves` (with destination) so tests can assert exactly what happened
 * without a real server. */
function makeFakeImapFlow(opts: {
  inboxMessages: FakeMessage[];
  quarantineMessages?: FakeMessage[];
  /** undefined = a real 'Trash' mailbox exists; null = none found. */
  trashPath?: string | null;
  quarantineCreateFails?: boolean;
  moveShouldFail?: (uid: number) => boolean;
}) {
  const moves: { uid: number; to: string }[] = [];
  class FakeImapFlow {
    async connect() {}
    async getMailboxLock(_path: string) {
      return { release() {} };
    }
    async list() {
      return opts.trashPath === null ? [] : [{ path: opts.trashPath ?? 'Trash', specialUse: '\\Trash', name: 'Trash' }];
    }
    async mailboxCreate(path: string) {
      if (opts.quarantineCreateFails) throw new Error('CREATE not permitted');
      return { path, created: true };
    }
    async search(criteria: any) {
      const headerMessageId = criteria?.header?.['message-id'];
      if (headerMessageId) {
        return (opts.quarantineMessages ?? []).filter((m) => m.envelope.messageId === headerMessageId).map((m) => m.uid);
      }
      return opts.inboxMessages.map((m) => m.uid);
    }
    async fetchOne(uid: number) {
      return opts.inboxMessages.find((m) => m.uid === uid) ?? null;
    }
    async messageMove(uid: number, to: string) {
      if (opts.moveShouldFail?.(uid)) throw new Error('move failed');
      moves.push({ uid, to });
    }
    async logout() {}
  }
  return { Ctor: FakeImapFlow as unknown as typeof import('imapflow').ImapFlow, moves };
}

function msg(uid: number, overrides: Partial<FakeMessage> = {}): FakeMessage {
  return {
    uid,
    envelope: { from: [{ address: `sender${uid}@example.com` }], subject: 'Hello', inReplyTo: null },
    flags: new Set(),
    bodyStructure: {},
    headers: Buffer.from(''),
    ...overrides,
  };
}

describe('parseTriageConfig', () => {
  test('defaults to off, 20-move trash cap, 50-move quarantine cap, 14-day expiry, no live-inbox restriction', () => {
    const cfg = parseTriageConfig({});
    expect(cfg.mode).toBe('off');
    expect(cfg.maxTrashPerRun).toBe(20);
    expect(cfg.maxQuarantinePerRun).toBe(50);
    expect(cfg.quarantineDays).toBe(14);
    expect(cfg.liveInboxIds).toBeNull();
  });

  test('parses dry_run, live, custom caps/days, and a scoped inbox list', () => {
    const cfg = parseTriageConfig({
      MAIL_TRIAGE_MODE: 'live',
      MAIL_TRIAGE_MAX_MOVES: '5',
      MAIL_TRIAGE_MAX_QUARANTINE: '10',
      MAIL_TRIAGE_QUARANTINE_DAYS: '7',
      MAIL_TRIAGE_LIVE_INBOXES: 'inbox-1, inbox-2',
    });
    expect(cfg.mode).toBe('live');
    expect(cfg.maxTrashPerRun).toBe(5);
    expect(cfg.maxQuarantinePerRun).toBe(10);
    expect(cfg.quarantineDays).toBe(7);
    expect(cfg.liveInboxIds).toEqual(new Set(['inbox-1', 'inbox-2']));
  });

  test('an unrecognized mode string falls back to off, never live', () => {
    expect(parseTriageConfig({ MAIL_TRIAGE_MODE: 'yes please' }).mode).toBe('off');
  });
});

describe('hasAttachmentPart', () => {
  test('finds an attachment nested inside a multipart structure', () => {
    const structure = { childNodes: [{ disposition: 'inline' }, { disposition: 'attachment' }] };
    expect(hasAttachmentPart(structure)).toBe(true);
  });

  test('a plain-text structure with no attachment part is false', () => {
    expect(hasAttachmentPart({ disposition: 'inline' })).toBe(false);
  });
});

describe('triageInbox', () => {
  const prevDb = process.env.FOUNDER_OS_DB;
  beforeEach(() => {
    // 'live' mode now touches the DB directly (the quarantine-expiry sweep
    // queries mail_triage_log) — hermetic in-memory DB per the repo's
    // standard test pattern (see tests/push-relay-route.test.ts). The
    // getDb() singleton persists across tests within this file regardless of
    // the env var, so resetDbForTests() forces a genuinely fresh, empty
    // :memory: DB for every single test (needed by the quarantine-expiry
    // sweep tests below, which insert real mail_triage_log rows and would
    // otherwise see rows left over from a previous test).
    process.env.FOUNDER_OS_DB = ':memory:';
    resetDbForTests();
  });
  afterEach(() => {
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
  });

  const cfg = (overrides: Partial<import('@/lib/connectors/email-triage').TriageEnvConfig> = {}) => ({
    mode: 'live' as const,
    maxTrashPerRun: 20,
    maxQuarantinePerRun: 50,
    quarantineDays: 14,
    liveInboxIds: null,
    ...overrides,
  });

  test("mode 'off' scans nothing and never touches the network", async () => {
    const { Ctor } = makeFakeImapFlow({ inboxMessages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>') })] });
    const result = await triageInbox(config, cfg({ mode: 'off' }), new Set(), Ctor);
    expect(result.scanned).toBe(0);
    expect(result.outcomes).toHaveLength(0);
  });

  test('dry_run classifies and logs every message but calls messageMove on nothing', async () => {
    const { Ctor, moves } = makeFakeImapFlow({
      inboxMessages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>') }), msg(2)],
    });
    const result = await triageInbox(config, cfg({ mode: 'dry_run' }), new Set(), Ctor);
    expect(result.scanned).toBe(2);
    expect(result.quarantined).toBe(1);
    expect(result.protectedCount).toBe(1);
    expect(moves).toHaveLength(0);
    expect(result.outcomes.find((o) => o.uid === 1)?.verdict).toBe('quarantine');
    expect(result.outcomes.find((o) => o.uid === 1)?.moved).toBe(false);
  });

  test('live mode moves >=95% confidence mail straight to Trash', async () => {
    const { Ctor, moves } = makeFakeImapFlow({
      inboxMessages: [msg(1, { headers: Buffer.from('x-spam-flag: YES') }), msg(2)],
      trashPath: '[Gmail]/Trash',
    });
    const result = await triageInbox(config, cfg(), new Set(), Ctor);
    expect(result.trashed).toBe(1);
    expect(moves).toEqual([{ uid: 1, to: '[Gmail]/Trash' }]);
    expect(result.outcomes.find((o) => o.uid === 1)?.moved).toBe(true);
    expect(result.outcomes.find((o) => o.uid === 2)?.moved).toBe(false);
  });

  test('live mode moves 60-94% confidence mail to a Quarantine folder, not Trash', async () => {
    const { Ctor, moves } = makeFakeImapFlow({
      inboxMessages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>') })],
      trashPath: '[Gmail]/Trash',
    });
    const result = await triageInbox(config, cfg(), new Set(), Ctor);
    expect(result.quarantined).toBe(1);
    expect(moves).toEqual([{ uid: 1, to: 'Quarantine' }]);
  });

  test('live mode never moves anything for an inbox not in the scoped live list', async () => {
    const { Ctor, moves } = makeFakeImapFlow({
      inboxMessages: [msg(1, { headers: Buffer.from('x-spam-flag: YES') })],
      trashPath: '[Gmail]/Trash',
    });
    const result = await triageInbox(config, cfg({ liveInboxIds: new Set(['inbox-2']) }), new Set(), Ctor);
    expect(result.trashed).toBe(1);
    expect(moves).toHaveLength(0);
  });

  test('the trash cap stops moving after maxTrashPerRun, leaving the rest classified but untouched', async () => {
    const messages = [1, 2, 3].map((n) => msg(n, { headers: Buffer.from('x-spam-flag: YES') }));
    const { Ctor, moves } = makeFakeImapFlow({ inboxMessages: messages, trashPath: '[Gmail]/Trash' });
    const result = await triageInbox(config, cfg({ maxTrashPerRun: 2 }), new Set(), Ctor);
    expect(result.trashed).toBe(3);
    expect(moves).toHaveLength(2);
  });

  test('the quarantine cap stops moving after maxQuarantinePerRun', async () => {
    const messages = [1, 2, 3].map((n) => msg(n, { headers: Buffer.from('list-unsubscribe: <x>') }));
    const { Ctor, moves } = makeFakeImapFlow({ inboxMessages: messages, trashPath: '[Gmail]/Trash' });
    const result = await triageInbox(config, cfg({ maxQuarantinePerRun: 1 }), new Set(), Ctor);
    expect(result.quarantined).toBe(3);
    expect(moves).toHaveLength(1);
  });

  test('no \\Trash-flagged mailbox found: trash verdicts are classified honestly but nothing moves, trashUnavailable is set', async () => {
    const { Ctor, moves } = makeFakeImapFlow({
      inboxMessages: [msg(1, { headers: Buffer.from('x-spam-flag: YES') })],
      trashPath: null,
    });
    const result = await triageInbox(config, cfg(), new Set(), Ctor);
    expect(result.trashUnavailable).toBe(true);
    expect(result.trashed).toBe(1);
    expect(moves).toHaveLength(0);
  });

  test('Quarantine folder cannot be created: quarantine verdicts are classified honestly but nothing moves, quarantineUnavailable is set', async () => {
    const { Ctor, moves } = makeFakeImapFlow({
      inboxMessages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>') })],
      trashPath: '[Gmail]/Trash',
      quarantineCreateFails: true,
    });
    const result = await triageInbox(config, cfg(), new Set(), Ctor);
    expect(result.quarantineUnavailable).toBe(true);
    expect(result.quarantined).toBe(1);
    expect(moves).toHaveLength(0);
  });

  test('fast-path safety still wins inside a real run: a known contact sending bulk-looking mail is protected and never moved', async () => {
    const { Ctor, moves } = makeFakeImapFlow({
      inboxMessages: [
        msg(1, {
          headers: Buffer.from('list-unsubscribe: <x>'),
          envelope: { from: [{ address: 'lead@known.com' }], subject: 'Newsletter', inReplyTo: null },
        }),
      ],
      trashPath: '[Gmail]/Trash',
    });
    const result = await triageInbox(config, cfg(), new Set(['lead@known.com']), Ctor);
    expect(result.protectedCount).toBe(1);
    expect(moves).toHaveLength(0);
  });

  test('a genuinely low-confidence message is protected, not trashed or quarantined, and never moved', async () => {
    const { Ctor, moves } = makeFakeImapFlow({ inboxMessages: [msg(1)], trashPath: '[Gmail]/Trash' });
    const result = await triageInbox(config, cfg(), new Set(), Ctor);
    expect(result.protectedCount).toBe(1);
    expect(result.trashed).toBe(0);
    expect(result.quarantined).toBe(0);
    expect(moves).toHaveLength(0);
  });

  test('a connection failure is reported honestly on the result, not thrown', async () => {
    class FailingImapFlow {
      async connect() {
        throw new Error('ECONNREFUSED');
      }
      async logout() {}
    }
    const result = await triageInbox(
      config,
      cfg({ mode: 'dry_run' }),
      new Set(),
      FailingImapFlow as unknown as typeof import('imapflow').ImapFlow,
    );
    expect(result.error).toMatch(/ECONNREFUSED/);
    expect(result.scanned).toBe(0);
  });

  describe('quarantine-expiry sweep', () => {
    test('releases an expired quarantine row to Trash, matched by Message-ID, and marks it purged', async () => {
      const oldIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      getDb().mailTriageLog.insert({
        id: 'row-1',
        inboxId: 'inbox-1',
        inboxName: 'AAC',
        uid: 999, // stale — the sweep must look this up by Message-ID, not this UID
        fromAddress: 'bulk@example.com',
        subject: 'Old newsletter',
        verdict: 'quarantine',
        confidence: 75,
        reason: 'bulk sender',
        moved: true,
        mode: 'live',
        messageId: '<abc123@example.com>',
        purgedAt: null,
        createdAt: oldIso,
      });

      const { Ctor, moves } = makeFakeImapFlow({
        inboxMessages: [],
        quarantineMessages: [msg(42, { envelope: { from: [{ address: 'bulk@example.com' }], subject: 'Old newsletter', messageId: '<abc123@example.com>' } })],
        trashPath: '[Gmail]/Trash',
      });
      const result = await triageInbox(config, cfg(), new Set(), Ctor);

      expect(result.purged).toBe(1);
      expect(moves).toEqual([{ uid: 42, to: '[Gmail]/Trash' }]);
      const stillDue = getDb().mailTriageLog.dueForPurge('inbox-1', new Date().toISOString(), 50);
      expect(stillDue).toHaveLength(0);
    });

    test('a row not yet past the expiry window is left alone', async () => {
      getDb().mailTriageLog.insert({
        id: 'row-fresh',
        inboxId: 'inbox-1',
        inboxName: 'AAC',
        uid: 1,
        fromAddress: 'bulk@example.com',
        subject: 'Fresh newsletter',
        verdict: 'quarantine',
        confidence: 75,
        reason: 'bulk sender',
        moved: true,
        mode: 'live',
        messageId: '<fresh@example.com>',
        purgedAt: null,
        createdAt: new Date().toISOString(), // just quarantined
      });
      const { Ctor, moves } = makeFakeImapFlow({ inboxMessages: [], trashPath: '[Gmail]/Trash' });
      const result = await triageInbox(config, cfg(), new Set(), Ctor);
      expect(result.purged).toBe(0);
      expect(moves).toHaveLength(0);
    });

    test('an expired row whose message is already gone from Quarantine is still marked resolved, honestly, with nothing to move', async () => {
      const oldIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      getDb().mailTriageLog.insert({
        id: 'row-gone',
        inboxId: 'inbox-1',
        inboxName: 'AAC',
        uid: 1,
        fromAddress: 'bulk@example.com',
        subject: 'Rescued newsletter',
        verdict: 'quarantine',
        confidence: 75,
        reason: 'bulk sender',
        moved: true,
        mode: 'live',
        messageId: '<rescued@example.com>',
        purgedAt: null,
        createdAt: oldIso,
      });
      // No matching quarantineMessages — Sean already moved/deleted it himself.
      const { Ctor, moves } = makeFakeImapFlow({ inboxMessages: [], quarantineMessages: [], trashPath: '[Gmail]/Trash' });
      const result = await triageInbox(config, cfg(), new Set(), Ctor);
      expect(result.purged).toBe(1);
      expect(moves).toHaveLength(0);
      expect(getDb().mailTriageLog.dueForPurge('inbox-1', new Date().toISOString(), 50)).toHaveLength(0);
    });

    test('an expired row with no recorded Message-ID is left pending rather than guessed at', async () => {
      const oldIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      getDb().mailTriageLog.insert({
        id: 'row-no-msgid',
        inboxId: 'inbox-1',
        inboxName: 'AAC',
        uid: 1,
        fromAddress: 'bulk@example.com',
        subject: 'No Message-ID',
        verdict: 'quarantine',
        confidence: 75,
        reason: 'bulk sender',
        moved: true,
        mode: 'live',
        messageId: null,
        purgedAt: null,
        createdAt: oldIso,
      });
      const { Ctor, moves } = makeFakeImapFlow({ inboxMessages: [], trashPath: '[Gmail]/Trash' });
      const result = await triageInbox(config, cfg(), new Set(), Ctor);
      expect(result.purged).toBe(0);
      expect(moves).toHaveLength(0);
      expect(getDb().mailTriageLog.dueForPurge('inbox-1', new Date().toISOString(), 50)).toHaveLength(1);
    });

    test('the sweep never runs in dry_run mode — nothing was ever quarantined for real, so nothing to release', async () => {
      const oldIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      getDb().mailTriageLog.insert({
        id: 'row-dry',
        inboxId: 'inbox-1',
        inboxName: 'AAC',
        uid: 1,
        fromAddress: 'bulk@example.com',
        subject: 'x',
        verdict: 'quarantine',
        confidence: 75,
        reason: 'bulk sender',
        moved: true,
        mode: 'live',
        messageId: '<x@example.com>',
        purgedAt: null,
        createdAt: oldIso,
      });
      const { Ctor, moves } = makeFakeImapFlow({
        inboxMessages: [],
        quarantineMessages: [msg(1, { envelope: { from: [{ address: 'bulk@example.com' }], subject: 'x', messageId: '<x@example.com>' } })],
      });
      const result = await triageInbox(config, cfg({ mode: 'dry_run' }), new Set(), Ctor);
      expect(result.purged).toBe(0);
      expect(moves).toHaveLength(0);
    });
  });
});
