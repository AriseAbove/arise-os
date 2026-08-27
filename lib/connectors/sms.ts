import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * Real SMS send via Twilio's REST API using plain `fetch` — no new npm
 * dependency, same choice already made for every other outbound integration
 * in this repo that doesn't need a stateful SDK. Honest-by-default like
 * `lib/connectors/email.ts`: returns `{ ok: false, error }` instead of
 * throwing when credentials are missing or the send fails, never silently
 * pretends a text went out.
 *
 * This is deliberately a SEPARATE credential set from Allo (the AI
 * receptionist's own number/SMS capability) — Allo has no MCP/API connector
 * in this repo at all (confirmed 2026-08-27), so the client tracker's
 * automated "your estimate is ready" texts go out over Twilio, a number
 * Sean provisions specifically for this, not through Allo's line.
 */

export type SmsConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export function parseSmsConfig(env: Record<string, string | undefined>): SmsConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const fromNumber = env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

export async function sendSms(
  to: string,
  body: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = parseSmsConfig(env);
  if (!cfg) return { ok: false, error: 'SMS not configured (set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER in .env.local)' };
  if (!to || to.trim() === '') return { ok: false, error: 'no recipient phone number' };

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
    const params = new URLSearchParams({ To: to, From: cfg.fromNumber, Body: body });
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `Twilio ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function smsStatus(env: Record<string, string | undefined> = process.env): ConnectorStatus {
  const cfg = parseSmsConfig(env);
  if (!cfg) {
    return {
      id: 'sms',
      name: 'SMS (Twilio)',
      kind: 'sms',
      state: 'not_configured',
      detail: 'Not configured. Set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER in .env.local.',
    };
  }
  return {
    id: 'sms',
    name: 'SMS (Twilio)',
    kind: 'sms',
    state: 'connected',
    detail: `Sending from ${cfg.fromNumber}`,
  };
}
