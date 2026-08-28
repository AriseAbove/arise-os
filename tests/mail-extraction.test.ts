import { describe, expect, test } from 'vitest';
import { extractFields, extractMailData, type ExtractionInput } from '@/lib/mail-extraction';

describe('extractFields — strict honesty on ambiguous input', () => {
  test('vague text with no confident signal returns all-null fields and general intent', () => {
    const result = extractFields('Question', 'Send the draw info when you get a chance, thanks.');
    expect(result.drawNumber).toBeNull();
    expect(result.dollarAmount).toBeNull();
    expect(result.projectAddress).toBeNull();
    expect(result.invoiceNumber).toBeNull();
    expect(result.intent).toBe('general');
    expect(result.confidence).toBe(0);
  });

  test('a run-on sentence mentioning a number and a street-suffix word is not misread as an address', () => {
    // Adversarial case: a naive "digit ... suffix word" pattern with no gap
    // limit would false-match "12 crew members on Main Street" here even
    // though this sentence has nothing to do with a project address.
    const result = extractFields('Update', 'We had 12 crew members on Main Street today working the job.');
    expect(result.projectAddress).toBeNull();
  });

  test('a bare number is never mistaken for a dollar amount without a $ sign', () => {
    const result = extractFields('Update', 'We finished 18500 square feet of drywall today.');
    expect(result.dollarAmount).toBeNull();
  });
});

describe('extractFields — structured parsing of a clean, well-formed message', () => {
  test('pulls exact address, draw number, and dollar amount from a clear 203k draw email', () => {
    const result = extractFields(
      '203k Draw Request',
      'Attached is inspection report for 742 Evergreen Ave requesting Draw #2 for $18,500.',
    );
    expect(result.projectAddress).toBe('742 Evergreen Ave');
    expect(result.drawNumber).toBe(2);
    expect(result.dollarAmount).toBe(18500);
    expect(result.intent).toBe('bank_draw');
    expect(result.invoiceNumber).toBeNull();
    expect(result.confidence).toBe(80);
  });

  test('parses an invoice number and classifies as a general/sub_bid style message', () => {
    const result = extractFields('Invoice attached', 'Please see Invoice #INV-4521 attached for the completed work.');
    expect(result.invoiceNumber).toBe('INV-4521');
  });

  test('classifies permit/inspection intent from keyword match', () => {
    const result = extractFields('Permit update', 'The city inspector needs to schedule a permit inspection next week.');
    expect(result.intent).toBe('permit_inspection');
  });

  test('classifies a new lead inquiry', () => {
    const result = extractFields('New project', 'Hi, I am interested in getting a quote for my kitchen remodel.');
    expect(result.intent).toBe('lead');
  });

  test('classifies a client status check-in', () => {
    const result = extractFields('Checking in', 'Just wanted to update — any update on when the tile work will start?');
    expect(result.intent).toBe('client_update');
  });
});

describe('extractMailData — wraps extractFields with id/messageId/inboxId/extractedAt', () => {
  const input: ExtractionInput = {
    messageId: '<abc123@mail.example.com>',
    inboxId: 'inbox-1',
    subject: '203k Draw Request',
    bodyText: 'Requesting Draw #2 for $18,500 at 742 Evergreen Ave.',
  };

  test('builds a stable id from inboxId + messageId and stamps extractedAt', () => {
    const fixedNow = () => new Date('2026-08-29T12:00:00.000Z');
    const result = extractMailData(input, fixedNow);
    expect(result.id).toBe('inbox-1-<abc123@mail.example.com>');
    expect(result.messageId).toBe(input.messageId);
    expect(result.inboxId).toBe('inbox-1');
    expect(result.extractedAt).toBe('2026-08-29T12:00:00.000Z');
    expect(result.drawNumber).toBe(2);
  });
});
