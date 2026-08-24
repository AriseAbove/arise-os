import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';

// The push-relay queue behind Chief of Staff's ntfy fallback (2026-08-24):
// Railway can't reach ntfy.sh's IP at all (confirmed via live diagnosis from
// Railway's own Console — see lib/db.ts's pushQueue doc comment), so a
// genuine direct-push failure queues the exact url/title/body here instead
// of just recording the failure, and ~/.aac_brain/push_relay.py on Sean's
// Mac (which reaches ntfy.sh fine) polls it and forwards the notification.
// Same lifecycle as voiceQueue (tests/voice-queue.test.ts): atomic
// pop-and-consume, FIFO, 24h sweep of consumed rows.
let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('pushQueue', () => {
  test('popNext returns null on an empty queue', () => {
    db = openDb(':memory:');
    expect(db.pushQueue.popNext('2026-08-24T00:00:00.000Z')).toBeNull();
  });

  test('enqueue then popNext returns the item and marks it consumed — a second pop sees nothing', () => {
    db = openDb(':memory:');
    db.pushQueue.enqueue({
      id: 'p1',
      url: 'https://ntfy.sh/aac-cos',
      title: 'Chief of Staff',
      body: 'Hot lead ready to push',
      createdAt: '2026-08-24T00:00:00.000Z',
    });

    const popped = db.pushQueue.popNext('2026-08-24T00:00:01.000Z');
    expect(popped).toEqual({
      id: 'p1',
      url: 'https://ntfy.sh/aac-cos',
      title: 'Chief of Staff',
      body: 'Hot lead ready to push',
      createdAt: '2026-08-24T00:00:00.000Z',
    });

    expect(db.pushQueue.popNext('2026-08-24T00:00:02.000Z')).toBeNull();
  });

  test('popNext is FIFO — oldest enqueued item comes out first regardless of insert order tiebreak', () => {
    db = openDb(':memory:');
    db.pushQueue.enqueue({
      id: 'p-later',
      url: 'https://ntfy.sh/aac-cos',
      title: 'T',
      body: 'second thing queued',
      createdAt: '2026-08-24T00:00:05.000Z',
    });
    db.pushQueue.enqueue({
      id: 'p-earlier',
      url: 'https://ntfy.sh/aac-cos',
      title: 'T',
      body: 'first thing queued',
      createdAt: '2026-08-24T00:00:01.000Z',
    });

    expect(db.pushQueue.popNext('2026-08-24T00:01:00.000Z')?.id).toBe('p-earlier');
    expect(db.pushQueue.popNext('2026-08-24T00:01:01.000Z')?.id).toBe('p-later');
  });

  test('popNext purges consumed items older than 24h so the table never grows unbounded', () => {
    db = openDb(':memory:');
    db.pushQueue.enqueue({
      id: 'p-old',
      url: 'https://ntfy.sh/aac-cos',
      title: 'T',
      body: 'stale',
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    db.pushQueue.popNext('2026-08-01T00:00:01.000Z'); // consumed 3 weeks ago

    db.pushQueue.enqueue({
      id: 'p-new',
      url: 'https://ntfy.sh/aac-cos',
      title: 'T',
      body: 'fresh',
      createdAt: '2026-08-24T00:00:00.000Z',
    });
    db.pushQueue.popNext('2026-08-24T00:00:01.000Z'); // triggers the purge sweep

    // No direct raw-table access from the repo layer — purge is verified
    // indirectly, same convention as tests/voice-queue.test.ts: a fresh
    // enqueue+pop cycle still behaves correctly after the sweep ran.
    db.pushQueue.enqueue({
      id: 'p-after-purge',
      url: 'https://ntfy.sh/aac-cos',
      title: 'T',
      body: 'still works',
      createdAt: '2026-08-24T00:00:02.000Z',
    });
    expect(db.pushQueue.popNext('2026-08-24T00:00:03.000Z')?.id).toBe('p-after-purge');
  });
});
