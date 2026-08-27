import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless, signed tokens for the public client-facing job tracker
 * (/track/[token]) — the "Domino's tracker" Sean asked for on 2026-08-27.
 * No new DB column, no login: the token itself IS the auth, so it must be
 * unguessable and only mintable server-side. HMAC-SHA256 over the contact
 * id, base64url-encoded, verified with a constant-time compare.
 *
 * TRACK_TOKEN_SECRET must be set for tokens to mint or verify — there is no
 * dev fallback secret, on purpose: a guessable default would defeat the
 * whole point of a token-as-auth design. Honest-by-default like every other
 * connector in this repo: unconfigured means "doesn't work," never
 * "works but insecurely."
 */

function secretFrom(env: Record<string, string | undefined>): string | null {
  const s = env.TRACK_TOKEN_SECRET;
  return s && s.length > 0 ? s : null;
}

function b64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/** Mint a token for one funnel contact. Returns null if TRACK_TOKEN_SECRET
 *  isn't configured — callers must treat that as "tracker unavailable," not
 *  silently skip signing. */
export function signTrackToken(contactId: string, env: Record<string, string | undefined> = process.env): string | null {
  const secret = secretFrom(env);
  if (!secret) return null;
  const payload = b64url(Buffer.from(contactId, 'utf8'));
  const sig = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Verify a token from a /track/[token] URL. Returns the contact id on a
 *  valid signature, or null on any failure (missing secret, malformed
 *  token, bad signature) — every failure mode collapses to "not found" at
 *  the page level, never a different error that would help someone probe
 *  for valid ids. */
export function verifyTrackToken(token: string, env: Record<string, string | undefined> = process.env): string | null {
  const secret = secretFrom(env);
  if (!secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = createHmac('sha256', secret).update(payload).digest();
    actual = b64urlToBuffer(sig);
  } catch {
    return null;
  }
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;
  try {
    return b64urlToBuffer(payload).toString('utf8');
  } catch {
    return null;
  }
}
