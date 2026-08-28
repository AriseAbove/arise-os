import { describe, expect, test } from 'vitest';
import { parseTriageConfig, triageInbox, hasAttachmentPart } from '@/lib/connectors/email-triage';
import type { InboxConfig } from '@/lib/connectors/email';

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
  envelope: { from: [{ address: string; name?: string }]; subject: string; inReplyTo?: string | null };
  flags: Set<string>;
  bodyStructure?: { disposition?: string | null; childNodes?: unknown[] };
  headers: Buffer;
};

/** Minimal stand-in for ImapFlow covering exactly the surface triageInbox
 * calls: connect, getMailboxLock, list (for \Trash discovery), search,
 * fetchOne, messageMove, logout. Movements are recorded on `moved` so tests
 * can assert exactly which uids were actually moved without a real server. */
function makeFakeImapFlow(opts: {
  messages: FakeMessage[];
  trashPath?: string | null;
  moveShouldFail?: (uid: number) => boolean;
}) {
  const moved: number[] = [];
  class FakeImapFlow {
    async connect() {}
    async getMailboxLock() {
      return { release() {} };
    }
    async list() {
      return opts.trashPath === undefined
        ? [{ path: 'Trash', specialUse: '\\Trash' }]
        : opts.trashPath === null
          ? []
          : [{ path: opts.trashPath, specialUse: '\\Trash' }];
    }
    async search() {
      return opts.messages.map((m) => m.uid);
    }
    async fetchOne(uid: number) {
      return opts.messages.find((m) => m.uid === uid) ?? null;
    }
    async messageMove(uid: number) {
      if (opts.moveShouldFail?.(uid)) throw new Error('move failed');
      moved.push(uid);
    }
    async logout() {}
  }
  return { Ctor: FakeImapFlow as unknown as typeof import('imapflow').ImapFlow, moved };
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
  test('defaults to off with a 20-move cap and no live-inbox restriction', () => {
    const cfg = parseTriageConfig({});
    expect(cfg.mode).toBe('off');
    expect(cfg.maxMovesPerRun).toBe(20);
    expect(cfg.liveInboxIds).toBeNull();
  });

  test('parses dry_run, live, a custom cap, and a scoped inbox list', () => {
    const cfg = parseTriageConfig({
      MAIL_TRIAGE_MODE: 'live',
      MAIL_TRIAGE_MAX_MOVES: '5',
      MAIL_TRIAGE_LIVE_INBOXES: 'inbox-1, inbox-2',
    });
    expect(cfg.mode).toBe('live');
    expect(cfg.maxMovesPerRun).toBe(5);
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

describe('triageInbox — mode gating', () => {
  test("mode 'off' scans nothing and never touches the network", async () => {
    const { Ctor } = makeFakeImapFlow({ messages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>') })] });
    const result = await triageInbox(config, { mode: 'off', maxMovesPerRun: 20, liveInboxIds: null }, new Set(), Ctor);
    expect(result.scanned).toBe(0);
    expect(result.outcomes).toHaveLength(0);
  });

  test('dry_run classifies and logs every message but calls messageMove on nothing', async () => {
    const { Ctor, moved } = makeFakeImapFlow({
      messages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>') }), msg(2)],
    });
    const result = await triageInbox(
      config,
      { mode: 'dry_run', maxMovesPerRun: 20, liveInboxIds: null },
      new Set(),
      Ctor,
    );
    expect(result.scanned).toBe(2);
    expect(result.junk).toBe(1);
    expect(result.moved).toBe(0);
    expect(moved).toHaveLength(0);
    expect(result.outcomes.find((o) => o.uid === 1)?.verdict).toBe('junk');
    expect(result.outcomes.find((o) => o.uid === 1)?.moved).toBe(false);
  });

  test('live mode actually moves confirmed junk to the real Trash folder', async () => {
    const { Ctor, moved } = makeFakeImapFlow({
      messages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>') }), msg(2)],
      trashPath: '[Gmail]/Trash',
    });
    const result = await triageInbox(
      config,
      { mode: 'live', maxMovesPerRun: 20, liveInboxIds: null },
      new Set(),
      Ctor,
    );
    expect(result.moved).toBe(1);
    expect(moved).toEqual([1]);
    expect(result.outcomes.find((o) => o.uid === 2)?.moved).toBe(false);
  });

  test('live mode never moves anything for an inbox not in the scoped live list', async () => {
    const { Ctor, moved } = makeFakeImapFlow({
      messages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>') })],
      trashPath: '[Gmail]/Trash',
    });
    const result = await triageInbox(
      config,
      { mode: 'live', maxMovesPerRun: 20, liveInboxIds: new Set(['inbox-2']) },
      new Set(),
      Ctor,
    );
    expect(result.junk).toBe(1);
    expect(result.moved).toBe(0);
    expect(moved).toHaveLength(0);
  });

  test('the per-run cap stops moving after maxMovesPerRun, leaving the rest classified but untouched', async () => {
    const messages = [1, 2, 3].map((n) => msg(n, { headers: Buffer.from('list-unsubscribe: <x>') }));
    const { Ctor, moved } = makeFakeImapFlow({ messages, trashPath: '[Gmail]/Trash' });
    const result = await triageInbox(config, { mode: 'live', maxMovesPerRun: 2, liveInboxIds: null }, new Set(), Ctor);
    expect(result.junk).toBe(3);
    expect(result.moved).toBe(2);
    expect(moved).toHaveLength(2);
  });

  test('no \\Trash-flagged mailbox found: junk is classified honestly but nothing moves, and trashUnavailable is set', async () => {
    const { Ctor, moved } = makeFakeImapFlow({
      messages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>') })],
      trashPath: null,
    });
    const result = await triageInbox(config, { mode: 'live', maxMovesPerRun: 20, liveInboxIds: null }, new Set(), Ctor);
    expect(result.trashUnavailable).toBe(true);
    expect(result.junk).toBe(1);
    expect(result.moved).toBe(0);
    expect(moved).toHaveLength(0);
  });

  test('exclusions still win inside a real run: a known contact sending bulk-looking mail is not_junk and never moved', async () => {
    const { Ctor, moved } = makeFakeImapFlow({
      messages: [msg(1, { headers: Buffer.from('list-unsubscribe: <x>'), envelope: { from: [{ address: 'lead@known.com' }], subject: 'Newsletter', inReplyTo: null } })],
      trashPath: '[Gmail]/Trash',
    });
    const result = await triageInbox(
      config,
      { mode: 'live', maxMovesPerRun: 20, liveInboxIds: null },
      new Set(['lead@known.com']),
      Ctor,
    );
    expect(result.notJunk).toBe(1);
    expect(result.moved).toBe(0);
    expect(moved).toHaveLength(0);
  });

  test('a genuinely ambiguous message is counted as review, not junk, and never moved', async () => {
    const { Ctor, moved } = makeFakeImapFlow({ messages: [msg(1)] });
    const result = await triageInbox(config, { mode: 'live', maxMovesPerRun: 20, liveInboxIds: null }, new Set(), Ctor);
    expect(result.review).toBe(1);
    expect(result.junk).toBe(0);
    expect(moved).toHaveLength(0);
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
      { mode: 'dry_run', maxMovesPerRun: 20, liveInboxIds: null },
      new Set(),
      FailingImapFlow as unknown as typeof import('imapflow').ImapFlow,
    );
    expect(result.error).toMatch(/ECONNREFUSED/);
    expect(result.scanned).toBe(0);
  });
});
