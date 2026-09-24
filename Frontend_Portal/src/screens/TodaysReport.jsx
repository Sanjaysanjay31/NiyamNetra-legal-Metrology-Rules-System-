/**
 * Today's report — the officer's own day, and the two documents it produces.
 *
 * This is the screen an inspector uses at the end of a shift, so it is built
 * around one question: is what the server will put in the document the same as
 * what I remember doing? Everything is therefore shown before it is downloaded —
 * the shop breakdown, the four result counts, and the exact time the figures were
 * assembled — rather than offering a download button over an unseen payload.
 *
 * Three honest properties of the endpoint shape this screen:
 *
 *   - /reports/today is scoped to `user.id` on the server. It is always the
 *     caller's own day and there is no parameter that could widen it, so the page
 *     never claims to be an office total.
 *   - It takes a `day` parameter, so past days are readable. /reports/calendar
 *     names which days in a month actually have work, and those are the only days
 *     offered — a date picker over empty days invites an officer to download a
 *     document with nothing in it.
 *   - The calendar returns dates only. It carries no per-day counts, so the day
 *     chooser shows which days have work and deliberately not how much.
 *
 * The two document endpoints return files, not JSON, and the server writes them
 * to disk under a per-user name before streaming them back. They are slow
 * relative to everything else here, so each button holds its own pending state
 * and neither blocks the other.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSignature,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Info,
  Store as StoreIcon,
  XCircle,
} from 'lucide-react'
import { endpoints, saveBlob } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDocumentTitle, useResource } from '../lib/hooks'
import { reportCalendar, todaysReport } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  DemoChip,
  EmptyState,
  Input,
  MetaStat,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatCard,
  Table,
  Td,
  Th,
  Tr,
  cx,
  useToast,
} from '../ui'

const RESULT_TILES = [
  { key: 'compliant', family: 'pass', labelKey: 'result.compliant', icon: CheckCircle },
  { key: 'violation', family: 'violation', labelKey: 'result.violation', icon: XCircle },
  { key: 'not_assessed', family: 'na', labelKey: 'result.not_assessed', icon: HelpCircle },
  { key: 'out_of_scope', family: 'na', labelKey: 'result.out_of_scope', icon: Clock },
]

const iso = (d) => format(d, 'yyyy-MM-dd')

function prettyDay(value) {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'EEEE, d MMMM yyyy')
  } catch {
    return String(value)
  }
}

function prettyStamp(value) {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'd MMM yyyy, HH:mm')
  } catch {
    return String(value)
  }
}

export default function TodaysReport() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  useDocumentTitle(t('reports.today'))

  const today = iso(new Date())
  const [day, setDay] = useState(today)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
  const [busy, setBusy] = useState(null)

  const report = useResource(() => endpoints.reports.today(day === today ? {} : { day }), {
    deps: [day],
    fallback: todaysReport,
    label: t('reports.today'),
  })
  const calendar = useResource(
    () => endpoints.reports.calendar({ year: month.year, month: month.month }),
    {
      deps: [month.year, month.month],
      fallback: reportCalendar,
      label: 'report calendar',
    }
  )

  const data = report.data ?? todaysReport
  const counts = data.counts ?? {}
  const stores = data.stores ?? []
  const visits = data.inspections ?? 0
  const packages = counts.total ?? 0
  const officer = data.inspector ?? user

  /* The endpoint returns dates only, newest last. Reversed so the most recent
     day sits first, which is the one an officer wants nine times in ten. */
  const activeDays = useMemo(() => {
    const list = calendar.data?.dates ?? []
    return [...list].sort().reverse()
  }, [calendar.data])

  const monthLabel = useMemo(() => {
    try {
      return format(new Date(month.year, month.month - 1, 1), 'MMMM yyyy')
    } catch {
      return `${month.month}/${month.year}`
    }
  }, [month])

  const nowMonth = new Date()
  const atCurrentMonth =
    month.year === nowMonth.getFullYear() && month.month === nowMonth.getMonth() + 1

  function shiftMonth(delta) {
    setMonth((m) => {
      const d = new Date(m.year, m.month - 1 + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() + 1 }
    })
  }

  /* Documents. `day` is omitted for today so the server applies its own
     date.today() rather than trusting this device's clock for the default. */
  async function download(kind) {
    setBusy(kind)
    const params = day === today ? {} : { day }
    const fetcher = {
      docx: endpoints.reports.todayDocx,
      pdf: endpoints.reports.todayPdf,
      xlsx: endpoints.reports.todayXlsx,
      csv: endpoints.reports.todayCsv,
    }[kind]
    const label = {
      docx: 'Word document downloaded',
      pdf: 'PDF downloaded',
      xlsx: 'Excel workbook downloaded',
      csv: 'CSV downloaded',
    }[kind]
    try {
      const blob = await fetcher(params)
      saveBlob(blob, `niyamnetra-report-${day}.${kind}`)
      toast.push({
        family: 'pass',
        title: label,
        body: `Covers ${prettyDay(day)} and carries the audit chain head at the time it was generated.`,
      })
    } catch (err) {
      toast.push({
        family: 'violation',
        title: 'The document could not be generated',
        body: err?.message ?? 'The server did not return a file.',
      })
    } finally {
      setBusy(null)
    }
  }

  const empty = packages === 0 && visits === 0

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        eyebrow={t('nav.today')}
        title={t('reports.today')}
        subtitle="Your own day, exactly as it will appear in the document. Nothing here is an office total — the server scopes this report to your account."
        actions={
          <div className="flex items-center gap-2">
            {(report.demo || calendar.demo) && <DemoChip />}
            <Button
              variant="secondary"
              icon={Download}
              loading={busy === 'docx'}
              disabled={busy != null || report.loading || empty}
              disabledReason={
                empty
                  ? 'There is nothing recorded on this day to put in a document.'
                  : 'A document is already being generated.'
              }
              onClick={() => download('docx')}
            >
              {t('reports.downloadDocx')}
            </Button>
            <Button
              icon={FileText}
              loading={busy === 'pdf'}
              disabled={busy != null || report.loading || empty}
              disabledReason={
                empty
                  ? 'There is nothing recorded on this day to put in a document.'
                  : 'A document is already being generated.'
              }
              onClick={() => download('pdf')}
            >
              {t('reports.downloadPdf')}
            </Button>
            <Button
              variant="secondary"
              icon={FileSpreadsheet}
              loading={busy === 'xlsx'}
              disabled={busy != null || report.loading || empty}
              disabledReason={
                empty
                  ? 'There is nothing recorded on this day to put in a document.'
                  : 'A document is already being generated.'
              }
              onClick={() => download('xlsx')}
            >
              Excel
            </Button>
            <Button
              variant="secondary"
              icon={Download}
              loading={busy === 'csv'}
              disabled={busy != null || report.loading || empty}
              disabledReason={
                empty
                  ? 'There is nothing recorded on this day to put in a document.'
                  : 'A document is already being generated.'
              }
              onClick={() => download('csv')}
            >
              CSV
            </Button>
          </div>
        }
        meta={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{prettyDay(data.report_date ?? day)}</span>
            {officer && (
              <span className="nn-mono text-ink-3">
                {officer.full_name} · {officer.employee_id}
              </span>
            )}
          </span>
        }
      />

      {/* ---- Which day. Only days that actually have work are offered. ---- */}
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle caption="Days the server recorded work on, for this month. It reports which days, not how much.">
            {t('reports.date')}
          </SectionTitle>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={ChevronLeft}
              onClick={() => shiftMonth(-1)}
              disabled={calendar.loading}
              disabledReason="The calendar is still loading."
            >
              {monthLabel}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconRight={ChevronRight}
              onClick={() => shiftMonth(1)}
              disabled={atCurrentMonth || calendar.loading}
              disabledReason={
                atCurrentMonth ? 'This is the current month.' : 'The calendar is still loading.'
              }
            >
              {t('common.next')}
            </Button>
          </div>
        </div>

        {/* ---- Any date, not only the days with work. ---- */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="nn-eyebrow">Any date</span>
          <Input
            type="date"
            value={day}
            max={today}
            onChange={(e) => {
              const v = e.target.value
              if (v) setDay(v)
            }}
            aria-label="Pick any date"
            className="w-auto"
          />
          <span className="text-caption text-ink-3">
            The buttons above list days with work; this opens any past date.
          </span>
        </div>

        <div className="mt-4">
          {calendar.loading ? (
            <Skeleton lines={2} />
          ) : activeDays.length === 0 ? (
            <p className="text-small text-ink-2">
              Nothing was recorded in {monthLabel}. Move back a month, or return to today.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('reports.date')}>
              {day !== today && (
                <button
                  type="button"
                  onClick={() => setDay(today)}
                  className="nn-badge min-h-touch border-control bg-surface px-3.5 text-ink-2 transition-colors duration-fast ease-settle hover:bg-surface-2 hover:text-ink"
                >
                  Back to today
                </button>
              )}
              {activeDays.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  aria-pressed={day === d}
                  className={cx(
                    'nn-badge nn-mono min-h-touch px-3 transition-colors duration-fast ease-settle',
                    day === d
                      ? 'border-accent bg-accent-soft font-semibold text-accent-text'
                      : 'border-control bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'
                  )}
                >
                  {format(parseISO(d), 'd MMM')}
                  {d === today && <span className="ml-1 font-normal text-ink-3">today</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ---- The figures. ---- */}
      {report.error ? (
        <Callout
          family="violation"
          title="The report could not be loaded"
          className="mt-6"
          actions={
            <Button size="sm" onClick={report.reload}>
              {t('common.retry')}
            </Button>
          }
        >
          {report.error.message}
        </Callout>
      ) : empty && !report.loading ? (
        <Card className="mt-6">
          <EmptyState
            icon={FileText}
            title={t('reports.noneToday')}
            body={
              day === today
                ? 'Nothing has been recorded on your account yet today. A document generated now would be empty, so downloading is disabled.'
                : `Nothing was recorded on ${prettyDay(day)}.`
            }
            action={
              <Button size="sm" onClick={() => navigate('/inspector/inspections/new')}>
                {t('inspection.new')}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RESULT_TILES.map((tile) => (
              <StatCard
                key={tile.key}
                label={t(tile.labelKey)}
                value={String(counts[tile.key] ?? 0)}
                family={tile.family}
                icon={tile.icon}
                loading={report.loading}
              />
            ))}
          </div>

          <Card className="mt-4 p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetaStat label={t('nav.inspections')} value={String(visits)} />
              <MetaStat label={t('inspection.packages')} value={String(packages)} />
              <MetaStat label="Shops" value={String(stores.length)} />
              <MetaStat
                label={t('reports.generatedAt')}
                value={prettyStamp(data.generated_at)}
                title={data.generated_at ?? undefined}
              />
            </div>
            <p className="mt-4 max-w-prose text-caption leading-5 text-ink-3">
              The four figures above are package results, not check verdicts. One package carries
              nineteen findings and resolves to exactly one of these four; a package assessed with
              some checks unavailable is counted once, as not assessed, and never split across two
              columns.
            </p>
          </Card>

          {/* ---- Per shop, as the document will break it down. ---- */}
          <Card className="mt-4 p-0">
            <div className="p-5 pb-0 sm:px-6">
              <SectionTitle caption="The same grouping the document uses, so what is downloaded matches what is read here.">
                <span className="inline-flex items-center gap-2">
                  <StoreIcon size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
                  By shop
                </span>
              </SectionTitle>
            </div>

            {report.loading ? (
              <div className="p-5 sm:p-6">
                <Skeleton lines={4} />
              </div>
            ) : stores.length === 0 ? (
              <div className="p-5 sm:p-6">
                <p className="text-small text-ink-2">
                  No shop breakdown was returned for this day, although {visits}{' '}
                  {visits === 1 ? 'inspection was' : 'inspections were'} recorded. That happens when a
                  visit exists but holds no assessed package yet.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <Table caption={`${stores.length} ${stores.length === 1 ? 'shop' : 'shops'} on ${prettyDay(day)}.`}>
                  <thead>
                    <tr>
                      <Th>Shop</Th>
                      <Th align="right">{t('inspection.packages')}</Th>
                      <Th align="right">{t('result.compliant')}</Th>
                      <Th align="right">{t('result.violation')}</Th>
                      <Th align="right">{t('result.not_assessed')}</Th>
                      <Th align="right">{t('result.out_of_scope')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s) => {
                      const c = s.counts ?? {}
                      return (
                        <Tr key={s.store_id}>
                          <Td>
                            <span className="block text-small font-medium text-ink">
                              {s.store_name}
                            </span>
                            <span className="nn-mono text-caption text-ink-3">
                              Shop #{s.store_id}
                            </span>
                          </Td>
                          <Td align="right" className="tabular-nums text-ink">
                            {c.total ?? 0}
                          </Td>
                          <Td align="right" className="tabular-nums text-pass-text">
                            {c.compliant ?? 0}
                          </Td>
                          <Td align="right" className="tabular-nums text-violation-text">
                            {c.violation ?? 0}
                          </Td>
                          <Td align="right" className="tabular-nums text-ink-2">
                            {c.not_assessed ?? 0}
                          </Td>
                          <Td align="right" className="tabular-nums text-ink-3">
                            {c.out_of_scope ?? 0}
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>

          {/* ---- What the document adds that this screen cannot. ---- */}
          <Callout family="info" title="What the downloaded document contains" icon={FileSignature} className="mt-6">
            The Word and PDF versions carry more than these totals: every package, every finding in
            registration order with its provision cited, and the audit chain head as it stood when the
            file was generated. That last value is what lets a reader prove the record had not been
            altered before the document was made.
          </Callout>
        </>
      )}

      {/* ---- The honest boundary. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <SectionTitle>What this report cannot do</SectionTitle>
        <ul className="mt-3 space-y-2 text-small text-ink-2">
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            It covers one day at a time. There is no date range on the endpoint, so a week or a month
            has to be downloaded a day at a time.
          </li>
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            It is your day only. An administrator running this same endpoint sees their own account,
            not the office — jurisdiction figures live on the admin overview.
          </li>
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            The day chooser shows which days hold work, not how much. /reports/calendar returns dates
            with no counts attached.
          </li>
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            Documents are generated on request and not stored for you. Each download builds a fresh
            file, so a copy kept on this device is the only copy you keep.
          </li>
        </ul>
      </Card>
    </div>
  )
}
