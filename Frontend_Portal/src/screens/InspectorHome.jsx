/**
 * The inspector's home.
 *
 * An officer opens this on a phone, in a market, with one of three things in
 * mind: start the next visit, finish the one left half-done, or check that
 * yesterday's work actually left the device. The screen is ordered to answer
 * those in that order, and it holds nothing that is merely decorative.
 *
 * There is no inspector dashboard endpoint, and this screen does not fake one.
 * /admin/dashboard is admin-only, so the day's numbers come from
 * /reports/today — which the router scopes to `user.id`, meaning it is always
 * the caller's own day and can never be a jurisdiction total. That distinction
 * is stated on the card, because "8 packages" means something very different if
 * an officer thinks it is the office's figure.
 *
 * The device-queue card exists for one concrete reason: the header's SyncBadge is
 * `hidden sm:inline-flex`, so on the phone this portal is actually used from,
 * there is no sync indicator at all. Work held in IndexedDB and not yet accepted
 * by the server is the single most consequential thing an officer can be unaware
 * of, so it gets a card here with the numbers spelled out.
 *
 * Drafts are fetched without a date filter. A draft from nine days ago is still
 * unfinished work and still absent from every report; hiding it behind the
 * thirty-day window would be a kindness to the layout and a disservice to the
 * record.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  Camera,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Clock,
  CloudOff,
  FileText,
  HelpCircle,
  Info,
  Package,
  PenLine,
  PlusCircle,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDocumentTitle, useOnlineStatus, useResource } from '../lib/hooks'
import { onQueueChange, queueSummary } from '../lib/queue'
import { inspections as inspectionsFixture, storesById, todaysReport } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  DemoChip,
  PageHeader,
  Pill,
  SectionTitle,
  Skeleton,
  StatCard,
  cx,
} from '../ui'

/* The four scan results, in the order a report reads them. Each is a *scan*
   result, not a check verdict — the three-state check verdict is a different
   axis and lives on the findings screen. The icons are the ones VERDICT_META
   already uses for these words, so the same result never wears two faces; and
   AlertTriangle stays out of it, being reserved for system warnings. */
const RESULT_TILES = [
  { key: 'compliant', family: 'pass', labelKey: 'result.compliant', icon: CheckCircle },
  { key: 'violation', family: 'violation', labelKey: 'result.violation', icon: XCircle },
  { key: 'not_assessed', family: 'na', labelKey: 'result.not_assessed', icon: HelpCircle },
  { key: 'out_of_scope', family: 'na', labelKey: 'result.out_of_scope', icon: Clock },
]

function greeting(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function firstName(full) {
  if (!full) return 'Inspector'
  return String(full).trim().split(/\s+/)[0]
}

/** Live view of the outbox. Subscribed here because the header's badge is hidden
    at phone widths, which is exactly where this matters most. */
function useQueue() {
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    let alive = true
    queueSummary().then((s) => {
      if (alive) setSummary(s)
    })
    const off = onQueueChange((s) => {
      if (alive) setSummary(s)
    })
    return () => {
      alive = false
      off()
    }
  }, [])
  return summary
}

