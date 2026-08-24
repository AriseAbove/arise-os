import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import {
  attentionQueue,
  funnelSummary,
  funnelSpaceModel,
  isWon,
  journeyMeta,
  splitFunnelJourneys,
  decayFactor,
  DECAY_FADE_START,
  DECAY_DAYS,
  FUNNEL_STAGES,
  AAC_FUNNEL_STAGES,
  APPS_FUNNEL_STAGES,
  stagesFor,
  WON_STAGES,
} from '@/lib/funnel';
import { orbitSpread } from '@/lib/funnel-viz';
import {
  FunnelJourneySchema,
  FunnelSummarySchema,
  type FunnelContact,
  type FunnelJourney,
  type FunnelTouch,
} from '@/lib/schemas';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

const contact = (over: Partial<FunnelContact> = {}): FunnelContact => ({
  id: 'fc-test',
  name: 'Test Client',
  business: 'aac',
  status: 'follow_up',
  product: null,
  amountUsd: null,
  costUsd: null,
  relationship: 'warm',
  likelihood: 50,
  url: null,
  email: null,
  phone: null,
  person: null,
  company: null,
  role: null,
  linkedin: null,
  createdAt: '2026-06-01',
  ...over,
});

const touch = (over: Partial<FunnelTouch> = {}): FunnelTouch => ({
  id: 'ft-test',
  contactId: 'fc-test',
  seq: 1,
  stage: 'inquiry',
  channel: 'call',
  label: 'Allo call: kitchen remodel inquiry',
  source: 'allo',
  at: '2026-06-01',
  durationSeconds: null,
  ...over,
});

describe('the AAC pipeline stage model', () => {
  test('runs inquiry → complete_paid in order', () => {
    expect(FUNNEL_STAGES.map((s) => s.id)).toEqual([
      'inquiry',
      'follow_up',
      'walkthrough_scheduled',
      'estimate_sent',
      'negotiation',
      'contract_signed',
      'active_project',
      'complete_paid',
    ]);
  });

  test('won = contract signed onward (AAC) or subscribed onward (Apps)', () => {
    expect([...WON_STAGES].sort()).toEqual([
      'active_project',
      'complete_paid',
      'contract_signed',
      'retained',
      'subscribed',
    ]);
    expect(isWon('contract_signed')).toBe(true);
    expect(isWon('estimate_sent')).toBe(false);
    expect(isWon('subscribed')).toBe(true);
    expect(isWon('retained')).toBe(true);
    expect(isWon('discovered')).toBe(false);
  });
});

describe('the Apps pipeline stage model', () => {
  test('runs discovered → retained in order — a product funnel, not a sales pipeline', () => {
    expect(APPS_FUNNEL_STAGES.map((s) => s.id)).toEqual([
      'discovered',
      'installed',
      'activated',
      'trial_started',
      'subscribed',
      'retained',
    ]);
  });

  test('stagesFor picks the right pipeline per business; unset falls back to AAC', () => {
    expect(stagesFor('aac')).toBe(AAC_FUNNEL_STAGES);
    expect(stagesFor('apps')).toBe(APPS_FUNNEL_STAGES);
    expect(stagesFor(undefined)).toBe(AAC_FUNNEL_STAGES);
  });
});

