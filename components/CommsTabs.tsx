'use client';

import { useState } from 'react';
import { CalendarDays, MessageSquare, Sparkles } from 'lucide-react';
import { CommsGravity } from '@/components/CommsGravity';
import { WeekCalendar } from '@/components/WeekCalendar';
import { CommsDrafts } from '@/components/CommsDrafts';
import type { CommsItem } from '@/lib/comms';
import type { ContactTag } from '@/lib/schemas';
import type { CalEvent } from '@/lib/connectors/gcal';
import type { DraftReview } from '@/lib/mail-draft-review';

type Tab = 'messaging' | 'meetings' | 'drafts';
type Account = { name: string; color: string };

/** The front of /comms: a swappable view between the message feed (default),
    the 7-day meetings calendar, and the Gmail Worker draft review queue. */
export function CommsTabs({
  feed,
  tags,
  events,
  accounts,
  nowISO,
  workKeywords = [],
  totalUnread,
  drafts,
}: {
  feed: CommsItem[];
  tags: ContactTag[];
  events: CalEvent[];
  accounts: Account[];
  nowISO: string;
  workKeywords?: string[];
  /** The real, unbounded mailbox unread count (lib/connectors/email.ts's
   *  unreadCounts, same number the page header badge shows) — NOT derived
   *  from `feed`, which only carries the ~15 most-recent envelopes per
   *  inbox and would silently under-count against the real inbox. */
  totalUnread: number;
  /** Gmail Worker drafts still awaiting a human decision — see
   *  lib/mail-draft-review.ts. Empty whenever MAIL_EXTRACTION_ENABLED is off
   *  (the default), since nothing generates drafts in that case. */
  drafts: DraftReview[];
}) {
  const [tab, setTab] = useState<Tab>('messaging');
  const unread = totalUnread;

  const TabButton = ({ id, icon: Icon, label, count }: { id: Tab; icon: typeof MessageSquare; label: string; count: number }) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={`flex items-center gap-2 rounded-[5px] px-3.5 py-1.5 font-mono text-[12px] font-semibold transition-colors ${
          active ? 'bg-[var(--accent-soft)] text-os-accent' : 'text-os-dim hover:text-os-muted'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        <span className={`rounded-sm-t px-1.5 py-px text-[10px] ${active ? 'bg-os-accent text-os-ink' : 'bg-os-surface2 text-os-dim'}`}>
          {count}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 border-b border-os-border pb-3">
        <div className="inline-flex gap-1 rounded-md-t border border-os-border bg-os-surface p-1">
          <TabButton id="messaging" icon={MessageSquare} label="Messaging" count={unread} />
          <TabButton id="meetings" icon={CalendarDays} label="Meetings" count={events.length} />
          <TabButton id="drafts" icon={Sparkles} label="Drafts" count={drafts.length} />
        </div>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.15em] text-os-dim">
          {tab === 'messaging' ? `${unread} unread` : tab === 'meetings' ? 'next 7 days' : 'awaiting your decision'}
        </span>
      </div>

      {tab === 'messaging' ? (
        <CommsGravity initialFeed={feed} initialTags={tags} workKeywords={workKeywords} />
      ) : tab === 'meetings' ? (
        <WeekCalendar events={events} accounts={accounts} nowISO={nowISO} />
      ) : (
        <CommsDrafts initialDrafts={drafts} />
      )}
    </div>
  );
}