export default function InspectorHome() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  useDocumentTitle(t('nav.home'))

  const today = format(new Date(), 'yyyy-MM-dd')

  const report = useResource(() => endpoints.reports.today(), {
    fallback: todaysReport,
    label: t('reports.today'),
  })
  /* Drafts, unbounded by date on purpose — see the header note. */
  const draftList = useResource(() => endpoints.inspections.list({ status: 'draft' }), {
    fallback: inspectionsFixture.filter((i) => i.status === 'draft'),
    label: t('inspection.draft'),
  })
  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: t('inspection.store'),
  })

  const day = report.data ?? todaysReport
  const counts = day.counts ?? {}
  const visits = day.inspections ?? 0
  const packages = counts.total ?? 0
  const stores = day.stores ?? []

  const shopById = new Map((shops.data ?? []).map((s) => [s.id, s]))
  const drafts = (draftList.data ?? []).map((i) => ({
    id: i.id,
    shopName: shopById.get(i.store_id)?.name ?? `Shop #${i.store_id}`,
    date: i.inspection_date ?? null,
    scans: i.scan_count ?? 0,
  }))

  const queue = useQueue()
  const held = queue ? queue.pending + queue.sending : 0
  const blocked = queue?.blocked ?? 0

  const demo = report.demo || draftList.demo || shops.demo
  const reportedFor = day.report_date ?? today

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        eyebrow={
          user
            ? `${user.employee_id}${user.jurisdiction ? ` · ${user.jurisdiction}` : ''}`
            : t('nav.home')
        }
        title={`${greeting(new Date().getHours())}, ${firstName(user?.full_name)}`}
        subtitle={format(new Date(), "EEEE, d MMMM yyyy")}
        actions={demo ? <DemoChip /> : null}
      />

      {/* ---- The one action that matters most, given its own weight. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-h2 text-ink">{t('nav.newInspection')}</h2>
            <p className="mt-1 max-w-prose text-small text-ink-2">
              Choose the shop you are standing in. Your location is recorded against its registered
              address, and everything captured afterwards belongs to that visit.
            </p>
          </div>
          <Button
            icon={PlusCircle}
            size="lg"
            className="shrink-0"
            onClick={() => navigate('/inspector/inspections/new')}
          >
            {t('inspection.new')}
          </Button>
        </div>
      </Card>

      {/* ---- Unfinished work. Above the numbers, because it changes them. ---- */}
      {drafts.length > 0 && (
        <Card className="mt-4 p-5 sm:p-6">
          <SectionTitle caption="A draft is not part of the record. Nothing it holds reaches a report until it is submitted.">
            <span className="inline-flex items-center gap-2">
              <PenLine size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
              {drafts.length === 1 ? 'One unfinished inspection' : `${drafts.length} unfinished inspections`}
            </span>
          </SectionTitle>
          <ul className="mt-3 divide-y divide-divider">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-small font-medium text-ink">
                    <span className="nn-mono text-ink-3">#{d.id}</span> {d.shopName}
                  </span>
                  <span className="block text-caption text-ink-3">
                    {d.date ? format(parseISO(d.date), 'd MMM yyyy') : 'Undated'} ·{' '}
                    {d.scans === 0
                      ? 'no packages captured yet'
                      : `${d.scans} ${d.scans === 1 ? 'package' : 'packages'}`}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Camera}
                  onClick={() => navigate(`/inspector/inspections/${d.id}/capture`)}
                >
                  Continue
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ---- The day, and only the officer's own day. ---- */}
      <div className="mt-6">
        <SectionTitle
          caption={
            reportedFor === today
              ? 'Your own packages assessed today. These are scan results, not check verdicts — a single package carries nineteen findings and one result.'
              : `Reported for ${reportedFor}. These are your own figures, not the office total.`
          }
          right={
            <Button
              size="sm"
              variant="ghost"
              iconRight={ChevronRight}
              onClick={() => navigate('/inspector/today')}
            >
              {t('reports.today')}
            </Button>
          }
        >
          Today
        </SectionTitle>

        {report.error ? (
          <Callout
            family="violation"
            title="Today's figures could not be loaded"
            className="mt-3"
            actions={
              <Button size="sm" onClick={report.reload}>
                {t('common.retry')}
              </Button>
            }
          >
            {report.error.message}
          </Callout>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                label={t('nav.inspections')}
                value={String(visits)}
                caption={visits === 1 ? 'shop visited' : 'shops visited'}
                icon={ClipboardList}
                loading={report.loading}
                onClick={() => navigate('/inspector/inspections')}
              />
              <StatCard
                label={t('inspection.packages')}
                value={String(packages)}
                caption="assessed today"
                icon={Package}
                loading={report.loading}
              />
              <StatCard
                label={t('reports.today')}
                value={String(stores.length)}
                caption={stores.length === 1 ? 'shop in the report' : 'shops in the report'}
                icon={FileText}
                loading={report.loading}
                onClick={() => navigate('/inspector/today')}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

            {packages === 0 && !report.loading && (
              <p className="mt-3 text-caption text-ink-3">{t('reports.noneToday')}</p>
            )}
          </>
        )}
      </div>

      {/* ---- What is still on this device. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <SectionTitle caption="Inspections are recorded on the device first and sent when a connection is available. Nothing is discarded in between.">
          <span className="inline-flex items-center gap-2">
            <CloudOff size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
            On this device
          </span>
        </SectionTitle>

        {queue == null ? (
          <div className="mt-3">
            <Skeleton lines={2} />
          </div>
        ) : blocked > 0 ? (
          <Callout family="violation" title={`${blocked} ${blocked === 1 ? 'inspection was' : 'inspections were'} refused by the server`} className="mt-3">
            They are still held here and nothing has been lost, but they will not retry on their own.
            Each one needs to be looked at — most often the shop was removed, or a required field
            arrived empty.
          </Callout>
        ) : held > 0 ? (
          <Callout
            family="review"
            title={`${held} ${held === 1 ? 'inspection is' : 'inspections are'} waiting to be sent`}
            className="mt-3"
          >
            {online
              ? 'The connection is back and these are being sent now. Keep the portal open until the count reaches zero.'
              : 'This device is offline. They will be sent automatically the moment a connection returns — you do not need to do anything.'}
          </Callout>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-small text-ink-2">
            <ShieldCheck size={16} strokeWidth={1.8} className="text-pass-graphic" aria-hidden="true" />
            Everything recorded on this device has reached the server.
          </p>
        )}

        <p className="mt-3 flex flex-wrap items-center gap-2 text-caption text-ink-3">
          <Pill family={online ? 'pass' : 'na'}>{online ? 'Online' : t('common.offline')}</Pill>
          <span>
            {online
              ? 'Captures are sent as they are made.'
              : t('common.offlineHint')}
          </span>
        </p>
      </Card>

      {/* ---- Where else to go. Two links, both real routes. ---- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <HomeLink
          icon={ClipboardList}
          title={t('nav.inspections')}
          body="Every visit on your account, grouped by day, with unfinished ones first."
          onClick={() => navigate('/inspector/inspections')}
        />
        <HomeLink
          icon={FileText}
          title={t('reports.today')}
          body="Your day as a signed document, ready to download as Word or PDF."
          onClick={() => navigate('/inspector/today')}
        />
      </div>

      {/* ---- The honest boundary. ---- */}
      <Callout family="info" title="What this home does not show" icon={Info} className="mt-6">
        There is no inspector dashboard on the server, so nothing here is a jurisdiction total — every
        figure above is your own work, because /reports/today is scoped to your account. There are
        also no assignments and no notifications: the system never tells an officer which shop to
        visit next, and nothing on this page is a task list handed down from an administrator.
      </Callout>
    </div>
  )
}

/** A destination card. A button rather than a Link so the whole block is one hit
    area at 44px minimum, which a nested anchor inside a card cannot guarantee. */
function HomeLink({ icon: Icon, title, body, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'nn-card-interactive flex min-h-touch w-full items-start gap-3 p-5 text-left'
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent-text">
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-body font-medium text-ink">
          {title}
          <ChevronRight size={15} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
        </span>
        <span className="mt-0.5 block text-caption leading-5 text-ink-2">{body}</span>
      </span>
    </button>
  )
}