describe('funnel repo', () => {
  test('empty database has no journeys', () => {
    db = openDb(':memory:');
    expect(db.funnel.journeys()).toEqual([]);
  });

  test('round-trips a contact with touches ordered by seq', () => {
    db = openDb(':memory:');
    db.funnel.insertContact(contact());
    db.funnel.insertTouch(touch({ id: 'ft-2', seq: 2, stage: 'follow_up', channel: 'sms', label: 'Follow-up text' }));
    db.funnel.insertTouch(touch({ id: 'ft-1', seq: 1 }));
    const journeys = db.funnel.journeys();
    expect(journeys).toHaveLength(1);
    expect(journeys[0].touches.map((t) => t.seq)).toEqual([1, 2]);
    expect(FunnelJourneySchema.parse(journeys[0]).name).toBe('Test Client');
  });

  test('round-trips the dossier identity fields', () => {
    db = openDb(':memory:');
    db.funnel.insertContact(
      contact({
        person: 'Grace Lin',
        company: 'Lin & Co Accounting',
        role: 'Managing Partner',
        linkedin: 'https://linkedin.com/in/gracelin-example',
      }),
    );
    db.funnel.insertTouch(touch());
    const [j] = db.funnel.journeys();
    expect(j.person).toBe('Grace Lin');
    expect(j.company).toBe('Lin & Co Accounting');
    expect(j.role).toBe('Managing Partner');
    expect(j.linkedin).toBe('https://linkedin.com/in/gracelin-example');
  });

  test('business filter narrows journeys', () => {
    db = openDb(':memory:');
    db.funnel.insertContact(contact({ id: 'fc-c', business: 'aac' }));
    db.funnel.insertContact(contact({ id: 'fc-a', business: 'apps' }));
    expect(db.funnel.journeys('aac').map((j) => j.id)).toEqual(['fc-c']);
    expect(db.funnel.journeys('apps').map((j) => j.id)).toEqual(['fc-a']);
    expect(db.funnel.journeys()).toHaveLength(2);
  });
});

describe('funnel seed', () => {
  test('the funnel seeds honestly empty — no invented journeys', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.funnel.journeys()).toEqual([]);
    // re-seeding stays empty and never throws
    seedDatabase(db);
    expect(db.funnel.journeys()).toEqual([]);
  });
});

describe('funnelSummary', () => {
  const journey = (
    id: string,
    status: FunnelContact['status'],
    amountUsd: number | null = null,
  ): FunnelJourney => ({
    id,
    name: id,
    business: 'aac',
    status,
    product: amountUsd ? 'Kitchen remodel' : null,
    amountUsd,
    costUsd: null,
    relationship: 'warm',
    likelihood: 50,
    url: null,
    email: null,
    phone: null,
    person: null,
    company: null,
    role: null,
    linkedin: null,
    createdAt: '2026-06-01',
    touches: [
      {
        id: `${id}-t1`,
        contactId: id,
        seq: 1,
        stage: 'inquiry',
        channel: 'call',
        label: 'Allo call',
        source: 'allo',
        at: '2026-06-01',
        durationSeconds: null,
      },
    ],
  });

  test('computes reached-stage counts and stage→stage conversion; won = contract signed onward', () => {
    const summary = funnelSummary([
      journey('j1', 'complete_paid', 24000),
      journey('j2', 'contract_signed', 15000),
      journey('j3', 'estimate_sent'),
      journey('j4', 'follow_up'),
    ]);
    FunnelSummarySchema.parse(summary);
    expect(summary.clients).toBe(4);
    expect(summary.converted).toBe(2); // both won journeys
    expect(summary.revenueUsd).toBe(39000);
    expect(summary.stages.map((s) => s.stage)).toEqual(FUNNEL_STAGES.map((s) => s.id));

    const byStage = Object.fromEntries(summary.stages.map((s) => [s.stage, s]));
    expect(byStage.inquiry).toMatchObject({ total: 4, conversionFromPrev: null });
    expect(byStage.follow_up).toMatchObject({ total: 4, conversionFromPrev: 100 });
    // journeys past a stage still count as having reached it
    expect(byStage.walkthrough_scheduled).toMatchObject({ total: 3, conversionFromPrev: 75 });
    expect(byStage.estimate_sent).toMatchObject({ total: 3, conversionFromPrev: 100 });
    expect(byStage.contract_signed).toMatchObject({ total: 2 });
    expect(byStage.active_project).toMatchObject({ total: 1, conversionFromPrev: 50 });
    expect(byStage.complete_paid).toMatchObject({ total: 1, conversionFromPrev: 100 });
  });

  test('guards zero division on an empty journey set', () => {
    const summary = funnelSummary([]);
    FunnelSummarySchema.parse(summary);
    expect(summary.clients).toBe(0);
    expect(summary.revenueUsd).toBe(0);
    for (const s of summary.stages) {
      expect(s.total).toBe(0);
      expect(s.conversionFromPrev).toBeNull();
    }
  });

  const appsJourney = (id: string, status: FunnelContact['status']): FunnelJourney => ({
    id,
    name: id,
    business: 'apps',
    status,
    product: null,
    amountUsd: null,
    costUsd: null,
    relationship: 'warm',
    likelihood: 50,
    url: null,
    email: null,
    phone: null,
    person: null,
    company: null,
    role: null,
    linkedin: null,
    createdAt: '2026-06-01',
    touches: [
      { id: `${id}-t1`, contactId: id, seq: 1, stage: 'discovered', channel: 'organic', label: 'App Store find', source: 'website', at: '2026-06-01', durationSeconds: null },
    ],
  });

  test('scopes the breakdown to the Apps pipeline when given APPS_FUNNEL_STAGES — won = subscribed onward', () => {
    const summary = funnelSummary(
      [
        appsJourney('a1', 'retained'),
        appsJourney('a2', 'subscribed'),
        appsJourney('a3', 'trial_started'),
        appsJourney('a4', 'installed'),
      ],
      stagesFor('apps'),
    );
    FunnelSummarySchema.parse(summary);
    expect(summary.clients).toBe(4);
    expect(summary.converted).toBe(2); // subscribed + retained
    expect(summary.stages.map((s) => s.stage)).toEqual(APPS_FUNNEL_STAGES.map((s) => s.id));
    const byStage = Object.fromEntries(summary.stages.map((s) => [s.stage, s]));
    expect(byStage.discovered).toMatchObject({ total: 4 });
    expect(byStage.installed).toMatchObject({ total: 4 }); // all 4 reached at least 'installed'
    expect(byStage.subscribed).toMatchObject({ total: 2 });
    expect(byStage.retained).toMatchObject({ total: 1 });
  });

  test('an Apps journey summarized against the AAC backbone counts toward totals but not any stage row', () => {
    const summary = funnelSummary([appsJourney('a1', 'discovered')]); // default stages = AAC's
    expect(summary.clients).toBe(1);
    for (const s of summary.stages) expect(s.total).toBe(0);
  });
});

