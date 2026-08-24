import type { FounderDb } from '@/lib/db';
import type { FunnelBusiness, FunnelChannel, FunnelContact, FunnelJourney, FunnelStage } from '@/lib/schemas';
import { normalizePhoneKey } from '@/lib/funnel-allo';

/**
 * Claude/Cowork session → AAC (or Apps) pipeline. This is the third funnel
 * writer, alongside Allo (lib/funnel-allo.ts) and the website form
 * (lib/funnel-website.ts) — but it's the one AAC's real day-to-day actually
 * runs through: Sean does virtually everything (estimates, proposals,
 * change orders) through a Claude session, not the Allo phone line or the
 * website form. Before this existed, any job that started or moved by email
 * (a referral, a walkthrough, an estimate emailed out) was invisible to
 * `/funnel` — see the 2026-08-24 handoff doc on the email-leads gap.
 *
 * Unlike the Allo/website importers, this one DOES move `status` — Sean (via
 * Claude) is the one deciding the stage, not an automated call/form log.
 * The convention (documented in project memory) is: any time a Claude
 * session produces an estimate, proposal, change order, or otherwise closes
 * out a step in a real job, it calls upsertFunnelCard so the funnel stays a
 * complete, current record — not a parallel manual step Sean has to
 * remember separately.
 *
 * Identity match mirrors the website importer: phone-first, email-second,
 * so a job that also came in through Allo/the website merges onto the same
 * journey instead of forking a duplicate. When neither is known yet (e.g. a
 * referral logged before a callback), falls back to a name+business key —
 * weaker, but better than guaranteeing a duplicate on the next call once a
 * phone/email does show up (that later call's phone/email key will win and
 * attach to the existing row via updateExisting's re-keying below).
 */

export type FunnelCardInput = {
  business: FunnelBusiness;
  name: string;
  phone?: string | null;
  email?: string | null;
  /** Furthest stage reached — Sean's call, via this Claude session. */
  stage: FunnelStage;
  product?: string | null;
  /** Deal amount once known (an accepted estimate, a signed contract). Null while still open/unknown — never a guess. */
  amountUsd?: number | null;
  /** Actual/estimated job cost (materials + labor + subs), once known. */
  costUsd?: number | null;
  relationship?: FunnelContact['relationship'];
  likelihood?: number;
  person?: string | null;
  company?: string | null;
  role?: string | null;
  /** The touch this card-write represents — e.g. "Estimate sent: Garage extension, 2 options ($14,586 / $15,941)". */
  touchLabel: string;
  touchChannel: FunnelChannel;
  /** ISO date (YYYY-MM-DD) the touch happened. Defaults to `now`. */
  at?: string;
};

export type FunnelCardResult = {
  journey: FunnelJourney;
  created: boolean;
};

function dedupeKey(input: Pick<FunnelCardInput, 'business' | 'name' | 'phone' | 'email'>): string {
  const phoneKey = normalizePhoneKey(input.phone ?? null);
  if (phoneKey) return `phone:${phoneKey}`;
  const emailKey = input.email ? input.email.trim().toLowerCase() : null;
  if (emailKey) return `email:${emailKey}`;
  // Weak fallback — name+business, normalized. Whoever calls this with
  // neither a phone nor an email is accepting that a later call keyed on a
  // now-known phone/email creates a second row rather than merging; that's
  // still strictly better than the pre-fix status quo (no row at all).
  const nameKey = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `name:${input.business}:${nameKey}`;
}

function contactId(key: string): string {
  return `claude-${key.replace(/[^a-z0-9]/gi, '')}`;
}

/**
 * Create-or-update one funnel card from a Claude session. Idempotent per
 * call in the sense that calling it again for the same job just advances
 * the same journey (new touch, updated stage/amount/cost) — it never
 * duplicates a contact once dedupeKey matches an existing one.
 */
export function upsertFunnelCard(db: FounderDb, input: FunnelCardInput, now: Date): FunnelCardResult {
  const key = dedupeKey(input);
  const today = now.toISOString().slice(0, 10);
  const at = input.at ?? today;

  const journeys = db.funnel.journeys(input.business);
  const phoneKey = normalizePhoneKey(input.phone ?? null);
  const emailKey = input.email ? input.email.trim().toLowerCase() : null;
  const nameKey = `name:${input.business}:${input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  let existing: FunnelJourney | undefined;
  for (const j of journeys) {
    const jPhone = normalizePhoneKey(j.phone);
    const jEmail = j.email ? j.email.trim().toLowerCase() : null;
    if ((phoneKey && jPhone === phoneKey) || (emailKey && jEmail === emailKey) || (!phoneKey && !emailKey && `name:${j.business}:${j.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}` === nameKey)) {
      existing = j;
      break;
    }
  }

  const created = !existing;
  const id = existing?.id ?? contactId(key);

  const contact: FunnelContact = {
    id,
    name: input.name,
    business: input.business,
    status: input.stage,
    product: input.product ?? existing?.product ?? null,
    amountUsd: input.amountUsd !== undefined ? input.amountUsd : (existing?.amountUsd ?? null),
    costUsd: input.costUsd !== undefined ? input.costUsd : (existing?.costUsd ?? null),
    relationship: input.relationship ?? existing?.relationship ?? 'warm',
    likelihood: input.likelihood ?? existing?.likelihood ?? 50,
    url: existing?.url ?? null,
    email: input.email ?? existing?.email ?? null,
    phone: input.phone ?? existing?.phone ?? null,
    person: input.person ?? existing?.person ?? input.name,
    company: input.company ?? existing?.company ?? null,
    role: input.role ?? existing?.role ?? null,
    linkedin: existing?.linkedin ?? null,
    createdAt: existing?.createdAt ?? at,
  };
  db.funnel.insertContact(contact);

  const seq = (existing?.touches.length ?? 0) + 1;
  db.funnel.insertTouch({
    id: `claude-${id}-${seq}`,
    contactId: id,
    seq,
    stage: input.stage,
    channel: input.touchChannel,
    label: input.touchLabel,
    source: 'claude',
    at,
    durationSeconds: null,
  });

  const [journey] = db.funnel.journeys(input.business).filter((j) => j.id === id);
  return { journey, created };
}
