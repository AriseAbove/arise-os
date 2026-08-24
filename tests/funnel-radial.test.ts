import { describe, expect, test } from 'vitest';
import { ACQUISITIONS, acquisitionFor, funnelRadialModel, originOf } from '@/lib/funnel-radial';
import { FUNNEL_STAGES, stagesFor } from '@/lib/funnel';
import type { FunnelContact, FunnelJourney, FunnelTouch } from '@/lib/schemas';

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

const journey = (over: Partial<FunnelContact> = {}, touches: FunnelTouch[] = [touch()]): FunnelJourney => ({
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
  touches,
  ...over,
});

const firstTouch = (label: string, channel: FunnelTouch['channel'] = 'call') =>
  journey({}, [touch({ label, channel })]);

const LAST_RING = FUNNEL_STAGES.length - 1;

describe('ACQUISITIONS — the rim segments', () => {
  test('the AAC lead sources, in canonical order, each labelled', () => {
    expect(ACQUISITIONS.map((a) => a.id)).toEqual([
      'phone',
      'google',
      'website',
      'social',
      'referral',
      'word_of_mouth',
    ]);
    for (const a of ACQUISITIONS) expect(a.label.length).toBeGreaterThan(0);
  });
});

describe('acquisitionFor — keyword classification of the entry touch', () => {
  test('phone family: Allo, calls, voicemail', () => {
    expect(acquisitionFor(firstTouch('Allo call: kitchen remodel inquiry'))).toBe('phone');
    expect(acquisitionFor(firstTouch('Missed call — voicemail left'))).toBe('phone');
  });

  test('google family: search, maps, business profile', () => {
    expect(acquisitionFor(firstTouch('Found us on Google Maps'))).toBe('google');
    expect(acquisitionFor(firstTouch('Google Business Profile message', 'dm'))).toBe('google');
  });

  test('website forms and booking links', () => {
    expect(acquisitionFor(firstTouch('Website form: estimate request', 'email'))).toBe('website');
    expect(acquisitionFor(firstTouch('Booking link: free walk-through', 'email'))).toBe('website');
  });

  test('social: instagram, facebook, nextdoor, houzz', () => {
    expect(acquisitionFor(firstTouch('Instagram DM about bathroom remodel', 'dm'))).toBe('social');
    expect(acquisitionFor(firstTouch('Houzz message about a basement finish', 'dm'))).toBe('social');
  });

  test('explicit referrals beat everything else', () => {
    expect(acquisitionFor(firstTouch('Referral from the Hendersons'))).toBe('referral');
  });

  test('call/sms channel with no keyword still reads phone', () => {
    expect(acquisitionFor(firstTouch('First contact', 'call'))).toBe('phone');
    expect(acquisitionFor(firstTouch('Text conversation', 'sms'))).toBe('phone');
  });

  test('paid channel with no keyword reads social (ads = the social machine)', () => {
    expect(acquisitionFor(firstTouch('Cold-traffic campaign #4', 'ads'))).toBe('social');
  });

  test('untracked CRM entries default honestly to word_of_mouth', () => {
    expect(acquisitionFor(firstTouch('Opportunity created in CRM', 'crm'))).toBe('word_of_mouth');
    expect(acquisitionFor(journey({}, []))).toBe('word_of_mouth');
  });

  test('organic channel with no keyword hit still reads website (a real form submission, no "how found" answer)', () => {
    expect(acquisitionFor(firstTouch('Website form: submission', 'organic'))).toBe('website');
  });

  test('a website-form submission whose "how found AAC" answer names a channel promotes to that segment', () => {
    expect(acquisitionFor(firstTouch('Website form: google-search — Kitchen remodel', 'organic'))).toBe('google');
    expect(acquisitionFor(firstTouch('Website form: Referred by a friend — Kitchen remodel', 'organic'))).toBe(
      'referral',
    );
  });
});

