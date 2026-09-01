import { ArrowDownLeft, ArrowUpRight, Scale, FileText } from 'lucide-react';
import {
  qboConfigured,
  monthToDateIncome as qboMonthToDateIncome,
  monthToDateExpensesByCategory as qboMonthToDateExpensesByCategory,
  openInvoices as qboOpenInvoices,
  companyName as qboCompanyName,
} from '@/lib/connectors/quickbooks';
import { getDb } from '@/lib/data';
import { runtimeEnv } from '@/lib/creds';
import { net, resolveExpenseCategories } from '@/lib/finances';
import { openLedger } from '@/lib/ledger';
import { openBankStore } from '@/lib/bank';
import { businessSeries } from '@/lib/bank-statements';
import { isBusinessFilter, resolveBusinessFilter } from '@/lib/business-filter';
import { readBusinessFilterCookie } from '@/lib/business-filter-server';
import { PageHeader } from '@/components/PageHeader';
import { SharePie } from '@/components/SharePie';
import { StatementUploader } from '@/components/StatementUploader';
import { BusinessIncomeChart } from '@/components/BusinessIncomeChart';
import { InvoiceAging } from '@/components/InvoiceAging';
import { Badge, Label, SectionHead } from '@/components/terminal';

export const dynamic = 'force-dynamic';

const usd = (n: number, cents = false) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0 });

