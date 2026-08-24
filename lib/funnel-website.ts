import type { FounderDb } from '@/lib/db';
import type { WebsiteFormLead } from '@/lib/connectors/website-leads';
import type { FunnelContact, FunnelTouch } from '@/lib/schemas';
import { normalizePhoneKey } from '@/lib/funnel-allo';

/**
 * Website form submissions (FormSubmit.co notification emails) → AAC
 * pipeline. Mirrors lib/funnel-allo.ts's shape deliberately: same
 * idempotent-import contract, same "never move a journey's stage" rule.
 *
 * Identity match is phone-first, email-second — a lead who calls Allo
 * AND fills out the website form (it happens, per leads.json's own
 * history) merges onto one journey instead of creating a duplicate,
 * because both importers key off the same normalized phone.
 */

export type WebsiteImportResult = {
  newContacts: number;
  newTouches: number;
  skipped: number;
};

const touchId = (leadId: string) => `website-form-${leadId}`;

function dedupeKey(lead: Pick<WebsiteFormLead, 'phone' | 'email'>): string | null {
  const phoneKey = normalizePhoneKey(lead.phone);
  if (phoneKey) return `phone:${phoneKey}`;
  if (lead.email) return `email:${lead.email.trim().toLowerCase()}`;
  return null;
}

function contactId(key: string): string {
  return `website-${key.replace(/[^a-z0-9]/gi, '')}`;
}

export function importWebsiteFormLeads(db: FounderDb, leads: WebsiteFormLead[], now: Date): WebsiteImportResult {
  const result: WebsiteImportResult = { newContacts: 0, newTouches: 0, skipped: 0 };

  // One read up front: journeys keyed by normalized phone AND lowercased
  // email (either can find an existing contact from Allo or a prior
  // website submission), plus the set of touch ids already imported.
  const journeys = db.funnel.journeys();
  const byKey = new Map<string, { contact: FunnelContact; touchCount: number }>();
  const seenTouchIds = new Set<string>();
  for (const j of journeys) {
    const { touches, ...contact } = j;
    const phoneKey = normalizePhoneKey(contact.phone);
    const emailKey = contact.email ? contact.email.trim().toLowerCase() : null;
    const entry = { contact, touchCount: touches.length };
    if (phoneKey) byKey.set(`phone:${phoneKey}`, entry);
    if (emailKey) byKey.set(`email:${emailKey}`, entry);
    for (const t of touches) seenTouchIds.add(t.id);
  }

  const today = now.toISOString().slice(0, 10);

  for (const lead of leads) {
    const key = dedupeKey(lead);
    if (!key) {
      result.skipped += 1;
      continue;
    }
    if (seenTouchIds.has(touchId(lead.id))) continue; // already imported

    const at = lead.receivedAt ? lead.receivedAt.slice(0, 10) : today;
    let entry = byKey.get(key);

    if (!entry) {
      const contact: FunnelContact = {
        id: contactId(key),
        name: lead.name,
        business: 'aac',
        status: 'inquiry',
        product: lead.projectType,
        amountUsd: null,
        costUsd: null,
        relationship: 'warm',
        likelihood: 50,
        url: null,
        email: lead.email,
        phone: lead.phone,
        person: lead.name,
        company: null,
        role: null,
        linkedin: null,
        createdAt: at,
      };
      db.funnel.insertContact(contact);
      entry = { contact, touchCount: 0 };
      // Register under BOTH keys when both exist, matching the up-front
      // seeding above — otherwise a later lead for the same person that
      // only matches on the other key would create a duplicate contact.
      const phoneKey = normalizePhoneKey(contact.phone);
      const emailKey = contact.email ? contact.email.trim().toLowerCase() : null;
      if (phoneKey) byKey.set(`phone:${phoneKey}`, entry);
      if (emailKey) byKey.set(`email:${emailKey}`, entry);
      result.newContacts += 1;
    }

    // "Website form: " guarantees the radial view's keyword classifier
    // (lib/funnel-radial.ts) falls back to the Website segment when nothing
    // more specific matches; folding in howFound lets a "Google" or
    // "Referred by a friend" answer promote to the Google/Referral segment
    // instead — the honest, more-specific attribution Sean asked for.
    const parts = [lead.howFound, lead.projectType, lead.address].filter(Boolean);
    const label = `Website form: ${parts.join(' — ') || lead.formSite || 'submission'}`;
    const touch: FunnelTouch = {
      id: touchId(lead.id),
      contactId: entry.contact.id,
      seq: entry.touchCount + 1,
      stage: entry.contact.status, // never advances or regresses the journey
      channel: 'organic',
      label: label.slice(0, 120),
      source: 'website',
      at,
      durationSeconds: null, // no call signal for a form submission
    };
    db.funnel.insertTouch(touch);
    seenTouchIds.add(touch.id);
    entry.touchCount += 1;
    result.newTouches += 1;
  }

  return result;
}
