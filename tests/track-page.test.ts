import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * The public client tracker (2026-08-27) — source-structure checks in the
 * same style as tests/funnel-page.test.ts, since no DOM-rendering harness
 * is installed in this repo. Behavior (token verify -> journey lookup ->
 * stepper) is covered directly by tests/track-token.test.ts and
 * tests/funnel-track-copy.test.ts; this pins the page actually wires them
 * together and never leaks the internal dashboard around a public page.
 */
describe('app/track/[token]/page.tsx', () => {
  const page = read('app/track/[token]/page.tsx');

  test('verifies the token before ever touching the database', () => {
    expect(page).toMatch(/verifyTrackToken\(params\.token\)/);
  });

  test('an invalid token or an Apps/internal-stage journey both render the same NotFound — never a distinguishing message', () => {
    expect(page).toMatch(/!journey \|\| journey\.business !== 'aac' \|\| !isClientVisibleStage\(journey\.status\)/);
  });

  test('renders in the APEX brand (charcoal/gold/cream), not the internal os.* dashboard theme', () => {
    expect(page).toContain('#1C1A17'); // charcoal
    expect(page).toContain('#B8894A'); // gold
    expect(page).toContain('#F6F4EF'); // cream
    expect(page).not.toMatch(/className="os-/);
  });

  test('construction milestones only render once the job reaches active_project', () => {
    expect(page).toMatch(/showMilestones = journey\.status === 'active_project'/);
  });

  test('the real phone number and no fabricated tagline', () => {
    expect(page).toContain('(248) 717-1417');
    expect(page).not.toContain('Building Excellence');
  });
});

/**
 * app/layout.tsx must never wrap the public tracker in the internal
 * Sidebar/Topbar/CommandPalette/ConductorPanel dashboard chrome — those
 * expose the whole business's nav and pull agent/tool data a homeowner
 * clicking a text-message link has no business seeing.
 */
describe('app/layout.tsx skips dashboard chrome for /track', () => {
  const layout = read('app/layout.tsx');

  test('branches on the forwarded x-pathname header before rendering Sidebar/Topbar', () => {
    expect(layout).toMatch(/isPublicTrackerPath\(pathname\)/);
    expect(layout).toMatch(/\(await headers\(\)\)\.get\('x-pathname'\)/);
  });

  test('the public-tracker branch renders bare body with no Sidebar/Topbar/CommandPalette/ConductorPanel', () => {
    const match = layout.match(/if \(isPublicTrackerPath\(pathname\)\) \{([\s\S]*?)\n  \}/);
    expect(match).not.toBeNull();
    const branch = match![1];
    expect(branch).not.toContain('<Sidebar');
    expect(branch).not.toContain('<Topbar');
    expect(branch).not.toContain('<CommandPalette');
    expect(branch).not.toContain('<ConductorPanel');
  });
});

describe('middleware.ts bypasses Basic Auth for /track and forwards the pathname', () => {
  const middleware = read('middleware.ts');

  test('/track is in BYPASS_PREFIXES', () => {
    expect(middleware).toMatch(/BYPASS_PREFIXES = \[[^\]]*'\/track'/);
  });

  test('every bypass/pass-through path forwards x-pathname via withPathnameHeader', () => {
    expect(middleware).toMatch(/withPathnameHeader/);
  });
});
