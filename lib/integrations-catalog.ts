import type { ConnectorStatus } from '@/lib/connectors/types';
import {
  INTEGRATION_CATEGORIES,
  type Integration,
  type IntegrationCategory,
} from '@/lib/schemas';

/**
 * The connections marketplace catalog. Larp-first: a rich, honest catalog of
 * popular tools. `connectorId` ties an entry to a real connector so its live
 * "connected" state is never faked; everything else reads as "not connected"
 * with a Connect affordance. Logos resolve from `slug` via lib/brand-logos
 * (simple-icons + a few hand-authored marks + intentional lettermarks).
 */
export const INTEGRATIONS: Integration[] = [
  // Communication
  { slug: 'slack', name: 'Slack', tagline: 'Channels & DMs', category: 'Communication', popular: true },
  { slug: 'gmail', name: 'Gmail', tagline: 'Send & read email', category: 'Communication', connectorId: 'email', popular: true, envKeys: [] },
  { slug: 'whatsapp', name: 'WhatsApp', tagline: 'Messages & broadcasts', category: 'Communication' },
  { slug: 'discord', name: 'Discord', tagline: 'Servers & channels', category: 'Communication' },
  { slug: 'telegram', name: 'Telegram', tagline: 'Chats & bots', category: 'Communication' },
  { slug: 'zoom', name: 'Zoom', tagline: 'Meetings & recordings', category: 'Communication', popular: true },
  { slug: 'manychat', name: 'ManyChat', tagline: 'IG DM automation', category: 'Communication' },
  // Real: lib/connectors/sms.ts sends the text-message leg of the client
  // progress tracker's notifications (2026-08-27) via Twilio's REST API once
  // TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER are set.
  { slug: 'twilio', name: 'Twilio', tagline: 'Outbound SMS notifications', category: 'Communication', connectorId: 'sms', envKeys: [] },

  // Productivity
  { slug: 'notion', name: 'Notion', tagline: 'Docs & databases', category: 'Productivity', popular: true },
  { slug: 'airtable', name: 'Airtable', tagline: 'Bases & records', category: 'Productivity', popular: true },
  { slug: 'googlesheets', name: 'Google Sheets', tagline: 'Read & write spreadsheets', category: 'Productivity' },
  { slug: 'googledocs', name: 'Google Docs', tagline: 'Create & edit documents', category: 'Productivity' },
  { slug: 'clickup', name: 'ClickUp', tagline: 'Docs, tasks & goals', category: 'Productivity' },
  { slug: 'trello', name: 'Trello', tagline: 'Boards & cards', category: 'Productivity' },
  { slug: 'coda', name: 'Coda', tagline: 'Docs that act like apps', category: 'Productivity' },

  // CRM & Sales
  { slug: 'hubspot', name: 'HubSpot', tagline: 'Contacts & deals', category: 'CRM & Sales', popular: true },
  { slug: 'salesforce', name: 'Salesforce', tagline: 'Accounts & pipeline', category: 'CRM & Sales' },
  { slug: 'attio', name: 'Attio', tagline: 'CRM built on data', category: 'CRM & Sales' },
  { slug: 'zendesk', name: 'Zendesk', tagline: 'Tickets & support', category: 'CRM & Sales' },
  { slug: 'intercom', name: 'Intercom', tagline: 'Chat & lifecycle', category: 'CRM & Sales' },
  { slug: 'gohighlevel', name: 'GoHighLevel', tagline: 'Pipeline & contacts', category: 'CRM & Sales' },
  // Real: lib/connectors/allo.ts pulls the (248) 717-1417 call log (Zoey, the
  // AI receptionist) into the AAC pipeline once ALLO_API_KEY is set — the
  // catalog tile was missing entirely before this fix, so a truly-connected
  // Allo connector could never show as "connected" on this board even though
  // /api/connections (and the Home page's 7/7 tally) already counted it.
  { slug: 'allo', name: 'Allo', tagline: 'AI receptionist & call log', category: 'CRM & Sales', connectorId: 'allo' },

  // Developer
  { slug: 'github', name: 'GitHub', tagline: 'Repos, issues & PRs', category: 'Developer', popular: true },
  { slug: 'linear', name: 'Linear', tagline: 'Issues & projects', category: 'Developer' },
  { slug: 'jira', name: 'Jira', tagline: 'Boards & tickets', category: 'Developer' },
  { slug: 'vercel', name: 'Vercel', tagline: 'Deploys & logs', category: 'Developer' },
  { slug: 'sentry', name: 'Sentry', tagline: 'Errors & traces', category: 'Developer' },
  { slug: 'gitlab', name: 'GitLab', tagline: 'Repos & pipelines', category: 'Developer' },

  // Scheduling
  { slug: 'googlecalendar', name: 'Google Calendar', tagline: 'Events & availability', category: 'Scheduling', connectorId: 'calendar', popular: true, envKeys: [] },
  { slug: 'calendly', name: 'Calendly', tagline: 'Booking links', category: 'Scheduling' },
  { slug: 'caldotcom', name: 'Cal.com', tagline: 'Open scheduling', category: 'Scheduling' },
  { slug: 'googlemeet', name: 'Google Meet', tagline: 'Video calls', category: 'Scheduling' },

  // Finance
  { slug: 'stripe', name: 'Stripe', tagline: 'Payments & invoices', category: 'Finance', popular: true },
  { slug: 'quickbooks', name: 'QuickBooks', tagline: 'Bookkeeping & P&L', category: 'Finance', connectorId: 'quickbooks', envKeys: [] },
  { slug: 'xero', name: 'Xero', tagline: 'Accounting & bills', category: 'Finance' },
  { slug: 'paypal', name: 'PayPal', tagline: 'Payments & payouts', category: 'Finance' },
  { slug: 'wise', name: 'Wise', tagline: 'Multi-currency balances', category: 'Finance' },
  { slug: 'plaid', name: 'Plaid', tagline: 'Bank connections', category: 'Finance' },

  // Marketing
  { slug: 'mailchimp', name: 'Mailchimp', tagline: 'Email campaigns', category: 'Marketing' },
  { slug: 'googleanalytics', name: 'Google Analytics', tagline: 'Traffic & conversions', category: 'Marketing' },
  { slug: 'meta', name: 'Meta Ads', tagline: 'Campaigns & audiences', category: 'Marketing' },
  { slug: 'beehiiv', name: 'beehiiv', tagline: 'Newsletter & subscribers', category: 'Marketing' },
  { slug: 'buffer', name: 'Buffer', tagline: 'Schedule social posts', category: 'Marketing' },
  { slug: 'hootsuite', name: 'Hootsuite', tagline: 'Social management', category: 'Marketing' },
  // Phase 6 (corrected): catalog entry only, added ahead of the rest of the
  // integration — lib/connectors/oneup.ts is real (listOneUpAccounts,
  // listOneUpFailedPosts, publishOneUpPost against the documented
  // docs.oneupapp.io REST API), so this tile shows a true connected state
  // once ONEUP_API_KEY is saved via the existing connect flow.
  { slug: 'oneup', name: 'OneUp', tagline: 'Social posts & reviews', category: 'Marketing', connectorId: 'oneup', envKeys: ['ONEUP_API_KEY'] },

  // Storage
  { slug: 'googledrive', name: 'Google Drive', tagline: 'Files & folders', category: 'Storage' },
  { slug: 'dropbox', name: 'Dropbox', tagline: 'Sync & share', category: 'Storage' },
  { slug: 'box', name: 'Box', tagline: 'Content cloud', category: 'Storage' },
  { slug: 'onedrive', name: 'OneDrive', tagline: 'Microsoft files', category: 'Storage' },
  { slug: 'obsidian', name: 'Obsidian', tagline: 'Markdown vault', category: 'Storage' },
  // Real: lib/brain.ts's local-store provider — grep search over the
  // brain-store markdown folder. Ships connected by default (the bundled
  // knowledge/brain-store/ folder), same as the "brain" row in
  // allConnectorStatuses(); this tile was missing before this fix, which is
  // why /integrations could never show more than 4 connected tools even
  // when 7 of 7 real connectors (incl. this one) were live.
  { slug: 'brainstore', name: 'Knowledge Store', tagline: 'Local markdown brain store', category: 'Storage', connectorId: 'brain', envKeys: [] },

  // AI & Automation
  { slug: 'openai', name: 'OpenAI', tagline: 'GPT models & embeddings', category: 'AI & Automation' },
  // Real: lib/connectors/llm.ts drives agent & Conductor chat through the
  // Vercel AI Gateway (default model anthropic/claude-sonnet-5) once
  // AI_GATEWAY_API_KEY is set. Same fix as allo/brainstore above — this tile
  // had no connectorId, so it could never reflect the real "llm" connector.
  { slug: 'anthropic', name: 'Anthropic', tagline: 'Claude models', category: 'AI & Automation', popular: true, connectorId: 'llm', envKeys: ['AI_GATEWAY_API_KEY'] },
  { slug: 'zapier', name: 'Zapier', tagline: 'Automate anything', category: 'AI & Automation' },
  { slug: 'make', name: 'Make', tagline: 'Visual workflows', category: 'AI & Automation' },
  { slug: 'n8n', name: 'n8n', tagline: 'Self-hosted automation', category: 'AI & Automation' },

  // Creative
  { slug: 'figma', name: 'Figma', tagline: 'Design & prototypes', category: 'Creative', popular: true },
  { slug: 'canva', name: 'Canva', tagline: 'Templates & graphics', category: 'Creative' },
  { slug: 'miro', name: 'Miro', tagline: 'Whiteboards & maps', category: 'Creative' },
  { slug: 'loom', name: 'Loom', tagline: 'Screen recordings', category: 'Creative' },
  { slug: 'typeform', name: 'Typeform', tagline: 'Forms & surveys', category: 'Creative' },
];

