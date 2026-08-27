import { describe, expect, test } from 'vitest';
import { signTrackToken, verifyTrackToken } from '@/lib/track-token';

describe('track-token — stateless HMAC auth for the public /track/[token] page', () => {
  const env = { TRACK_TOKEN_SECRET: 'a-long-random-test-secret' };

  test('a token signed for a contact id verifies back to that same id', () => {
    const token = signTrackToken('fc-123', env);
    expect(token).not.toBeNull();
    expect(verifyTrackToken(token!, env)).toBe('fc-123');
  });

  test('returns null when TRACK_TOKEN_SECRET is not set — no dev fallback secret, by design', () => {
    expect(signTrackToken('fc-123', {})).toBeNull();
    const token = signTrackToken('fc-123', env);
    expect(verifyTrackToken(token!, {})).toBeNull();
  });

  test('rejects a token signed under a different secret', () => {
    const token = signTrackToken('fc-123', env);
    expect(verifyTrackToken(token!, { TRACK_TOKEN_SECRET: 'a-different-secret' })).toBeNull();
  });

  test('rejects a tampered payload (contact id swapped, signature unchanged)', () => {
    const token = signTrackToken('fc-123', env)!;
    const [, sig] = token.split('.');
    const tampered = `${Buffer.from('fc-999', 'utf8').toString('base64url')}.${sig}`;
    expect(verifyTrackToken(tampered, env)).toBeNull();
  });

  test('rejects malformed tokens (no dot, empty, garbage) without throwing', () => {
    expect(verifyTrackToken('not-a-token', env)).toBeNull();
    expect(verifyTrackToken('', env)).toBeNull();
    expect(verifyTrackToken('.sig-only', env)).toBeNull();
    expect(verifyTrackToken('!!!not-base64!!!.also-not', env)).toBeNull();
  });

  test('different contact ids produce different tokens', () => {
    const a = signTrackToken('fc-1', env);
    const b = signTrackToken('fc-2', env);
    expect(a).not.toBe(b);
  });
});
