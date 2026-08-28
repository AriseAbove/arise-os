import { CalendarDays, Mail, Phone, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CommsTabs } from '@/components/CommsTabs';
import { gatherCommsFeed } from '@/lib/comms-feed';
import { annotatePriorities } from '@/lib/comms';
import { DEFAULT_WORK_KEYWORDS, parseWorkKeywords } from '@/lib/comms-gravity';
import { emailStatus } from '@/lib/connectors/email';
import { calendarStatus, caldavAccounts, upcomingEvents } from '@/lib/connectors/gcal';
import { alloStatus } from '@/lib/connectors/allo';
import { getDb } from '@/lib/data';
import { pendingDraftReviews } from '@/lib/mail-draft-review';
import { Badge, Dot, SectionHead } from '@/components/terminal';

export const dynamic = 'force-dynamic';

const SOURCE_ICON: Record<string, LucideIcon> = {
  email: Mail,
  calendar: CalendarDays,
  allo: Phone,
};

export default async function CommsPage() {
  const [rawFeed, email, calendar, allo, weekEvents] = await Promise.all([
    gatherCommsFeed(),
    emailStatus(),
    calendarStatus(),
    alloStatus(),
    upcomingEvents(undefined, { days: 7, limit: 200 }),
  ]);
  const db = getDb();
  const tags = db.contactTags.all();
  const feed = annotatePriorities(rawFeed, tags);
  // Gmail Worker's post-triage drafts awaiting a human decision (see
  // lib/mail-draft-review.ts) — read fresh on every load since this page is
  // force-dynamic, same as the rest of /comms.
  const drafts = pendingDraftReviews(db);
  // Generic defaults ship in code; the operator's real work brands live in
  // COMMS_WORK_KEYWORDS (.env.local, gitignored) so they never reach the repo.
  const workKeywords = [...DEFAULT_WORK_KEYWORDS, ...parseWorkKeywords(process.env.COMMS_WORK_KEYWORDS)];
  const calLegend = caldavAccounts().map((a) => ({ name: a.name, color: a.color }));
  const nowISO = new Date().toISOString();
  // Allo (the (248) 717-1417 call/SMS line) sits alongside email and
  // calendar here — it used to be invisible on this page even though calls
  // land as real feed items below (see lib/comms-feed.ts), which meant Sean
  // had to check /funnel separately to see whether the phone channel was
  // even connected.
  const sources = [email, calendar, allo];
  const connectedSources = sources.filter((s) => s.state === 'connected').length;
  // The real, unbounded mailbox unread count — straight from IMAP's STATUS
  // (UNSEEN) per configured inbox (lib/connectors/email.ts's unreadCounts),
  // same number /integrations shows on the Gmail tile. NOT the same as
  // "unread among the feed" below: gatherCommsFeed() only fetches the 15
  // most-recent envelopes per inbox for the live feed UI, so summing that
  // list's unread flags silently under-counts by orders of magnitude
  // whenever the real backlog is bigger than the feed's fetch cap. Every
  // "unread" figure on this page reads from this one real number so they
  // can never disagree with each other or with /integrations again.
  const totalUnread = typeof email.meta?.unread === 'number' ? email.meta.unread : 0;

  return (
    <div>
      <PageHeader
        eyebrow="unified inbox"
        title="Comms"
        right={<Badge tone="accent">{totalUnread.toLocaleString()} unread</Badge>}
      />

      {/* Source status row */}
      <section className="mb-7">
        <SectionHead label="Sources" count={`${connectedSources}/${sources.length} connected`} />
        <div className="grid gap-3 sm:grid-cols-3">
          {sources.map((source) => {
            const Icon = SOURCE_ICON[source.id] ?? Mail;
            const ok = source.state === 'connected';
            return (
              <div key={source.id} className="hoverable rounded-lg-t border border-os-border bg-os-surface px-4 py-3.5">
                <div className="flex items-center gap-[9px]">
                  <Icon className={`h-[15px] w-[15px] shrink-0 ${ok ? 'text-os-accent' : 'text-os-dim'}`} strokeWidth={1.7} />
                  <span className="text-[13px] font-semibold">{source.name}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {ok && <Dot state="connected" pulse />}
                    <Badge
                      tone={ok ? 'ok' : source.state === 'error' ? 'err' : 'default'}
                      ghost={source.state === 'not_configured'}
                    >
                      {ok ? 'Connected' : source.state === 'error' ? 'Error' : 'Not configured'}
                    </Badge>
                  </span>
                </div>
                <p className="mt-[9px] font-mono text-[10.5px] leading-relaxed text-os-dim">{source.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Swappable front: messaging feed (default) ↔ 7-day meetings calendar */}
      <CommsTabs
        feed={feed}
        tags={tags}
        events={weekEvents}
        accounts={calLegend}
        nowISO={nowISO}
        workKeywords={workKeywords}
        totalUnread={totalUnread}
        drafts={drafts}
      />

      {/* Honest per-channel status. Real configured-inbox count, not a
          hardcoded "4" (the slot capacity, not what's actually wired up) —
          the Sources card above already computes the true number honestly,
          so this line has to match it. Allo (calls + SMS) reads its own real
          ConnectorStatus the same way, never a hardcoded claim either way —
          it used to be entirely absent from this line even though it's
          Sean's actual primary lead-intake channel. */}
      <p className="mt-4 rounded-md-t border border-dashed border-os-border-strong px-3 py-3 text-center font-mono text-[10.5px] text-os-dim">
        {email.meta?.configured ?? 0} of {email.meta?.slots ?? 4} IMAP inbox slots configured · calendar via CalDAV ·
        Allo calls + SMS {allo.state === 'connected' ? 'connected' : allo.state === 'error' ? 'error' : 'not configured'}{' '}
        — one operator feed
      </p>
    </div>
  );
}
