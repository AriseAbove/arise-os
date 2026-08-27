# Handoff: Client Progress Tracker ("Domino's tracker")

**Date:** 2026-08-27
**Status:** Complete, tested, committed locally. **NOT pushed to any remote** —
this session's git-proxy access to `AriseAbove/arise-os` is read/clone only
(`git push` returns 403 "access denied by the git proxy"), and AGENTS.md's own
house rule is never to push without Sean's explicit yes regardless. This
container is an ephemeral cloud sandbox — its git history will be lost when
the session ends. **A git bundle of this branch's commits was delivered to
Sean directly (SendUserFile) alongside this handoff note** — see
`client-tracker-20260827.bundle` — so the work survives outside this sandbox.
To apply it to a real checkout:

```bash
git fetch /path/to/client-tracker-20260827.bundle 'refs/heads/*:refs/remotes/bundle/*'
git cherry-pick <first-commit>^..<last-commit>   # or: git merge bundle/rebuild/arise-above
```

or simplest: `git bundle verify` then `git pull <bundle-path> rebuild/arise-above`
against a real local clone, review the diff, then push from a session/machine
that actually has push access to `AriseAbove/arise-above`.

## What this is

Sean, 2026-08-27, in his own words: "keeping the customer in the loop even
with the estimating process... something like how Domino's does it... your
pizza is being prepared... going into the oven... step-by-step... keeping
them in the loop as they do each thing as these things get done."

A public, no-login client progress page at `/track/[token]` — a homeowner
clicks a link (from an email or text) and sees exactly where their AAC job
stands, from the walk-through through project completion, including which
construction trade is currently in progress. Built entirely on the existing
`/funnel` pipeline and its own conventions — no new system, no third-party
tool (Buildertrend/CoConstruct/CompanyCam were considered and rejected as the
scoping pass documented earlier this session — see project memory's
`project_funnel_card_convention_20260824.md`).

Full architectural detail lives in `CLAUDE.md`'s "Connectors & agents"
section under **"Client progress tracker — the 'Domino's tracker'
(2026-08-27)"** — read that first, this note is the operational handoff, not
a duplicate of the design writeup.

## What Sean needs to do to turn this on

1. Apply this branch's commits to the real repo (see above) and push.
2. Set four new env vars in Railway (also documented in `.env.example`):
   - `TRACK_TOKEN_SECRET` — any long random string. Without this, no
     `/track` link can ever be minted — the feature silently does nothing
     rather than working insecurely.
   - `PUBLIC_APP_URL` — this app's own Railway URL (e.g.
     `https://<your-railway-domain>`), used to build the link that goes out
     in the notification.
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — only
     needed for the text-message half of the notification. Sean needs a real
     Twilio account and a phone number provisioned there; this is a
     SEPARATE number from Allo's (248) 717-1417 — Allo has no MCP/API
     connector in this repo, so it can't be reused for outbound automated
     texts. Email notifications work today with zero new config, off the
     existing `INBOX_n_*` SMTP setup.
3. That's it — no DB migration step needed beyond the app's own normal
   startup (the new `project_milestones` table is created automatically via
   `CREATE TABLE IF NOT EXISTS` the next time the app opens its DB, same as
   every other table in this schema).

## What Sean will see once it's live

- On `/funnel`, next to every AAC lead's existing "move to stage" control,
  a lead that's reached `active_project` now also shows a "N/14 trades"
  counter with a dropdown to mark the next trade complete
  (`components/MilestoneControl.tsx`).
- Moving a lead through `walkthrough_scheduled` → `estimate_sent` →
  `contract_signed` → `active_project` → `complete_paid`, or marking a
  trade complete, now also fires an email/text to the client (if they have
  an address/phone on file) with a link to their own `/track/[token]` page.
  This is best-effort and honestly reported — a missing phone number, an
  unconfigured Twilio, or a send failure never blocks or fails the stage
  move itself, it just shows up in the API response's `notify` field for
  now (no UI toast wired to it yet — see "What's NOT done" below).

## What's NOT done (deliberately out of scope this pass)

- No UI surfacing of notify failures on `/funnel` itself (e.g. "text failed
  to send" toast) — the API returns the honest result, nothing reads it yet.
- No retry queue for a failed send — same honest-not-yet-automatic gap the
  OneUp failed-posts feature has.
- No way to un-complete a milestone from the UI (the repo layer supports
  overwriting a milestone's date, but there's no "undo" button — correcting
  a mistake today means marking it complete again with today's date, which
  is what the idempotent-by-milestone-id design already allows).
- The tracker page shows the 5 sales-pipeline steps and, once
  `active_project`, all 14 possible construction trades — but doesn't yet
  let Sean pick which subset of the 14 actually apply to a given job (a
  bathroom-only job will show HVAC rough as "upcoming" forever if it's
  never a real step in that job). This was a known open question in the
  original scoping pass and is still open — Sean may want a lightweight
  "which trades does this job need" setting before this ships to a real
  client, or may prefer to just let untouched trades stay honestly
  "upcoming" and rely on the 5-step sales stepper as the primary signal
  once a job is active. Worth a quick conversation before the first real
  client gets a link.

## Testing

`npm test && npm run typecheck` — both green (1291 tests, 134 files).
`npm run build` was NOT verified end-to-end in this sandbox: this
container's network egress blocks `fonts.googleapis.com` outright (a sandbox
restriction, confirmed unrelated to this feature — the pre-existing
`JetBrains_Mono` `next/font/google` call in `app/layout.tsx`'s main branch
hits the identical fetch failure), so `next build` fails at the font-fetch
step here regardless of any change in this branch. Railway's production
network is not this constrained (the app already builds and deploys there
today with the same `next/font/google` call), so this is very likely a
sandbox-only limitation — but it was not independently verified against
Railway's actual network from this session, so treat `npm run build` as
worth re-confirming once these commits land somewhere with real network
access, before the first production deploy.