function ago(unix: number): string {
  const mins = Math.round((Date.now() - unix * 1000) / 60_000);
  if (mins < 60) return `${Math.max(0, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default async function FinancesPage(props: { searchParams?: Promise<{ business?: string }> }) {
  const searchParams = await props.searchParams;
  // The business lens (same mechanism /org and /funnel already read): a
  // `?business=` link overrides the global cookie for direct linking;
  // otherwise the Topbar's current AAC / Apps / Combined selection applies.
  //
  // QuickBooks, the AR-aging invoice list, and the uploaded-statement ledger
  // fallback are ALL Arise Above Construction's real financial data — there
  // is no Apps-specific books connector today (lib/businesses.ts's Apps
  // `focus` list says so directly: "no dedicated crew yet"). So Combined and
  // AAC both render the real numbers exactly as before this fix; Apps
  // renders an honest "nothing connected for this business yet" state
  // instead of quietly showing AAC's books under an Apps label. The
  // per-business bank-statement income chart further down (Vantage /
  // General Operations) is a different, pre-existing "business" concept —
  // the literal bank account name on each uploaded statement, not the AAC/
  // Apps taxonomy — and stays unscoped by this filter since nothing in the
  // codebase maps a bank account to aac/apps (inventing that mapping would
  // violate HONESTY).
  const businessFilter = isBusinessFilter(searchParams?.business)
    ? searchParams!.business!
    : resolveBusinessFilter(await readBusinessFilterCookie());
  const showAacBooks = businessFilter !== 'apps';

  // QuickBooks — AAC's real books. Client keys configured is not the same as
  // authorized: only an authorized grant (stored via the OAuth callback)
  // pulls real numbers, so an unauthorized-but-keyed app still reads pending.
  //
  // Every QBO call below MUST be handed `env` (process.env + a fresh
  // .env.local overlay, from lib/creds.ts's runtimeEnv()) — never bare
  // process.env, and never the connector functions' own `= process.env`
  // default. .env.local is where the /integrations connect/rotate flow (and
  // production's FOUNDER_OS_ENV_LOCAL-backed volume file) actually writes
  // rotated QuickBooks credentials; every other real QBO consumer
  // (lib/connectors/index.ts's quickbooksStatus, lib/agents/real.ts's
  // quickbooks-pulse agent and Chief of Staff) already passes runtimeEnv()
  // for exactly this reason. Before this fix this page called every one of
  // these with bare process.env (or no argument at all, defaulting to bare
  // process.env inside the connector module), so /finances could show
  // "RECONNECT NEEDED" while /api/connections and every other QBO consumer
  // on the same request correctly reported connected (2026-08-21 fix; see
  // CLAUDE.md and the regression test in tests/finances-page.test.ts).
  const env = runtimeEnv();
  const qboKeyed = qboConfigured(env);
  const qboAuthorizedGrant = qboKeyed && getDb().quickbooksAuth.get() !== null;
  // Gate the fetch (and everything downstream) on the business filter too —
  // Apps has nothing real to show here, so there's no reason to make the
  // live QBO calls at all, and gating it here keeps every render path below
  // honestly reading "nothing connected" rather than "authorize me".
  const qboAuthorized = qboAuthorizedGrant && showAacBooks;
  let qboName: string | null = null;
  let qboIncome: number | null = null;
  let qboAr: Awaited<ReturnType<typeof qboOpenInvoices>> = null;
  let qboExpenseCategories: Awaited<ReturnType<typeof qboMonthToDateExpensesByCategory>> = null;
  if (qboAuthorized) {
    [qboName, qboIncome, qboAr, qboExpenseCategories] = await Promise.all([
      qboCompanyName(env).catch(() => null),
      qboMonthToDateIncome(env).catch(() => null),
      qboOpenInvoices(env).catch(() => null),
      qboMonthToDateExpensesByCategory(env).catch(() => null),
    ]);
  }
  const qboConnected = qboAuthorized && qboName !== null;
  // Single source of truth for "this month's QuickBooks expenses": the same
  // categorized ProfitAndLoss total used by the category chart further down
  // this page (see resolvedExpenses/`expenses` below and
  // resolveExpenseCategories in lib/finances.ts). Previously this card had
  // its own separate call — monthToDateExpenses, a raw sum of QBO Purchase
  // transactions — which could (and in production did) disagree with the
  // category chart's total for the exact same month: a Purchase transaction
  // coded to a Cost of Goods Sold account counted toward that raw sum but
  // was dropped by the category parser (fixed 2026-08-21, see CLAUDE.md).
  // Rather than keep two independently-computed "expenses" numbers in sync
  // forever, every "this month's expenses" figure on this page now derives
  // from this one QuickBooks read. Null only when the report call itself
  // failed/was unreachable — an honest pending state, not a guess.
  const qboExpenseTotal = qboExpenseCategories != null ? qboExpenseCategories.reduce((s, c) => s + c.total, 0) : null;
  const qboNet = qboIncome != null && qboExpenseTotal != null ? qboIncome - qboExpenseTotal : null;

  // Income = QuickBooks (the real books). Honest zero until the grant lands.
  const incomeMtd = qboIncome ?? 0;
  // Category-level expenses come from the uploaded statement ledger — the
  // fallback path for whoever hasn't authorized QuickBooks yet (or whose
  // token needs reconnecting). The ledger has no business dimension of its
  // own (every uploaded statement lands in one shared table — see
  // lib/ledger.ts), and every statement uploaded so far is AAC's, so it's
  // read the same way QuickBooks is: skipped honestly under the Apps filter
  // rather than shown as if it were Apps' spend.
  let ledgerSpend: { category: string; total: number }[] = [];
  let ledgerMonth: string | null = null;
  if (showAacBooks) {
    try {
      const ledger = openLedger();
      try {
        ledgerSpend = ledger.monthly();
        ledgerMonth = ledger.latestMonth();
      } finally {
        ledger.close();
      }
    } catch {
      ledgerSpend = [];
    }
  }
  // Per-business income from uploaded bank statements (Vantage, General Ops…).
  let bankSeries: ReturnType<typeof businessSeries> = [];
  try {
    const bank = openBankStore();
    try {
      bankSeries = businessSeries(bank.all());
    } finally {
      bank.close();
    }
  } catch {
    bankSeries = [];
  }
  // "2026-06" → "Jun 2026" for an honest period label on the uploaded figures.
  const monthLabel = ledgerMonth
    ? new Date(`${ledgerMonth}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null;
  const qboMonthLabel = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  // Category chart: QuickBooks' real ProfitAndLoss breakdown when it's
  // connected and reachable, uploaded-statement categories otherwise — see
  // resolveExpenseCategories' doc comment for why these two sources take
  // priority over each other instead of being merged/summed.
  const resolvedExpenses = resolveExpenseCategories(qboConnected, qboExpenseCategories, ledgerSpend);
  const byCategory = resolvedExpenses.categories;
  const expensesSource = resolvedExpenses.source;
  const expensesLive = expensesSource !== 'none';
  const expensesPeriodLabel = !showAacBooks
    ? 'no Apps books connected'
    : expensesSource === 'quickbooks'
      ? `QuickBooks · ${qboMonthLabel}`
      : expensesSource === 'statements'
        ? `uploaded · ${monthLabel}`
        : 'no statements uploaded';
  const expenses = byCategory.reduce((s, c) => s + c.total, 0);
  const netMonthly = net(incomeMtd, expenses);
  const maxCategory = Math.max(...byCategory.map((c) => c.total), 1);

  return (
    <div>
      <PageHeader
        eyebrow="every processor, one view"
        title="Finances"
        right={
          <Badge tone={netMonthly >= 0 ? 'ok' : 'err'}>
            {netMonthly >= 0 ? '+' : '−'}
            {usd(Math.abs(netMonthly))} net /mo
          </Badge>
        }
      />

      {/* QuickBooks — AAC's real books. Honest pending/error state when not
          authorized or unreachable; never a faked number. Under the Apps
          filter this whole section is replaced by an honest "nothing
          connected for Apps" notice — see showAacBooks above. */}
      <section className="mb-5">
        <SectionHead
          label="QuickBooks · Arise Above Construction"
          count={
            !showAacBooks
              ? 'not applicable · Apps selected'
              : qboConnected
                ? qboName ?? 'connected'
                : qboAuthorizedGrant
                  ? 'reconnect needed'
                  : qboKeyed
                    ? 'not authorized'
                    : 'not configured'
          }
        />
        {!showAacBooks ? (
          <div className="flex items-center justify-between gap-3 rounded-lg-t border border-os-border bg-os-surface px-4 py-3">
            <span className="font-mono text-[11px] text-os-dim">
              QuickBooks is Arise Above Construction&apos;s real books — Apps has no connected books yet.
              {qboAuthorizedGrant ? ' (AAC is connected — switch to AAC or Combined to see it.)' : ''}
            </span>
          </div>
        ) : qboConnected ? (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Income · MTD</Label>
                <ArrowDownLeft className="h-3 w-3 text-os-ok" strokeWidth={1.8} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] text-os-ok">
                  {qboIncome != null ? usd(qboIncome) : '—'}
                </span>
                <span className="font-mono text-[9.5px] text-os-dim">payments received</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Expenses · MTD</Label>
                <ArrowUpRight className="h-3 w-3 text-os-err" strokeWidth={1.8} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em]">
                  {qboExpenseTotal != null ? usd(qboExpenseTotal) : '—'}
                </span>
                <span className="font-mono text-[9.5px] text-os-dim">categorized P&amp;L</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Net · MTD</Label>
                <Scale className="h-3 w-3 text-os-accent" strokeWidth={1.8} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] ${qboNet != null && qboNet >= 0 ? 'text-os-ok' : 'text-os-err'}`}
                >
                  {qboNet != null ? usd(qboNet) : '—'}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Open invoices</Label>
                <FileText className="h-3 w-3 text-os-accent" strokeWidth={1.8} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em]">
                  {qboAr ? usd(qboAr.reduce((s, i) => s + i.balance, 0)) : '—'}
                </span>
                <span className="font-mono text-[9.5px] text-os-dim">{qboAr ? `${qboAr.length} unpaid` : 'unavailable'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg-t border border-os-border bg-os-surface px-4 py-3">
            <span className="font-mono text-[11px] text-os-dim">
              {qboKeyed
                ? qboAuthorized
                  ? 'Authorized previously but the last API call failed — the token may need reconnecting.'
                  : 'Client keys are set — authorize the app to pull real income, expenses, and open invoices.'
                : 'QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET not set in the environment yet.'}
            </span>
            {qboKeyed && (
              <a
                href="/api/connections/quickbooks/connect"
                className="shrink-0 rounded-full border border-os-border-strong px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg"
              >
                {qboAuthorized ? 'Reconnect →' : 'Connect →'}
              </a>
            )}
          </div>
        )}
      </section>

      {/* Aging + chase — every open invoice, worst-overdue first, with a
          draft-and-approve reminder email per row. See components/InvoiceAging.tsx. */}
      {qboConnected && qboAr && <InvoiceAging invoices={qboAr} />}

      {/* Summary tiles — slim single-line rows so the page opens condensed */}
      <section className="mb-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Income · MTD</Label>
            <ArrowDownLeft className="h-3 w-3 text-os-ok" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] text-os-ok">
              {qboIncome != null ? usd(incomeMtd) : '—'}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
              {qboConnected ? 'QuickBooks' : 'pending QuickBooks'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Expenses · /mo</Label>
            <ArrowUpRight className="h-3 w-3 text-os-err" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em]">{usd(expenses)}</span>
            <span
              className={`min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] ${expensesLive ? 'text-os-ok' : 'text-os-dim'}`}
            >
              {expensesPeriodLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Net · /mo</Label>
            <Scale className="h-3 w-3 text-os-accent" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] ${netMonthly >= 0 ? 'text-os-ok' : 'text-os-err'}`}
            >
              {netMonthly >= 0 ? '' : '−'}
              {usd(Math.abs(netMonthly))}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">in − out</span>
          </div>
        </div>
      </section>

      {/* Income by business — from uploaded bank statements, with a range dropdown */}
      {/* Income by processor */}
      {/* Income by business — from uploaded bank statements, with a range dropdown */}
      {bankSeries.length > 0 && (
        <section className="mb-5">
          <SectionHead label="Income · by business" count="bank deposits" />
          <div className="grid gap-3.5 lg:grid-cols-2">
            {bankSeries.map((s) => (
              <BusinessIncomeChart key={s.business} series={s} />
            ))}
          </div>
        </section>
      )}

      {/* Monthly expenses by category */}
      <section className="mb-5">
        <SectionHead
          label="Monthly expenses · by category"
          count={!showAacBooks ? 'not applicable · Apps selected' : expensesLive ? `${usd(expenses)} · ${expensesPeriodLabel}` : `${usd(expenses)} /mo`}
        />
        {!showAacBooks ? (
          <div className="rounded-lg-t border border-os-border bg-os-surface px-4 py-3 font-mono text-[11px] text-os-dim">
            Both expense sources here (QuickBooks' P&amp;L and the uploaded-statement ledger) are AAC's real
            books, and the ledger has no per-business field of its own to scope by — Apps has nothing
            connected here yet. Switch to AAC or Combined to see it (uploads are disabled under this filter
            so a statement never lands in the ledger mislabeled as Apps' spend).
          </div>
        ) : (
        <div className="grid items-stretch gap-3.5 lg:grid-cols-[1.15fr_1fr_0.85fr]">
          {/* where the money goes — share per category. Empty until QuickBooks
              is connected or a statement is uploaded (see resolveExpenseCategories). */}
          <SharePie
            items={byCategory.map((c) => ({ key: c.category, label: c.category, value: Math.round(c.total * 100) }))}
            total={Math.round(expenses * 100)}
            centerLabel={expensesSource === 'quickbooks' ? qboMonthLabel : expensesSource === 'statements' && monthLabel ? monthLabel : 'per month'}
            format={(cents) => usd(cents / 100)}
            donutPx={190}
            ariaLabel="Monthly expenses by category"
          />

          <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
            <div className="flex flex-col gap-2.5">
              {byCategory.map((c) => (
                <div key={c.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 font-mono text-[11px]">
                    <span className="text-os-muted">{c.category}</span>
                    <span className="text-os-text">{usd(c.total)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-sm-t bg-os-surface2">
                    <div className="h-full bg-os-accent opacity-60" style={{ width: `${(c.total / maxCategory) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Statement ingestion — the fallback source. While QuickBooks is
              connected it drives the chart above (see resolveExpenseCategories
              in lib/finances.ts); an upload here still lands in the ledger for
              when QuickBooks isn't reachable. */}
          <div className="flex flex-col gap-2">
            {expensesSource === 'quickbooks' && (
              <p className="rounded-lg-t border border-os-border bg-os-surface px-3 py-2 font-mono text-[10px] leading-relaxed text-os-dim">
                Chart is reading QuickBooks' categorized P&amp;L. Uploads here still save to the fallback ledger for whenever QuickBooks is unreachable.
              </p>
            )}
            <StatementUploader />
          </div>
        </div>
        )}
      </section>

    </div>
  );
}
