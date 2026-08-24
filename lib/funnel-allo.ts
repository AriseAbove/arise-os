import type { FounderDb } from '@/lib/db';
import type { AlloCall } from '@/lib/connectors/allo';
import type { FunnelContact, FunnelTouch } from '@/lib/schemas';
import { scoreFromTouches } from '@/lib/funnel-score';

/**
 * Allo call log → AAC pipeline. Every legitimate inbound call to
 * (248) 717-1417 either opens a new journey at `inquiry` or lands as a new
 * touch on the caller's existing journey — the funnel's front door, fed by
 * the phone that actually rings.
 *
 * Rules, deliberately conservative:
 *  - inbound calls only (outbound legs are Sean calling back — the journey
 *    already exists or he'll create it knowingly)
 *  - spam stays out (Zoey kills most of it live; the importer drops the rest)
 *  - idempotent by Allo call id — re-syncing never duplicates anything
 *  - a call NEVER changes a journey's stage; stage moves are Sean's call
 */

/** 10-digit US number key: strips formatting and a leading country 1. */
export function normalizePhoneKey(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return ten.length === 10 ? ten : null;
}

function formatPhone(key: string): string {
  return `(${key.slice(0, 3)}) ${key.slice(3, 6)}-${key.slice(6)}`;
}

/** Instant hangups with nothing collected, or calls Allo itself flags. */
export function looksLikeSpam(call: AlloCall): boolean {
  const result = (call.result ?? '').toLowerCase();
  if (/spam|block|robo/.test(result)) return true;
  if (call.summary === null && call.durationSeconds !== null && call.durationSeconds < 10) return true;
  return false;
}

export type AlloImportResult = {
  newContacts: number;
  newTouches: number;
  skipped: number;
};

const touchId = (callId: string) => `allo-call-${callId}`;

export function importAlloCalls(db: FounderDb, calls: AlloCall[], now: Date): AlloImportResult {
  const result: AlloImportResult = { newContacts: 0, newTouches: 0, skipped: 0 };

  // One read up front: journeys keyed by normalized phone + the set of touch
  // ids already imported (idempotency).
  const journeys = db.funnel.journeys();
  const byPhone = new Map<string, { contact: FunnelContact; touchCount: number }>();
  const seenTouchIds = new Set<string>();
  for (const j of journeys) {
    const { touches, ...contact } = j;
    const key = normalizePhoneKey(contact.phone);
    if (key && !byPhone.has(key)) byPhone.set(key, { contact, touchCount: touches.length });
    for (const t of touches) seenTouchIds.add(t.id);
  }

  const today = now.toISOString().slice(0, 10);

  for (const call of calls) {
    const phoneKey = normalizePhoneKey(call.from);
    if (call.direction !== 'inbound' || !phoneKey || looksLikeSpam(call)) {
      result.skipped += 1;
      continue;
    }
    if (seenTouchIds.has(touchId(call.id))) continue; // already imported

    const at = call.startedAt?.slice(0, 10) ?? today;
    let entry = byPhone.get(phoneKey);

    if (!entry) {
      const contact: FunnelContact = {
        id: `allo-${phoneKey}`,
        name: call.contactName ?? formatPhone(phoneKey),
        business: 'aac',
        status: 'inquiry',
        product: null,
        amountUsd: null,
        costUsd: null,
        relationship: 'warm',
        likelihood: 50,
        url: null,
        email: null,
        phone: call.from,
        person: call.contactName,
        company: null,
        role: null,
        linkedin: null,
        createdAt: at,
      };
      db.funnel.insertContact(contact);
      entry = { contact, touchCount: 0 };
      byPhone.set(phoneKey, entry);
      result.newContacts += 1;
    }

    const touch: FunnelTouch = {
      id: touchId(call.id),
      contactId: entry.contact.id,
      seq: entry.touchCount + 1,
      stage: entry.contact.status, // never advances or regresses the journey
      channel: 'call',
      label: call.summary ? call.summary.slice(0, 120) : 'Inbound call (no summary)',
      source: 'allo',
      at,
      durationSeconds: call.durationSeconds, // real signal for lib/funnel-score.ts
    };
    db.funnel.insertTouch(touch);
    seenTouchIds.add(touch.id);
    entry.touchCount += 1;
    result.newTouches += 1;
  }

  // Recompute every AAC lead's score (relationship + likelihood) from its
  // full touch history — not just contacts touched by this batch. Two
  // reasons this has to be a full sweep, not just the calls processed
  // above: (1) durationSeconds is a new field (see lib/schemas.ts) — a lead
  // imported before this shipped needs re-scoring even on a sync with zero
  // new calls for it, and (2) a repeat-caller pattern only becomes visible
  // once enough of a number's calls have landed, which may span several
  // syncs. Cheap at today's scale (low hundreds of leads); idempotent — a
  // no-op sync just re-verifies scores that already match. This never
  // touches `status` (see the "never advances or regresses" rule above) —
  // only relationship/likelihood, which were never a human decision the way
  // stage is.
  for (const j of db.funnel.journeys('aac')) {
    const score = scoreFromTouches(j.touches);
    if (score.relationship !== j.relationship || score.likelihood !== j.likelihood) {
      const { touches: _touches, ...contact } = j;
      db.funnel.insertContact({ ...contact, ...score });
    }
  }

  return result;
}
