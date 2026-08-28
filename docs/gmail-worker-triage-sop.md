# Gmail Worker — Junk Triage SOP: "Zero-Scan, High-Confidence Quarantine"

Originally approved by Sean Davis via a Claude/Cowork session, 2026-08-28.
Rewritten the same day, after the dry-run stage's first real results, to
Sean's "Zero-Scan, High-Confidence Quarantine" model below — this document
replaces the original three-bucket (junk/review/not_junk) spec entirely.
This is the spec `lib/mail-triage.ts` (classifier) and
`lib/connectors/email-triage.ts` (IMAP runner) implement — see those files
for the actual code and `lib/seed.ts`'s `sop-gmail-worker` entry for what
`/sops` shows.

## Why this exists

Sean's own framing: a structured, deterministic procedure — not an LLM
"improvising" case by case — is what keeps this agent's error rate down.
Nothing in this pipeline is an LLM judgment call. Every verdict comes from
a fixed set of rules and a fixed point value per signal; the same message
produces the same verdict every single time, and that logic is exactly
what's written below and in `lib/mail-triage.ts`.

## Inboxes in scope

- AAC mailbox (`INBOX_1` / `inbox-1`)
- `seanadavis0@gmail.com` (`INBOX_2` / `inbox-2`)
- `1solutionsgroup1@gmail.com` (`INBOX_3` / `inbox-3`)

`MAIL_TRIAGE_LIVE_INBOXES` scopes which of these may actually move mail in
`live` mode, independent of which inboxes are scanned/classified/logged —
see Rollout below.

## The model

Every unread message is either fast-pathed (bypasses scoring entirely) or
scored 0-100 for junk-confidence, then bucketed:

| Confidence | Verdict | Action (live mode) |
|---|---|---|
| >= 95% | **Trash** | Moved straight to Trash, capped at `MAIL_TRIAGE_MAX_MOVES`/run (default 20) |
| 60-94% | **Quarantine** | Moved to a "Quarantine" mailbox (created automatically), capped at `MAIL_TRIAGE_MAX_QUARANTINE`/run (default 50). No alert, no ping — silent. |
| < 60% | **Protected** | Left exactly where it is, in the inbox |

**Fast-path safety (checked first, always wins, never scored):** a known
CRM/funnel contact, an existing conversation thread, a starred message, a
message with an attachment, or a subject mentioning a client/project
keyword (203k, permit, draw schedule, estimate, invoice, walkthrough,
contract, change order, punch list, proposal) bypasses junk scoring
entirely — these signals are never even evaluated.

### Confidence scoring (deterministic — see `lib/mail-triage.ts::junkConfidence`)

| Signal | Score |
|---|---|
| Mail host's own spam flag set (`X-Spam-Flag: YES`) | 97 (Trash) |
| Subject matches the high-precision scam-phrase list | 96 (Trash) |
| `List-Unsubscribe` header present, no prior contact | 75 (Quarantine) |
| None of the above | 0 (Protected) |

