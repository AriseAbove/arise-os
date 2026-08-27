import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { advanceStage } from '@/lib/funnel-stage';
import { completeMilestone } from '@/lib/project-milestones';
import { notifyStageChange, notifyMilestoneComplete } from '@/lib/funnel-notify';
import type { FunnelContact } from '@/lib/schemas';

/**
 * The notify leg of the client tracker (2026-08-27). No real network calls
 * here: with no INBOX_n_ or TWILIO_ env vars set, sendEmailReply/sendSms
 * both degrade to an honest { ok: false } immediately (see their own tests) — which is
 * exactly the path these tests exercise: notifyStageChange/
 * notifyMilestoneComplete's own gating and message-building logic, not the
 * underlying connectors.
 */

let db: FounderDb;
afterEach(() => db?.close());

const NOW = new Date('2026-08-27T12:00:00Z');
const NO_CREDS: Record<string, string | undefined> = {}; // no INBOX_*/TWILIO_*/TRACK_TOKEN_SECRET

function seedContact(over: Partial<FunnelContact> = {}): FunnelContact {
  const contact: FunnelContact = {
    id: 'fc-1',
    name: 'Jane Doe',
    business: 'aac',
    status: 'inquiry',
    product: null,
    amountUsd: null,
    costUsd: null,
    relationship: 'warm',
    likelihood: 50,
    url: null,
    email: 'jane@example.com',
    phone: '(248) 555-1234',
    person: 'Jane Doe',
    company: null,
    role: null,
    linkedin: null,
    createdAt: '2026-08-01',
    ...over,
  };
  db.funnel.insertContact(contact);
  return contact;
}

describe('notifyStageChange', () => {
  test('no-ops for an unknown contact', async () => {
    db = openDb(':memory:');
    const result = await notifyStageChange(db, 'does-not-exist', NO_CREDS);
    expect(result.attempted).toBe(false);
  });

  test('no-ops for an internal-only stage (follow_up) — never texts a homeowner about internal bookkeeping', async () => {
    db = openDb(':memory:');
    seedContact({ status: 'inquiry' });
    advanceStage(db, 'fc-1', 'follow_up', NOW);
    const result = await notifyStageChange(db, 'fc-1', NO_CREDS);
    expect(result.attempted).toBe(false);
  });

  test('attempts for a client-visible stage and reports honest failures with no connectors configured', async () => {
    db = openDb(':memory:');
    seedContact({ status: 'inquiry' });
    advanceStage(db, 'fc-1', 'follow_up', NOW);
    advanceStage(db, 'fc-1', 'walkthrough_scheduled', NOW);
    const result = await notifyStageChange(db, 'fc-1', NO_CREDS);
    expect(result.attempted).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(result.smsSent).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('reports "no email or phone" when the contact has neither on file', async () => {
    db = openDb(':memory:');
    seedContact({ status: 'inquiry', email: null, phone: null });
    advanceStage(db, 'fc-1', 'follow_up', NOW);
    advanceStage(db, 'fc-1', 'walkthrough_scheduled', NOW);
    const result = await notifyStageChange(db, 'fc-1', NO_CREDS);
    expect(result.errors.some((e) => e.includes('no email or phone'))).toBe(true);
  });
});

describe('notifyMilestoneComplete', () => {
  test('no-ops for an unknown contact or unknown milestone', async () => {
    db = openDb(':memory:');
    seedContact({ status: 'active_project' });
    expect((await notifyMilestoneComplete(db, 'does-not-exist', 'demo', NO_CREDS)).attempted).toBe(false);
  });

  test('attempts to notify on a real milestone completion', async () => {
    db = openDb(':memory:');
    seedContact({ status: 'active_project' });
    completeMilestone(db, 'fc-1', 'demo', NOW);
    const result = await notifyMilestoneComplete(db, 'fc-1', 'demo', NO_CREDS);
    expect(result.attempted).toBe(true);
  });
});