describe('journeyMeta', () => {
  const daysAgoIso = (now: Date, days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);

  const journeyLastTouchedAt = (
    status: FunnelContact['status'],
    at: string,
  ): FunnelJourney => ({
    id: 'jm',
    name: 'jm',
    business: 'aac',
    status,
    product: null,
    amountUsd: null,
    costUsd: null,
    relationship: 'warm',
    likelihood: 50,
    url: null,
    email: null,
    phone: null,
    person: null,
    company: null,
    role: null,
    linkedin: null,
    createdAt: at,
    touches: [
      {
        id: 'jm-t1', contactId: 'jm', seq: 1, stage: 'inquiry',
        channel: 'call', label: 'x', source: 'allo', at, durationSeconds: null,
      },
    ],
  });

  test('won journeys are green regardless of quiet time', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    expect(journeyMeta(journeyLastTouchedAt('contract_signed', daysAgoIso(now, 30)), now).state).toBe('converted');
    expect(journeyMeta(journeyLastTouchedAt('active_project', daysAgoIso(now, 30)), now).state).toBe('converted');
    expect(journeyMeta(journeyLastTouchedAt('complete_paid', daysAgoIso(now, 200)), now).state).toBe('converted');
  });

  test('a lead quiet for more than 7 days before winning is stalled (red)', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const meta = journeyMeta(journeyLastTouchedAt('estimate_sent', daysAgoIso(now, 8)), now);
    expect(meta.state).toBe('stalled');
    expect(meta.daysSinceLastTouch).toBe(8);
  });

  test('exactly 7 quiet days is still active — stall needs MORE than a week', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    expect(journeyMeta(journeyLastTouchedAt('follow_up', daysAgoIso(now, 7)), now).state).toBe('active');
    expect(journeyMeta(journeyLastTouchedAt('follow_up', daysAgoIso(now, 2)), now).state).toBe('active');
  });

  test('fresh inquiries never stall — inquiry stays blue however long it sits', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    expect(journeyMeta(journeyLastTouchedAt('inquiry', daysAgoIso(now, 30)), now).state).toBe('active');
  });

  test('fresh Apps entries never stall either — discovered stays blue, but a later stage does stall', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const at = daysAgoIso(now, 30);
    const discovered: FunnelJourney = {
      ...journeyLastTouchedAt('discovered', at),
      business: 'apps',
      touches: [{ id: 'jm-t1', contactId: 'jm', seq: 1, stage: 'discovered', channel: 'organic', label: 'x', source: 'website', at, durationSeconds: null }],
    };
    expect(journeyMeta(discovered, now).state).toBe('active');
    const installedAt = daysAgoIso(now, 10);
    const installed: FunnelJourney = {
      ...journeyLastTouchedAt('installed', installedAt),
      business: 'apps',
      touches: [{ id: 'jm-t1', contactId: 'jm', seq: 1, stage: 'installed', channel: 'organic', label: 'x', source: 'website', at: installedAt, durationSeconds: null }],
    };
    expect(journeyMeta(installed, now).state).toBe('stalled');
  });

  test('past 90 quiet days an unwon lead decays into the archive', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    expect(journeyMeta(journeyLastTouchedAt('follow_up', daysAgoIso(now, 91)), now).state).toBe('decayed');
    expect(journeyMeta(journeyLastTouchedAt('inquiry', daysAgoIso(now, 120)), now).state).toBe('decayed');
    expect(journeyMeta(journeyLastTouchedAt('follow_up', daysAgoIso(now, 90)), now).state).toBe('stalled'); // exactly 90 is not decayed yet
    expect(journeyMeta(journeyLastTouchedAt('complete_paid', daysAgoIso(now, 200)), now).state).toBe('converted');
  });

  test('splitFunnelJourneys separates the live space from the archive', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const fresh = journeyLastTouchedAt('follow_up', daysAgoIso(now, 2));
    const dead = { ...journeyLastTouchedAt('follow_up', daysAgoIso(now, 120)), id: 'dead' };
    const { active, archived } = splitFunnelJourneys([fresh, dead], now);
    expect(active.map((j) => j.id)).toEqual(['jm']);
    expect(archived.map((j) => j.id)).toEqual(['dead']);
  });
});

