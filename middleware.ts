import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// The one login wall for the whole app. Every page and every API route in
// this repo was built honest-by-default (repo-layer, real connector status)
// but NOT auth-by-default — a 2026-08-15 security review found that of the
// ~40 routes under app/api, only two check anything at all (the Chief of
// Staff cron route via CRON_SECRET, and the voice relay via
// VOICE_RELAY_SECRET). Every other route — finances, funnel/CRM, comms
// (including SENDING real email), the /api/keys and
// /api/connections/connect routes that overwrite saved integration
// credentials — was reachable by anyone who had the URL, no password at
// all. This middleware is the fix: a single HTTP Basic Auth gate in front
// of the entire app, so "the URL is public" stops being "the data is
// public."
//
// The routes above keep their own bearer-token auth instead of this
// Basic Auth wall, because their callers are machines (GitHub Actions'
// scheduled cron, Sean's Mac speaker daemon, and Sean's Mac AAC Brain
// heartbeat, all polling/posting over HTTPS) that can't do an interactive
// Basic Auth challenge — they send `Authorization: Bearer <secret>`
// directly, which this middleware would otherwise reject as "not Basic".
//
// Honest-by-default here too: if APP_BASIC_AUTH_USER/PASS aren't set, this
// fails OPEN (matches every other connector's ConnectorStatus pattern in
// this repo — never silently claim protection that isn't configured yet).
// Once both are set, every other route requires them.
//
// `/api/cron` covers every agent's scheduled route (app/api/cron/[agentId]),
// not just Chief of Staff (2026-08-21: every real agent got a real GitHub
// Actions schedule, not only Chief of Staff — see
// .github/workflows/agent-cron-checks.yml). All of them share the same
// CRON_SECRET bearer gate the route itself enforces, so this prefix bypass
// is still just "let the route's own auth run", not a hole.
//
// `/track` is different in kind from the rest of this list: it's not a
// machine caller with its own bearer secret, it's the public client-facing
// job tracker (2026-08-27, "keep the customer in the loop") — a homeowner
// clicking a link in a text/email has no APP_BASIC_AUTH_USER/PASS and never
// should. Its own auth is the token itself: lib/track-token.ts's HMAC-signed
// token in the URL is unguessable and scoped to exactly one contact, so this
// bypass trades "protected by Sean's login" for "protected by knowing the
// specific link", the same trust model as e.g. a Google Calendar share link.
// Never add a route under this prefix that reads or writes anything beyond
// one contact's own client-visible progress.
const BYPASS_PREFIXES = ['/api/cron', '/api/voice/queue', '/api/aac-brain', '/api/push/relay', '/track'];

// Forwards the request pathname as a header so app/layout.tsx's server
// component (no access to next/navigation's usePathname — that's client-only)
// can tell a /track request apart from the internal dashboard and skip
// rendering Sidebar/Topbar/CommandPalette/ConductorPanel around a public
// client-facing page. Purely a rendering decision, not a security boundary
// — the actual gate is the BYPASS_PREFIXES check above/below.
function withPathnameHeader(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set('x-pathname', req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return withPathnameHeader(req);
  }

  const user = process.env.APP_BASIC_AUTH_USER;
  const pass = process.env.APP_BASIC_AUTH_PASS;
  if (!user || !pass) {
    return withPathnameHeader(req);
  }

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    const decoded = atob(auth.slice('Basic '.length));
    const sep = decoded.indexOf(':');
    const suppliedUser = sep === -1 ? decoded : decoded.slice(0, sep);
    const suppliedPass = sep === -1 ? '' : decoded.slice(sep + 1);
    if (suppliedUser === user && suppliedPass === pass) {
      return withPathnameHeader(req);
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ARISE OS"' },
  });
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
