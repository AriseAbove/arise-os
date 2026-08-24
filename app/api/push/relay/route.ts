import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { runtimeEnv } from '@/lib/creds';

// The push-relay queue behind Chief of Staff's ntfy notifications
// (2026-08-24). Live diagnosis from Railway's own Console (root shell,
// direct fetch tests) confirmed this service cannot reach ntfy.sh's
// resolved IP at all — general outbound HTTPS is fine (a call to
// api.github.com succeeded in ~40ms), but every connection attempt to
// ntfy.sh's IP hangs and times out, most likely ntfy.sh (a frequently
// abused free service) blocking Railway's shared egress IP range rather
// than anything misconfigured here. Sean's Mac reaches ntfy.sh fine — the
// AAC Brain's own ntfy.py pushes prove it — so lib/agents/real.ts's
// chiefOfStaffRunWith enqueues here (lib/db.ts's pushQueue repo) whenever a
// direct sendNtfyPush attempt fails at the network level, and a small
// LaunchAgent-scheduled poller on the Mac (~/.aac_brain/push_relay.py, same
// pattern as the voice relay behind speaker_daemon.py — see
// project_cowork_speaker_voice_system.md) GETs this route and forwards the
// exact url/title/body to ntfy itself. Gated by PUSH_RELAY_SECRET, same
// bearer pattern as VOICE_RELAY_SECRET (app/api/voice/queue/route.ts).
export const dynamic = 'force-dynamic';

function checkAuth(req: Request): NextResponse | null {
  const secret = runtimeEnv().PUSH_RELAY_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'PUSH_RELAY_SECRET not set — add it to .env.local (and the host env) and to push_relay.py\'s config to enable the push relay queue.',
      },
      { status: 501 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  const item = getDb().pushQueue.popNext(new Date().toISOString());
  return NextResponse.json({ item });
}