describe('decayFactor', () => {
  test('stays neutral through the fade start, ramps linearly, clamps at 1', () => {
    expect(decayFactor(0, 'follow_up')).toBe(0);
    expect(decayFactor(DECAY_FADE_START, 'follow_up')).toBe(0);
    const mid = (DECAY_FADE_START + DECAY_DAYS) / 2;
    expect(decayFactor(mid, 'follow_up')).toBeCloseTo(0.5, 5);
    expect(decayFactor(DECAY_DAYS, 'follow_up')).toBe(1);
    expect(decayFactor(500, 'follow_up')).toBe(1);
  });

  test('won journeys never decay — the win stays green', () => {
    expect(decayFactor(500, 'contract_signed')).toBe(0);
    expect(decayFactor(500, 'complete_paid')).toBe(0);
  });
});

describe('funnelSpaceModel', () => {
  const NOW = new Date('2026-07-02T12:00:00Z');
  const dAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);

  const mkTouch = (
    contactId: string,
    seq: number,
    stage: FunnelTouch['stage'],
    daysBack: number,
    channel: FunnelTouch['channel'] = 'email',
  ): FunnelTouch => ({
    id: `${contactId}-t${seq}`,
    contactId,
    seq,
    stage,
    channel,
    label: `${stage} touch`,
    source: 'manual',
    at: dAgo(daysBack),
    durationSeconds: null,
  });

  const mkJourney = (
    id: string,
    status: FunnelContact['status'],
    touches: FunnelTouch[],
    over: Partial<FunnelJourney> = {},
  ): FunnelJourney => ({
    id,
    name: id,
    business: 'aac',
    status,
    product: null,
    amountUsd: null,
    costUsd: null,
    relationship: 'warm',
    likelihood: 50,
    url: null,
    email: null,
    phone: null,
    person: null,
    company: null,
    role: null,
    linkedin: null,
    createdAt: dAgo(30),
    touches,
    ...over,
  });

  test('a full journey visits every hub in order and settles green on the win hubs', () => {
    const full = mkJourney('full', 'complete_paid', [
      mkTouch('full', 1, 'inquiry', 60, 'call'),
      mkTouch('full', 2, 'follow_up', 55, 'sms'),
      mkTouch('full', 3, 'walkthrough_scheduled', 50, 'walkthrough'),
      mkTouch('full', 4, 'estimate_sent', 45, 'document'),
      mkTouch('full', 5, 'negotiation', 40, 'call'),
      mkTouch('full', 6, 'contract_signed', 35, 'document'),
      mkTouch('full', 7, 'active_project', 20, 'walkthrough'),
      mkTouch('full', 8, 'complete_paid', 10, 'document'),
    ], { relationship: 'hot', likelihood: 100, product: 'Kitchen remodel', amountUsd: 32000 });
    const [node] = funnelSpaceModel([full], NOW);
    expect(node.hubs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(node.currentHub).toBe(7);
    expect(node.state).toBe('converted');
  });

  test('repeated-stage touches collapse to one hub visit; a quiet lead runs red', () => {
    const stuck = mkJourney('stuck', 'follow_up', [
      mkTouch('stuck', 1, 'inquiry', 27, 'call'),
      mkTouch('stuck', 2, 'follow_up', 27, 'call'),
      mkTouch('stuck', 3, 'follow_up', 23, 'sms'),
      mkTouch('stuck', 4, 'follow_up', 21),
    ], { relationship: 'cold', likelihood: 15 });
    const [node] = funnelSpaceModel([stuck], NOW);
    expect(node.hubs).toEqual([0, 1]);
    expect(node.currentHub).toBe(1);
    expect(node.state).toBe('stalled');
    expect(node.daysSinceLastTouch).toBe(21);
  });

  test('identity fields ride onto the node for the dossier', () => {
    const j = mkJourney('who', 'follow_up', [mkTouch('who', 1, 'inquiry', 1)], {
      person: 'Reese Calder',
      company: 'Calder Holdings LLC',
      role: 'Homeowner',
      linkedin: 'https://linkedin.com/in/reesecalder-example',
      email: 'reese@example.com',
      phone: '+15550100442',
    });
    const [node] = funnelSpaceModel([j], NOW);
    expect(node.person).toBe('Reese Calder');
    expect(node.company).toBe('Calder Holdings LLC');
    expect(node.role).toBe('Homeowner');
    expect(node.linkedin).toBe('https://linkedin.com/in/reesecalder-example');
  });

  test('node radius grows with likelihood-to-buy inside compact 2.5–5.5px bounds', () => {
    const lo = mkJourney('lo', 'follow_up', [mkTouch('lo', 1, 'inquiry', 1)], { likelihood: 0 });
    const hi = mkJourney('hi', 'follow_up', [mkTouch('hi', 1, 'inquiry', 1)], { id: 'hi', likelihood: 100 });
    const [nLo, nHi] = funnelSpaceModel([lo, hi], NOW);
    expect(nHi.radius).toBeGreaterThan(nLo.radius);
    expect(nLo.radius).toBe(2.5);
    expect(nHi.radius).toBe(5.5);
  });

  test('every node carries its decay factor for the fade-to-red rendering', () => {
    const fresh = mkJourney('fresh', 'follow_up', [mkTouch('fresh', 1, 'inquiry', 2)]);
    const fading = mkJourney('fading', 'follow_up', [mkTouch('fading', 1, 'inquiry', 80)], { id: 'fading' });
    const [nFresh, nFading] = funnelSpaceModel([fresh, fading], NOW);
    expect(nFresh.decay).toBe(0);
    expect(nFading.decay).toBeGreaterThan(0.5);
    expect(nFading.decay).toBeLessThanOrEqual(1);
  });

  test('returns an empty model for no journeys', () => {
    expect(funnelSpaceModel([], NOW)).toEqual([]);
  });

  test('rendered against APPS_FUNNEL_STAGES, an Apps journey hubs onto its own pipeline', () => {
    const j = mkJourney(
      'app1',
      'subscribed',
      [
        mkTouch('app1', 1, 'discovered', 20, 'organic'),
        mkTouch('app1', 2, 'installed', 15, 'organic'),
        mkTouch('app1', 3, 'subscribed', 5, 'organic'),
      ],
      { business: 'apps' },
    );
    const [node] = funnelSpaceModel([j], NOW, stagesFor('apps'));
    expect(node.hubs).toEqual([0, 1, 4]); // discovered=0, installed=1, subscribed=4
    expect(node.currentHub).toBe(4);
    expect(node.state).toBe('converted');
  });

  test('rendered against the AAC backbone (the default), an unknown Apps stage id parks at hub 0 instead of crashing', () => {
    const j = mkJourney('app2', 'discovered', [mkTouch('app2', 1, 'discovered', 3, 'organic')], { business: 'apps' });
    const [node] = funnelSpaceModel([j], NOW); // no stages arg — defaults to AAC's
    expect(node.hubs).toEqual([0]);
    expect(node.currentHub).toBe(0);
  });
});