The scam-phrase list (`lib/mail-triage.ts`'s `SCAM_KEYWORDS`) is
deliberately narrow — phrases with very low legitimate-use rates only
("wire transfer immediately", "you have won", "verify your account
immediately", etc.) — never generic marketing language, since a false
match here trashes a real email outright.

## Quarantine expiry — the silent safety net

A message that lands in Quarantine and is never rescued releases itself to
**Trash** (never a permanent/expunge delete) after
`MAIL_TRIAGE_QUARANTINE_DAYS` (default 14). This is Sean's own design:

> I will no longer review daily digests. The quarantine folder will serve
> as a silent safety net if a missing email is ever brought up.

Practical effect: nothing pings Sean about what's in Quarantine, ever. If a
client ever says "did you get my email?", the Quarantine folder (viewable
directly in Gmail, any time, within the 14-day window) is the place to
check before anything's gone for good. After 14 days it moves to Trash,
where Gmail's own 30-day Trash retention is the last word — this codebase
never expunges a message itself, in Quarantine or in Trash.

The expiry sweep matches by the message's Message-ID header, not IMAP
UID — a UID is only valid within the mailbox that issued it, and the same
message gets an entirely new UID the moment it's moved into Quarantine. A
row with no recorded Message-ID, or a Trash-move that fails, stays pending
and is retried on the next run rather than silently dropped.

## Workflow

1. Poll each configured IMAP inbox for unread counts and recent mail
   (existing behavior, unchanged).
2. Report per-inbox connection errors immediately (existing behavior,
   unchanged).
3. **Fast-path check** — evaluate the five bypass criteria first. Any match
   -> **Protected**, scoring never runs.
4. **Score** — compute junk-confidence for everything else.
5. **Bucket & act** (live mode only; `dry_run` classifies and logs but
   never moves anything):
   - `>= 95` -> move to Trash, capped per run.
   - `60-94` -> move to Quarantine (created on first use), capped per run,
     silently.
   - `< 60` -> leave in the inbox.
6. **Quarantine expiry sweep** (live mode only) — release anything past
   `MAIL_TRIAGE_QUARANTINE_DAYS` to Trash, matched by Message-ID.
7. Log every message evaluated — sender, subject, inbox, confidence,
   verdict, whether it moved, timestamp — to `mail_triage_log`
   (append-only). Sean does not review this table routinely by design; it
   exists as the real, unedited history.

## Non-negotiable circuit breakers

- **Never a permanent delete** — Trash only, at every stage (initial junk
  move and quarantine expiry alike). Gmail's own 30-day Trash retention is
  the final word; this codebase never expunges a message itself.
- **Batch rate limits** — `MAIL_TRIAGE_MAX_MOVES` (Trash, default 20) and
  `MAIL_TRIAGE_MAX_QUARANTINE` (Quarantine moves and quarantine-expiry
  releases, sharing one cap, default 50) per run.
- **Real folders only** — Trash is found via the IMAP `\Trash` special-use
  flag, never a guessed name. Quarantine is created via IMAP `CREATE` on
  first use (idempotent — a second run finds the existing folder rather
  than erroring). If either folder can't be reached, the affected verdicts
  are still classified and logged, but nothing moves.
- **Scoped rollout** — `MAIL_TRIAGE_LIVE_INBOXES` restricts which inboxes
  may actually move mail in live mode.
- **No alerts, ever** — nothing in this pipeline pushes a notification,
  digest, or ping about a triage decision. The Quarantine folder itself is
  the safety net.
- **Deterministic, not an LLM judgment** — every score comes from a fixed
  point value on a specific signal (see the table above). No model
  "decides" anything on this path.

## Post-triage extraction + drafting (added 2026-08-29)

A second, separate stage layered on top of the triage above — never
touching, and never re-deciding, the junk verdict itself. Off by default
(`MAIL_EXTRACTION_ENABLED` unset). When enabled, it runs once per message,
only on messages this same pass already classified `protected`:

- `lib/mail-extraction.ts` parses intent (lead / permit_inspection /
  sub_bid / bank_draw / client_update / general), project address, dollar
  amount, draw #, and invoice # using fixed regex/keyword patterns — the
  same "deterministic, not an LLM judgment" discipline as the junk scorer
  above. A field the patterns can't confidently match comes back `null`
  and is rendered as "not found," never guessed, never defaulted to 0 or
  a blank string standing in for "unknown."
- `lib/mail-drafts.ts` builds a short executive summary and a proposed
  reply from those extracted fields — templated, not free-text generated,
  and it only ever references a field that was actually found.
- Both are logged to `mail_extractions`/`mail_drafts` (see
  `MailExtractionSchema`/`MailDraftSchema` in `lib/schemas.ts`).
- **Strict human-in-the-loop, no exceptions:** every draft is created in
  `pending` status. The only way a draft moves to `approved`/`edited`/
  `rejected` — and the only way `sendEmailReply` is ever called on
  agent-generated text — is a real person hitting
  `POST /api/comms/approve-draft`. There is no auto-send path at any
  confidence level.
- The reply-to address and subject used when sending are looked up
  server-side from `mail_triage_log` (keyed by Message-ID) — the real,
  triage-verified sender for that message — never taken from the request
  body, so a caller can't redirect a send to an arbitrary address.
- `/comms`'s "Drafts" tab (added 2026-08-28) is the human review surface for
  this queue — every `pending` draft shown with its extracted fields,
  summary, and proposed reply, each with Approve & send / Edit / Reject.
  All three call the same `POST /api/comms/approve-draft` route above; the
  UI adds no new way to send anything.
- **No LLM anywhere in this stage, so no per-message API cost.** Both the
  extraction step and the drafting step are regex/keyword matching and
  string templating — the same discipline as the junk scorer earlier in
  this doc. Enabling `MAIL_EXTRACTION_ENABLED` does not add any model or
  external API spend.

## What's NOT in scope

No LLM review of ambiguous mail anywhere in this pipeline — the junk
scorer and the extraction/drafting stage above are both fully
deterministic. No auto-send at any confidence level; a drafted reply is
always one explicit human approval away from actually going out.
