import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import {
  gatherSignals,
  briefingText,
  newHighSeveritySignals,
  markNotified,
  sendNtfyPush,
  describeFetchError,
  type Signal,
} from '@/lib/chief-of-staff';
import { chiefOfStaffRunWith } from '@/lib/agents/real';
import type { FunnelContact, FunnelTouch } from '@/lib/schemas';

function seedJourney(db: FounderDb, overrides: Partial<FunnelContact> = {}, touchAt = '2026-08-10'): void {
  const contact: FunnelContact = {
    id: overrides.id ?? 'c-1',
    name: overrides.name ?? 'Test Lead',
    business: 'aac',
    status: overrides.status ?? 'estimate_sent',
    product: 'Kitchen remodel',
    amountUsd: 25000,
    costUsd: null,
    relationship: 'warm',
    likelihood: overrides.likelihood ?? 80,
    url: null,
    email: null,
    phone: null,
    person: null,
    company: null,
    role: null,
    linkedin: null,
    createdAt: '2026-08-01',
    ...overrides,
  };
  db.funnel.insertContact(contact);
  const touch: FunnelTouch = {
    id: `${contact.id}-t1`,
    contactId: contact.id,
    seq: 1,
    stage: contact.status,
    channel: 'call',
    label: 'touch',
    source: 'manual',
    at: touchAt,
    durationSeconds: null,
  };
  db.funnel.insertTouch(touch);
}

describe('gatherSignals', () => {
  test('a hot, recently-touched lead becomes a high-severity push signal', async () => {
    const db = openDb(':memory:');
    seedJourney(db, { id: 'hot-1', likelihood: 85 }, '2026-08-13');
    const signals = await gatherSignals(db, {}, new Date('2026-08-14T00:00:00Z'));
    expect(signals.some((s) => s.category === 'lead' && s.severity === 'high' && s.id === 'lead-push-hot-1')).toBe(true);
    db.close();
  });

  test('no leads, no QuickBooks, no comms configured — comes back empty, not throwing', async () => {
    const db = openDb(':memory:');
    const signals = await gatherSignals(db, {}, new Date('2026-08-14T00:00:00Z'));
    expect(signals).toEqual([]);
    db.close();
  });

  test('a won journey never becomes a signal', async () => {
    const db = openDb(':memory:');
    seedJourney(db, { id: 'won-1', status: 'contract_signed', likelihood: 95 }, '2026-08-13');
    const signals = await gatherSignals(db, {}, new Date('2026-08-14T00:00:00Z'));
    expect(signals.some((s) => s.id.includes('won-1'))).toBe(false);
    db.close();
  });
});

describe('briefingText (deterministic, no-AI fallback)', () => {
  test('summarizes counts by category and severity', () => {
    const signals: Signal[] = [
      { id: 'a', category: 'lead', severity: 'high', summary: 'x' },
      { id: 'b', category: 'lead', severity: 'high', summary: 'y' },
      { id: 'c', category: 'invoice', severity: 'high', summary: 'z' },
      { id: 'd', category: 'comms', severity: 'medium', summary: 'w' },
    ];
    const text = briefingText(signals);
    expect(text).toContain('2 hot lead');
    expect(text).toContain('1 overdue invoice');
    expect(text).toContain('1 work email');
  });

  test('nothing outstanding says so honestly', () => {
    expect(briefingText([])).toBe('Nothing needs your attention right now.');
  });
});

describe('newHighSeveritySignals / markNotified (dedupe across runs)', () => {
  test('first run treats every high-severity signal as new', () => {
    const db = openDb(':memory:');
    const signals: Signal[] = [{ id: 'lead-push-1', category: 'lead', severity: 'high', summary: 'x' }];
    expect(newHighSeveritySignals(db, signals)).toEqual(signals);
    db.close();
  });

  test('a signal already notified does not fire again on the next run', () => {
    const db = openDb(':memory:');
    const signals: Signal[] = [{ id: 'lead-push-1', category: 'lead', severity: 'high', summary: 'x' }];
    markNotified(db, signals);
    expect(newHighSeveritySignals(db, signals)).toEqual([]);
    db.close();
  });

  test('a genuinely new signal alongside an already-known one only reports the new one', () => {
    const db = openDb(':memory:');
    const known: Signal = { id: 'lead-push-1', category: 'lead', severity: 'high', summary: 'x' };
    markNotified(db, [known]);
    const fresh: Signal = { id: 'invoice-9', category: 'invoice', severity: 'high', summary: 'y' };
    expect(newHighSeveritySignals(db, [known, fresh])).toEqual([fresh]);
    db.close();
  });

  test('medium-severity signals never trigger a push, even when new', () => {
    const db = openDb(':memory:');
    const signals: Signal[] = [{ id: 'lead-save-1', category: 'lead', severity: 'medium', summary: 'x' }];
    expect(newHighSeveritySignals(db, signals)).toEqual([]);
    db.close();
  });
});