describe('attentionQueue — what to act on today', () => {
  const NOW = new Date('2026-07-11T12:00:00Z');
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const lead = (
    id: string,
    over: Partial<FunnelContact>,
    quietDays: number,
  ): FunnelJourney => ({
    id,
    name: id,
    business: 'aac',
    status: 'follow_up',
    product: null,
    amountUsd: null,
    costUsd: null,
    relationship: 'warm',
    likelihood: 50,
    url: null,
    email: null,
    phone: null,
    person: null,
    company: null,
    role: null,
    linkedin: null,
    createdAt: daysAgo(quietDays + 10),
    touches: [
      {
        id: `${id}-t1`, contactId: id, seq: 1, stage: 'follow_up',
        channel: 'crm', label: 'x', source: 'crm', at: daysAgo(quietDays), durationSeconds: null,
      },
    ],
    ...over,
  });

  test('pushNow = hot actives, freshest movement first, capped at 4', () => {
    const q = attentionQueue(
      [
        lead('cool', { likelihood: 40 }, 2), // not hot — out
        lead('hot-fresh', { likelihood: 90 }, 1),
        lead('hot-later', { likelihood: 80 }, 5),
        lead('hot-a', { likelihood: 85 }, 2),
        lead('hot-b', { likelihood: 75 }, 3),
        lead('hot-c', { likelihood: 71 }, 4),
        lead('won', { likelihood: 95, status: 'contract_signed' }, 1), // won — out
        lead('dying', { likelihood: 95 }, 30), // decaying — belongs to saveNow
        // fresh inquiries never stall, but a fading lead is a save, not a push
        lead('fading-inbound', { likelihood: 95, status: 'inquiry' }, 30),
      ],
      NOW,
    );
    expect(q.pushNow.map((j) => j.id)).toEqual(['hot-fresh', 'hot-a', 'hot-b', 'hot-c']);
  });

  test('saveNow = decaying leads, highest likelihood first, capped at 4', () => {
    const q = attentionQueue(
      [
        lead('fine', { likelihood: 90 }, 3), // active — not dying
        lead('save-1', { likelihood: 88 }, 25),
        lead('save-2', { likelihood: 70 }, 40),
        lead('save-3', { likelihood: 55 }, 30),
        lead('save-4', { likelihood: 50 }, 22),
        lead('save-5', { likelihood: 20 }, 35),
        lead('gone', { likelihood: 99 }, 120), // decayed → archive, not the queue
      ],
      NOW,
    );
    expect(q.saveNow.map((j) => j.id)).toEqual(['save-1', 'save-2', 'save-3', 'save-4']);
  });

  test('a fading inquiry is a save, never a push (it cannot stall)', () => {
    const q = attentionQueue([lead('fading-inbound', { likelihood: 95, status: 'inquiry' }, 30)], NOW);
    expect(q.pushNow).toEqual([]);
    expect(q.saveNow.map((j) => j.id)).toEqual(['fading-inbound']);
  });

  test('empty pipeline yields empty queues', () => {
    expect(attentionQueue([], NOW)).toEqual({ pushNow: [], saveNow: [] });
  });
});

describe('orbitSpread — crowded hubs breathe wider', () => {
  test('a dozen leads keep the tight constellation, a big pipeline spreads', () => {
    expect(orbitSpread(1)).toBe(1);
    expect(orbitSpread(12)).toBe(1);
    const crowd = orbitSpread(105);
    expect(crowd).toBeGreaterThan(1.5);
    expect(crowd).toBeLessThanOrEqual(2.4);
    // monotonic and capped
    expect(orbitSpread(50)).toBeLessThan(crowd);
    expect(orbitSpread(1000)).toBe(2.4);
    // safe on empty clusters
    expect(orbitSpread(0)).toBe(1);
  });
});
