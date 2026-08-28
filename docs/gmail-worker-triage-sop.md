# Gmail Worker — Triage + Junk Removal SOP (approved 2026-08-28)

Approved by Sean Davis via a Claude/Cowork session, 2026-08-28. This is the
spec `lib/mail-triage.ts` (classifier) and `lib/connectors/email-triage.ts`
(IMAP runner) implement — see those files for the actual code and
`lib/seed.ts`'s `sop-gmail-worker` entry for what `/sops` shows.

## Inboxes in scope

- Phase 1 & 2: AAC mailbox (`INBOX_1` / `inbox-1`)
- Phase 3: `seanadavis0@gmail.com` (`INBOX_2` / `inbox-2`),
  `1solutionsgroup1@gmail.com` (`INBOX_3` / `inbox-3`)

## Rollout & execution safeguards

1. **Dry-run stage** — 3 days on the AAC mailbox with zero physical moves;
   every verdict logged to `mail_triage_log` for human review
   (`MAIL_TRIAGE_MODE=dry_run`).
2. **AAC live stage** — turn on active trashing on the AAC mailbox, capped at
   20 items/cycle (`MAIL_TRIAGE_MODE=live`, `MAIL_TRIAGE_LIVE_INBOXES=inbox-1`).
3. **Personal accounts expansion** — activate `inbox-2` and `inbox-3` under
   the same 20-item/cycle cap once the AAC live stage has been reviewed
   (drop or widen `MAIL_TRIAGE_LIVE_INBOXES`).

## Workflow

1. Poll each configured IMAP inbox for unread counts and recent mail.
2. Report per-inbox connection errors immediately (existing behavior,
   unchanged).
3. **Fast-path exclusion check** — evaluate exclusion criteria first. If
   matched, mark **not_junk** immediately.
4. **Junk check** — if zero exclusions match, evaluate junk criteria.
5. **Classify & act**:
   - **not_junk** — feed into the unified `/comms` timeline.
   - **junk** — move to Trash only if in `live` mode, the inbox is in scope,
     a real `\Trash`-flagged mailbox was found, and the per-run cap hasn't
     been hit.
   - **review** (no exclusion, no confident junk signal) — leave in the
     inbox untouched.
6. Log every message evaluated — sender, subject, inbox, timestamp, matched
   rule, action taken — to `mail_triage_log` (append-only).

## Criteria & safety controls

### Exclusion criteria (evaluated first — never move)

- Sender already known (a funnel/CRM contact with this email)
- Part of an existing thread (envelope `In-Reply-To` present)
- Starred/flagged by a person
- Has an attachment
- Subject mentions a client/project keyword (203k, permit, draw, estimate,
  invoice, walkthrough, contract, change order, punch list, proposal)

### Junk criteria (needs ≥1 match, and zero exclusions)

- Mail host's own spam flag is set (`X-Spam-Flag: YES`)
- Subject matches a known scam phrase (high-precision list only — see
  `lib/mail-triage.ts`'s `SCAM_KEYWORDS`)
- `List-Unsubscribe` header present with no prior thread/known-sender match

### Non-negotiable circuit breakers

- **Trash only** — never a permanent delete; Gmail's 30-day recovery window
  applies.
- **Batch rate limit** — `MAIL_TRIAGE_MAX_MOVES` per run (default 20).
- **Real folder only** — if no `\Trash`-flagged mailbox is found, junk is
  still classified and logged, but nothing moves (`trashUnavailable: true`
  on the result) rather than guessing a folder name.
- **Scoped rollout** — `MAIL_TRIAGE_LIVE_INBOXES` restricts which inboxes may
  actually move mail in live mode, independent of which inboxes are being
  scanned/classified.
- **Ambiguous → review, never junk** — a message matching neither list is
  left alone.

## What's NOT in scope (yet)

No auto-reply, no auto-archiving of non-junk mail, no priority tagging. This
SOP covers exactly one new behavior: junk detection and move-to-Trash.