describe('sendNtfyPush', () => {
  test('honest no-op when NTFY_TOPIC is not set', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 200 });
    };
    const result = await sendNtfyPush({}, 'Title', 'body', fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ sent: false, reason: 'NTFY_TOPIC not set' });
    expect(calls).toEqual([]);
  });

  test('posts to the configured ntfy topic with title + body', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 200 });
    };
    const result = await sendNtfyPush(
      { NTFY_TOPIC: 'aac-cos-abc123' },
      'Chief of Staff',
      'Hot lead ready to push',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ sent: true, status: 200 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://ntfy.sh/aac-cos-abc123');
    expect((calls[0].init.headers as Record<string, string>).Title).toBe('Chief of Staff');
    expect(calls[0].init.body).toBe('Hot lead ready to push');
  });

  test('NTFY_URL overrides the default host (self-hosted ntfy)', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 200 });
    };
    await sendNtfyPush(
      { NTFY_TOPIC: 'aac-cos', NTFY_URL: 'https://ntfy.example.com' },
      'T',
      'B',
      fetchImpl as unknown as typeof fetch,
    );
    expect(calls[0]).toBe('https://ntfy.example.com/aac-cos');
  });

  test('reports honestly when the push itself fails', async () => {
    const fetchImpl = async () => new Response(null, { status: 503 });
    const result = await sendNtfyPush({ NTFY_TOPIC: 'x' }, 'T', 'B', fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ sent: false, status: 503 });
  });

  test('URL-encodes the topic so a stray character in NTFY_TOPIC cannot break the request path', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 200 });
    };
    await sendNtfyPush({ NTFY_TOPIC: 'aac cos/weird' }, 'T', 'B', fetchImpl as unknown as typeof fetch);
    expect(calls[0]).toBe('https://ntfy.sh/aac%20cos%2Fweird');
  });

  test('attaches a timeout signal so a hung connection fails fast instead of stalling the whole cron run', async () => {
    let sawSignal: AbortSignal | undefined;
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sawSignal = init.signal as AbortSignal;
      return new Response(null, { status: 200 });
    };
    await sendNtfyPush({ NTFY_TOPIC: 'x' }, 'T', 'B', fetchImpl as unknown as typeof fetch);
    expect(sawSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('describeFetchError', () => {
  // Node's fetch (undici) throws a generic `TypeError: fetch failed` for
  // every network-level failure (DNS, connection refused, TLS, timeout) and
  // buries the actual, diagnosable reason on `err.cause` instead of the
  // message. Swallowing that cause is exactly the "silent exception" the
  // honest-status principle forbids — Sean saw "push failed (fetch failed)"
  // on all 69 runs with zero way to tell DNS failure from a firewall block
  // from a timeout. This must surface the real cause, not just the wrapper.
  test('plain Error with no cause — just the message', () => {
    expect(describeFetchError(new Error('boom'))).toBe('boom');
  });

  test('fetch failed wrapping a Node system error — surfaces the cause and its code', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND ntfy.sh'), { code: 'ENOTFOUND' });
    const err = new TypeError('fetch failed', { cause });
    expect(describeFetchError(err)).toBe('fetch failed — getaddrinfo ENOTFOUND ntfy.sh (ENOTFOUND)');
  });

  test('a plain-object cause (no Error instance) is still surfaced, not dropped', () => {
    const err = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    expect(describeFetchError(err)).toBe('fetch failed — ECONNREFUSED');
  });

  test('a non-Error thrown value is stringified, not swallowed', () => {
    expect(describeFetchError('weird string throw')).toBe('weird string throw');
  });
});

describe('chiefOfStaffRunWith (the real agent run — push resilience)', () => {
  // Regression test: on 2026-08-14 the first live cron run had a genuine
  // overdue-invoice signal to push, and a network-level failure reaching
  // ntfy.sh (a plain rejected fetch(), not an HTTP error status — sendNtfyPush
  // only catches the latter) bubbled all the way up and marked the whole
  // Chief of Staff run FAILED with the cryptic summary "fetch failed", even
  // though signal-gathering itself worked perfectly. A flaky push should
  // never take down a run whose real job — surfacing signals — succeeded.
  test('a network failure while pushing relays through the Mac queue instead of failing the run (2026-08-24)', async () => {
    // Regression: on 2026-08-24, live diagnosis from Railway's own Console
    // confirmed this service cannot reach ntfy.sh's IP at all (general
    // outbound HTTPS works fine — connecting to ntfy.sh specifically times
    // out). Rather than just recording the failure, a genuine network-level
    // push failure now queues the exact url/title/body into pushQueue for
    // ~/.aac_brain/push_relay.py on Sean's Mac (which reaches ntfy.sh fine)
    // to forward — so this is handled, not failed, whenever NTFY_TOPIC is
    // configured (i.e. there's a real target to relay to).
    const db = openDb(':memory:');
    seedJourney(db, { id: 'hot-1', likelihood: 85 }, '2026-08-13');
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND ntfy.sh'), { code: 'ENOTFOUND' });
    const throwingFetch = async () => {
      throw new TypeError('fetch failed', { cause });
    };
    const result = await chiefOfStaffRunWith(
      db,
      { NTFY_TOPIC: 'aac-cos' },
      throwingFetch as unknown as typeof fetch,
      new Date('2026-08-14T00:00:00Z'),
    );
    expect(result.ok).toBe(true);
    // The real cause is still surfaced in the summary, now alongside the
    // fact that it was successfully relayed rather than dropped.
    expect(result.summary).toContain(
      'relayed via Mac (fetch failed — getaddrinfo ENOTFOUND ntfy.sh (ENOTFOUND))',
    );
    // A relayed push is handled, not failed.
    expect(result.pushFailed).toBeFalsy();
    // The relay queue actually received the exact notification to forward.
    const queued = db.pushQueue.popNext('2026-08-14T00:00:01.000Z');
    expect(queued?.url).toBe('https://ntfy.sh/aac-cos');
    expect(queued?.title).toBe('Chief of Staff');
    // Marked notified the same as a direct success, so the next hourly run
    // doesn't re-queue a duplicate.
    expect(newHighSeveritySignals(db, (result.data as { signals: Signal[] }).signals)).toHaveLength(0);
    db.close();
  });

  test('ntfy responding with a non-2xx status also relays through the Mac queue, not just "not sent"', async () => {
    const db = openDb(':memory:');
    seedJourney(db, { id: 'hot-4', likelihood: 88 }, '2026-08-13');
    const fetchImpl = async () => new Response(null, { status: 503 });
    const result = await chiefOfStaffRunWith(
      db,
      { NTFY_TOPIC: 'aac-cos' },
      fetchImpl as unknown as typeof fetch,
      new Date('2026-08-14T00:00:00Z'),
    );
    expect(result.ok).toBe(true);
    expect(result.pushFailed).toBeFalsy();
    expect(result.summary).toContain('relayed via Mac (ntfy status 503, direct push unreachable)');
    const queued = db.pushQueue.popNext('2026-08-14T00:00:01.000Z');
    expect(queued?.url).toBe('https://ntfy.sh/aac-cos');
    expect(newHighSeveritySignals(db, (result.data as { signals: Signal[] }).signals)).toHaveLength(0);
    db.close();
  });

  test('when the relay queue itself cannot accept the notification, pushFailed still becomes true', async () => {
    // The relay is the fallback of last resort — if the DB write behind it
    // fails too (not the network problem it exists to route around, but a
    // genuinely broken queue), the run must still honestly report the push
    // as failed and leave the signal un-notified for the next retry, rather
    // than silently claiming success.
    const db = openDb(':memory:');
    seedJourney(db, { id: 'hot-5', likelihood: 91 }, '2026-08-13');
    db.pushQueue.enqueue = () => {
      throw new Error('disk full');
    };
    const fetchImpl = async () => new Response(null, { status: 503 });
    const result = await chiefOfStaffRunWith(
      db,
      { NTFY_TOPIC: 'aac-cos' },
      fetchImpl as unknown as typeof fetch,
      new Date('2026-08-14T00:00:00Z'),
    );
    expect(result.ok).toBe(true);
    expect(result.pushFailed).toBe(true);
    expect(result.summary).toContain('push failed (ntfy status 503)');
    expect(newHighSeveritySignals(db, (result.data as { signals: Signal[] }).signals)).toHaveLength(1);
    db.close();
  });

  test('a successful push marks the signal notified and reports it — not pushFailed', async () => {
    const db = openDb(':memory:');
    seedJourney(db, { id: 'hot-2', likelihood: 90 }, '2026-08-13');
    const fetchImpl = async () => new Response(null, { status: 200 });
    const result = await chiefOfStaffRunWith(
      db,
      { NTFY_TOPIC: 'aac-cos' },
      fetchImpl as unknown as typeof fetch,
      new Date('2026-08-14T00:00:00Z'),
    );
    expect(result.ok).toBe(true);
    expect(result.pushFailed).toBeFalsy();
    expect(result.summary).toContain('pushed 1 new');
    expect(newHighSeveritySignals(db, (result.data as { signals: Signal[] }).signals)).toHaveLength(0);
    db.close();
  });

  test('no NTFY_TOPIC configured — honest no-op, run still succeeds, not counted as a push failure', async () => {
    const db = openDb(':memory:');
    seedJourney(db, { id: 'hot-3', likelihood: 90 }, '2026-08-13');
    const result = await chiefOfStaffRunWith(db, {}, fetch, new Date('2026-08-14T00:00:00Z'));
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('push not sent (NTFY_TOPIC not set)');
    // Not configured is honest and expected, not a failure — must not be
    // conflated with a push that was attempted and actually failed.
    expect(result.pushFailed).toBeFalsy();
    db.close();
  });
});