export type CatalogEntry = Integration & {
  connected: boolean;
  keySaved: boolean;
  /** True only when the linked connector's LIVE status is genuinely
   *  'error' — a stored grant/key exists but the last real API call failed
   *  (e.g. a QuickBooks token that needs reconnecting). Distinct from
   *  `connected: false` on a tool that was never connected at all: before
   *  this field existed, `connected` collapsed 'error' and 'not_configured'
   *  into the same false, so the board (and ConnectFlow) rendered a
   *  previously-working-but-now-broken connector identically to one that
   *  was never touched — throwing away the alarming detail message
   *  (`ConnectorStatus.detail`) along with it. 2026-08-21 fix. */
  error: boolean;
};

/** The env var names the connect flow may write for an entry. Explicit
 *  envKeys win; no envKeys = a generic <SLUG>_API_KEY; [] = guidance only
 *  (the tool connects through something other than a pasted key). */
export function connectKeysFor(entry: Integration): string[] {
  if (entry.envKeys) return entry.envKeys;
  return [`${entry.slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`];
}

/** Merge live connector state onto the catalog. `connected` is true only when a
 *  linked connector actually reports 'connected' — never faked. `keySaved`
 *  means every connect-flow key for the entry sits in .env.local (pass a fresh
 *  readEnvLocal()); a saved key on a connector-less tile shows as stored, not
 *  connected. */
export function connectionCatalog(
  statuses: ConnectorStatus[],
  savedEnv: Record<string, string> = {},
): CatalogEntry[] {
  const byId = new Map(statuses.map((s) => [s.id, s]));
  return INTEGRATIONS.map((i) => {
    const keys = connectKeysFor(i);
    const status = i.connectorId ? byId.get(i.connectorId) : undefined;
    return {
      ...i,
      connected: status?.state === 'connected',
      keySaved: keys.length > 0 && keys.every((k) => Boolean(savedEnv[k])),
      error: status?.state === 'error',
    };
  });
}

/** Catalog grouped by category, in the canonical category order, skipping any
 *  category with no tools. */
export function integrationsByCategory(
  entries: Integration[] = INTEGRATIONS,
): Map<IntegrationCategory, Integration[]> {
  const out = new Map<IntegrationCategory, Integration[]>();
  for (const cat of INTEGRATION_CATEGORIES) {
    const tools = entries.filter((i) => i.category === cat);
    if (tools.length) out.set(cat, tools);
  }
  return out;
}
