import { describe, expect, test } from 'vitest';
import { parseSmsConfig, sendSms, smsStatus } from '@/lib/connectors/sms';

const CONFIGURED = {
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'test-token',
  TWILIO_FROM_NUMBER: '+12485551234',
};

describe('parseSmsConfig', () => {
  test('returns null unless all three env vars are set', () => {
    expect(parseSmsConfig({})).toBeNull();
    expect(parseSmsConfig({ TWILIO_ACCOUNT_SID: 'ACtest' })).toBeNull();
    expect(parseSmsConfig(CONFIGURED)).toEqual({
      accountSid: 'ACtest',
      authToken: 'test-token',
      fromNumber: '+12485551234',
    });
  });
});

describe('smsStatus', () => {
  test('not_configured when unset', () => {
    expect(smsStatus({}).state).toBe('not_configured');
  });
  test('connected when set, and never leaks the auth token in the detail', () => {
    const status = smsStatus(CONFIGURED);
    expect(status.state).toBe('connected');
    expect(status.detail).not.toContain('test-token');
  });
});

describe('sendSms — real HTTP contract, injectable fetch', () => {
  test('honest failure when not configured — never throws', async () => {
    const res = await sendSms('+13135551234', 'hello', {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not configured/);
  });

  test('honest failure with no recipient', async () => {
    const res = await sendSms('', 'hello', CONFIGURED);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/recipient/);
  });

  test('POSTs to the Twilio Messages endpoint with Basic auth and form-encoded body', async () => {
    let seenUrl = '';
    let seenAuth = '';
    let seenBody = '';
    const fakeFetch: typeof fetch = async (url, init) => {
      seenUrl = String(url);
      seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
      seenBody = String(init?.body ?? '');
      return new Response('{}', { status: 201 });
    };
    const res = await sendSms('+13135551234', 'Your estimate is ready', CONFIGURED, fakeFetch);
    expect(res.ok).toBe(true);
    expect(seenUrl).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    expect(seenAuth).toMatch(/^Basic /);
    expect(seenBody).toContain('To=%2B13135551234');
    expect(seenBody).toContain('From=%2B12485551234');
  });

  test('a non-2xx Twilio response is an honest failure with the status in the message', async () => {
    const fakeFetch: typeof fetch = async () => new Response('bad request', { status: 400 });
    const res = await sendSms('+13135551234', 'hi', CONFIGURED, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/400/);
  });

  test('a thrown network error is caught and reported, never propagated', async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error('network unreachable');
    };
    const res = await sendSms('+13135551234', 'hi', CONFIGURED, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/network unreachable/);
  });
});