describe('funnelRadialModel — outside → in', () => {
  const now = new Date('2026-07-04T12:00:00Z');

  test('all segments always present, counts sum to journeys, won tallied', () => {
    const js = [
      journey({ id: 'a' }, [touch({ label: 'Allo call: kitchen inquiry' })]),
      journey({ id: 'b', status: 'complete_paid', product: 'Bathroom remodel', amountUsd: 18000 }, [
        touch({ label: 'Google Maps: found the profile', at: '2026-06-20' }),
        touch({ id: 't2', seq: 2, stage: 'complete_paid', channel: 'document', label: 'Final invoice paid', at: '2026-07-01' }),
      ]),
      journey({ id: 'c' }, [touch({ label: 'Opportunity created in CRM', channel: 'crm' })]),
    ];
    const model = funnelRadialModel(js, now);
    expect(model.segments.map((s) => s.id)).toEqual(ACQUISITIONS.map((a) => a.id));
    expect(model.segments.reduce((sum, s) => sum + s.count, 0)).toBe(3);
    expect(model.segments.find((s) => s.id === 'google')).toMatchObject({ count: 1, converted: 1 });
    expect(model.segments.find((s) => s.id === 'phone')).toMatchObject({ count: 1, converted: 0 });
    expect(model.segments.find((s) => s.id === 'word_of_mouth')).toMatchObject({ count: 1, converted: 0 });
  });

  test('nodes carry segment index, ring path and current ring (stage depth)', () => {
    const js = [
      journey({ id: 'won', status: 'complete_paid' }, [
        touch({ label: 'Website form: estimate request', channel: 'email' }),
        touch({ id: 't2', seq: 2, stage: 'follow_up', channel: 'sms', label: 'Follow-up text', at: '2026-06-10' }),
        touch({ id: 't3', seq: 3, stage: 'complete_paid', channel: 'document', label: 'Paid', at: '2026-06-20' }),
      ]),
    ];
    const [node] = funnelRadialModel(js, now).nodes;
    expect(node.segment).toBe(2); // website
    expect(node.rings).toEqual([0, 1, LAST_RING]);
    expect(node.currentRing).toBe(LAST_RING); // complete & paid = the core
    expect(node.state).toBe('converted');
  });

  test('space-model fields survive: decay, likelihood, contact channels', () => {
    const js = [
      journey({ id: 'fading', likelihood: 80, email: 'lead@example.com' }, [
        touch({ label: 'Facebook message about a deck build', channel: 'dm', at: '2026-05-01' }), // 64 quiet days at `now`
      ]),
    ];
    const [node] = funnelRadialModel(js, now).nodes;
    expect(node.segment).toBe(3); // social
    expect(node.likelihood).toBe(80);
    expect(node.email).toBe('lead@example.com');
    expect(node.decay).toBeGreaterThan(0.5);
    expect(node.decay).toBeLessThan(1);
  });

  test('empty input still yields the full rim', () => {
    const model = funnelRadialModel([], now);
    expect(model.nodes).toEqual([]);
    expect(model.segments).toHaveLength(6);
    expect(model.segments.every((s) => s.count === 0)).toBe(true);
  });

  test('accepts a stages param and hubs an Apps journey onto its own pipeline, not the AAC default', () => {
    const j = journey(
      { id: 'app1', business: 'apps', status: 'subscribed' },
      [
        touch({ id: 't1', stage: 'discovered', channel: 'organic', label: 'App Store: discovered', at: '2026-06-01' }),
        touch({ id: 't2', seq: 2, stage: 'installed', channel: 'organic', label: 'Installed', at: '2026-06-05' }),
        touch({ id: 't3', seq: 3, stage: 'subscribed', channel: 'organic', label: 'Subscribed', at: '2026-06-10' }),
      ],
    );
    const [node] = funnelRadialModel([j], now, stagesFor('apps')).nodes;
    // discovered=0, installed=1, subscribed=4 on the 6-stage Apps pipeline —
    // NOT the 8-stage AAC pipeline's indices for the same stage ids (which
    // don't even exist on that backbone).
    expect(node.rings).toEqual([0, 1, 4]);
    expect(node.currentRing).toBe(4);
  });
});

describe('originOf — where they came from, in words', () => {
  test('a phone entry reads as the Phone/Allo segment with the entry touch', () => {
    const j = firstTouch('Allo call: kitchen remodel inquiry');
    const o = originOf(j);
    expect(o.segment).toBe('Phone / Allo');
    expect(o.entry).toBe('Allo call: kitchen remodel inquiry');
    expect(o.at).toBe(j.touches[0].at);
    expect(o.source).toBe(j.touches[0].source);
    expect(o.channel).toBe(j.touches[0].channel);
  });

  test('an untracked CRM entry is honestly word of mouth', () => {
    const j = journey({}, [touch({ label: 'Deal created in CRM', channel: 'crm', source: 'crm' })]);
    expect(originOf(j).segment).toBe('Word of mouth');
    expect(originOf(j).source).toBe('crm');
  });

  test('a journey with no touches still answers', () => {
    const o = originOf(journey({}, []));
    expect(o.segment).toBe('Word of mouth');
    expect(o.entry).toBeNull();
  });
});
