import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /funnel business-lens contract (2026-08-21 fix): switching to APPS used to
 * still drive both canvases (flow + radial) off AAC_FUNNEL_STAGES — the
 * summary/space/radial models all defaulted to the AAC backbone regardless
 * of which business tab was selected. Apps has zero live journeys today, so
 * this was invisible (empty nodes short-circuited before any hub rendered),
 * but the model was wrong the moment a real Apps journey landed. Fixed by
 * threading `stagesFor(business)` through every model call on the page.
 */
describe('/funnel wires the selected business into every stage model', () => {
  const page = read('app/funnel/page.tsx');

  test('funnelSummary is scoped to the selected business, not left on the AAC default', () => {
    expect(page).toMatch(/funnelSummary\(\s*journeys\s*,\s*stagesFor\(business\)\s*\)/);
  });

  test('funnelSpaceModel (the flow canvas) is scoped to the selected business', () => {
    expect(page).toMatch(/funnelSpaceModel\(\s*journeys\s*,\s*now\s*,\s*stagesFor\(business\)\s*\)/);
  });

  test("the flow canvas receives the real stage set as a prop, not FunnelSpace's AAC-only default", () => {
    expect(page).toMatch(/<FunnelSpaceLazy[^>]*stages=\{stagesFor\(business\)\}/);
  });

  test('radial stays AAC-only — Apps has no acquisition-wedge data to render, so the toggle is disabled for it rather than mislabeling', () => {
    // the layout is forced off radial when Apps is selected, whatever the ?layout= param says
    expect(page).toMatch(/business === 'apps'[^;]*\?\s*'flow'/);
  });
});

/**
 * /funnel's own ?business= toggle used to be a completely disconnected
 * mechanism from the Topbar's shared cookie (lib/business-filter.ts) — with
 * no ?business= param the page always defaulted to the "All clients" tab,
 * so switching the Topbar's AAC/Apps/Combined selector while already on
 * /funnel did nothing (2026-08-21 fix). Fixed by falling back to the
 * cookie's current value only when the query param is genuinely absent —
 * an explicit ?business= (even an invalid one) still wins, so bookmarking
 * or deep-linking a specific view keeps working exactly as before.
 */
describe('/funnel defaults to the shared Topbar cookie when no ?business= param is present', () => {
  const page = read('app/funnel/page.tsx');

  test('reads the shared cookie via lib/business-filter(-server)', () => {
    expect(page).toMatch(/import\s*\{\s*resolveBusinessFilter\s*\}\s*from\s*'@\/lib\/business-filter'/);
    expect(page).toMatch(/import\s*\{\s*readBusinessFilterCookie\s*\}\s*from\s*'@\/lib\/business-filter-server'/);
    expect(page).toMatch(/resolveBusinessFilter\(await readBusinessFilterCookie\(\)\)/);
  });

  test('falls back to the cookie only when ?business= is absent, never overriding an explicit param', () => {
    expect(page).toMatch(/businessParam\s*===\s*undefined\s*&&\s*cookieFilter\s*!==\s*'all'\s*\?\s*cookieFilter/);
  });
});
