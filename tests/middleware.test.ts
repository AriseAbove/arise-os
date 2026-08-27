import { afterEach, describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

// The one login wall for the whole app (see middleware.ts's comment for the
// 2026-08-15 security-review context: ~40 API routes, only 2 had any auth
// before this). This test locks in three things: fails open honestly when
// unconfigured (never claim protection that isn't set up), enforces once
// configured, and never blocks the two machine-caller routes that already
// carry their own bearer-token auth (cron + voice relay), since neither can
// do an interactive Basic Auth challenge.
describe('middleware — the app-wide Basic Auth wall', () => {
  const prevUser = process.env.APP_BASIC_AUTH_USER;
  const prevPass = process.env.APP_BASIC_AUTH_PASS;

  afterEach(() => {
    if (prevUser === undefined) delete process.env.APP_BASIC_AUTH_USER;
    else process.env.APP_BASIC_AUTH_USER = prevUser;
    if (prevPass === undefined) delete process.env.APP_BASIC_AUTH_PASS;
    else process.env.APP_BASIC_AUTH_PASS = prevPass;
  });

  const req = (path: string, headers: Record<string, string> = {}) =>
    new NextRequest(new URL(path, 'http://test'), { headers });

  test('fails open (no 401) when APP_BASIC_AUTH_USER/PASS are not configured — honest, not silently protected', () => {
    delete process.env.APP_BASIC_AUTH_USER;
    delete process.env.APP_BASIC_AUTH_PASS;
    const res = middleware(req('/finances'));
    expect(res.status).not.toBe(401);
  });

  test('rejects with 401 + WWW-Authenticate when configured and no credentials are supplied', () => {
    process.env.APP_BASIC_AUTH_USER = 'sean';
    process.env.APP_BASIC_AUTH_PASS = 'correct-horse';
    const res = middleware(req('/finances'));
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toMatch(/Basic/);
  });

  test('rejects with 401 when the wrong password is supplied', () => {
    process.env.APP_BASIC_AUTH_USER = 'sean';
    process.env.APP_BASIC_AUTH_PASS = 'correct-horse';
    const badAuth = 'Basic ' + Buffer.from('sean:wrong-password').toString('base64');
    const res = middleware(req('/finances', { authorization: badAuth }));
    expect(res.status).toBe(401);
  });

  test('passes through when the correct username and password are supplied', () => {
    process.env.APP_BASIC_AUTH_USER = 'sean';
    process.env.APP_BASIC_AUTH_PASS = 'correct-horse';
    const goodAuth = 'Basic ' + Buffer.from('sean:correct-horse').toString('base64');
    const res = middleware(req('/finances', { authorization: goodAuth }));
    expect(res.status).not.toBe(401);
  });

  test('never gates the Chief of Staff cron route — it authenticates itself via CRON_SECRET, not Basic Auth', () => {
    process.env.APP_BASIC_AUTH_USER = 'sean';
    process.env.APP_BASIC_AUTH_PASS = 'correct-horse';
    const res = middleware(req('/api/cron/chief-of-staff'));
    expect(res.status).not.toBe(401);
  });

  test('never gates any other agent\'s cron route either — /api/cron/[agentId] is bearer-gated by CRON_SECRET for every real agent, not just Chief of Staff', () => {
    process.env.APP_BASIC_AUTH_USER = 'sean';
    process.env.APP_BASIC_AUTH_PASS = 'correct-horse';
    const res = middleware(req('/api/cron/gmail-worker'));
    expect(res.status).not.toBe(401);
  });

  test('never gates the voice relay route — Sean\'s Mac daemon authenticates via VOICE_RELAY_SECRET, not Basic Auth', () => {
    process.env.APP_BASIC_AUTH_USER = 'sean';
    process.env.APP_BASIC_AUTH_PASS = 'correct-horse';
    const res = middleware(req('/api/voice/queue'));
    expect(res.status).not.toBe(401);
  });

  test('never gates the push relay route — ~/.aac_brain/push_relay.py authenticates via PUSH_RELAY_SECRET, not Basic Auth', () => {
    process.env.APP_BASIC_AUTH_USER = 'sean';
    process.env.APP_BASIC_AUTH_PASS = 'correct-horse';
    const res = middleware(req('/api/push/relay'));
    expect(res.status).not.toBe(401);
  });

  test('never gates the public client tracker — a homeowner has no APP_BASIC_AUTH_USER/PASS; the token in the URL is its own auth', () => {
    process.env.APP_BASIC_AUTH_USER = 'sean';
    process.env.APP_BASIC_AUTH_PASS = 'correct-horse';
    const res = middleware(req('/track/some-token-value'));
    expect(res.status).not.toBe(401);
  });

  test('forwards the request pathname as x-pathname so the root layout can hide dashboard chrome for /track', () => {
    delete process.env.APP_BASIC_AUTH_USER;
    delete process.env.APP_BASIC_AUTH_PASS;
    const res = middleware(req('/track/some-token-value'));
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/track/some-token-value');
  });
});
