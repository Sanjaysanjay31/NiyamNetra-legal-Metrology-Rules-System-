/**
 * My inspections — the officer's own visits, newest first.
 *
 * The scoping is the server's, not this screen's. GET /inspections adds
 * `Inspection.user_id == user.id` for any non-admin caller, so an inspector
 * cannot widen this list to a colleague's work by editing a parameter, and this
 * screen sends no user filter at all. That is worth saying plainly on the page:
 * an officer should know the list is theirs by construction, not by a checkbox
 * they might accidentally clear.
 *
 * The layout is a grouped card list rather than the admin table. An inspector
 * reads this on a phone, standing up, looking for one of two things: the draft
 * they left half-finished, or the visit they submitted this morning. Cards
 * grouped by date answer both at a glance; a six-column table on a 390px screen
 * answers neither.
 *
 * Drafts are surfaced first and separately, because a draft is not part of the
 * record. Nothing in it has reached a report, and it will sit there indefinitely
 * until it is either submitted or abandoned — so the screen counts them at the
 * top and links each one straight to capture rather than to a read-only detail
 * page.
 *
 * Filters are exactly the endpoint's: status, a date window, and `q`, which
 * matches the shop name only. Sorting and paging do not exist on the endpoint,
 * so nothing here pretends to offer them; the list is the whole filtered set and
 * says so.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  Camera,
  ChevronRight,
  ClipboardList,
  MapPin,
  PenLine,
  PlusCircle,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDebounced, useDocumentTitle, useResource } from '../lib/hooks'
import { inspections as inspectionsFixture, storesById } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  DemoChip,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pill,
  Skeleton,
  cx,
} from '../ui'

/* The two values models.py permits on Inspection.status, plus "do not filter". */
const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Unfinished' },
  { value: 'submitted', label: 'Submitted' },
]

/* Date presets write real dates into the two inputs rather than holding a mode,
   so what is sent to the server is always exactly what the two fields show.
   The inputs themselves accept any date. */
const PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All dates', days: null },
]

const TRANSACTION_KEY = {
  retail_sale: 'inspection.retail_sale',
  wholesale: 'inspection.wholesale',
  institutional: 'inspection.institutional',
  export: 'inspection.export',
}

const iso = (d) => format(d, 'yyyy-MM-dd')

function prettyDay(isoDate) {
  if (!isoDate) return 'Undated'
  try {
    const d = parseISO(isoDate)
    const today = iso(new Date())
    const yesterday = iso(subDays(new Date(), 1))
    if (isoDate === today) return `Today · ${format(d, 'd MMM')}`
    if (isoDate === yesterday) return `Yesterday · ${format(d, 'd MMM')}`
    return format(d, 'EEEE, d MMMM yyyy')
  } catch {
    return String(isoDate)
  }
}

export default function InspectorInspections() {
  const { t } = useI18n()
  useDocumentTitle(t('nav.inspections'))
  const navigate = useNavigate()

  const today = iso(new Date())
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState(iso(subDays(new Date(), 29)))
  const [to, setTo] = useState(today)
  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw.trim(), 350)

  /* Only what the officer actually set travels. `status=` would filter for the
     empty string and match nothing, which is a different answer from "any". */
  const params = useMemo(() => {
    const p = {}
    if (status) p.status = status
    if (from) p.date_from = from
    if (to) p.date_to = to
    if (q) p.q = q
    return p
  }, [status, from, to, q])
  const key = JSON.stringify(params)

  const list = useResource(() => endpoints.inspections.list(params), {
    deps: [key],
    fallback: inspectionsFixture,
    label: t('nav.inspections'),
  })
  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: t('inspection.store'),
  })

  /* Names live on /stores; the list carries store_id. If that second request
     fails the rows still render, with the number in place of the name. */
  const rows = useMemo(() => {
    const shopById = new Map((shops.data ?? []).map((s) => [s.id, s]))
    return (list.data ?? []).map((i) => {
      const shop = shopById.get(i.store_id)
      return {
        id: i.id,
        date: i.inspection_date ?? null,
        shopName: shop?.name ?? `Shop #${i.store_id}`,
        shopCity: shop?.city ?? null,
        status: i.status ?? null,
        scans: i.scan_count ?? 0,
        transaction: i.transaction_type ?? null,
        inScope: i.in_scope,
        outOfScopeReason: i.out_of_scope_reason ?? null,
        geofence: i.geofence_status ?? null,
        geofenceDistance: i.geofence_distance_m ?? null,
        mockLocation: i.mock_location === true,
        signature: i.signature_status ?? null,
      }
    })
  }, [list.data, shops.data])

  const drafts = useMemo(() => rows.filter((r) => r.status === 'draft'), [rows])

  /* Grouped by inspection_date. The endpoint already orders by date then id
     descending, so insertion order is the order to display. */
  const groups = useMemo(() => {
    const byDay = new Map()
    for (const r of rows) {
      const k = r.date ?? ''
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k).push(r)
    }
    return [...byDay.entries()]
  }, [rows])

  const packages = rows.reduce((n, r) => n + r.scans, 0)
  const filtered = Boolean(status || q) || from !== '' || to !== ''
  const demo = list.demo || shops.demo

  function applyPreset(p) {
    if (p.days == null) {
      setFrom('')
      setTo('')
      return
    }
    setFrom(iso(subDays(new Date(), p.days - 1)))
    setTo(iso(new Date()))
  }

  function reset() {
    setStatus('')
    setQRaw('')
    setFrom(iso(subDays(new Date(), 29)))
    setTo(today)
  }

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        eyebrow={t('nav.home')}
        title={t('nav.inspections')}
        subtitle="Every visit recorded on your own account. The server scopes this list to you — there is no setting here that could widen it."
        actions={
          <div className="flex items-center gap-2">
            {demo && <DemoChip />}
            <Button icon={PlusCircle} onClick={() => navigate('/inspector/inspections/new')}>
              {t('nav.newInspection')}
            </Button>
          </div>
        }
      />

      {/* ---- Unfinished work, first and unmissable. ---- */}
      {drafts.length > 0 && (
        <Callout
          family="review"
          title={`${drafts.length} ${drafts.length === 1 ? 'inspection is' : 'inspections are'} still unfinished`}
          icon={PenLine}
          className="mt-6"
        >
          <p>
            A draft is not part of the record. Nothing in it reaches a report, and no finding it
            holds counts, until it is submitted.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-small">
                  <span className="nn-mono font-medium">#{d.id}</span> · {d.shopName} ·{' '}
                  {d.scans === 0 ? 'no packages yet' : `${d.scans} ${d.scans === 1 ? 'package' : 'packages'}`}
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
        </Callout>
      )}

      {/* ---- The endpoint's three filters, and nothing invented. ---- */}
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t('inspection.status')}
          >
            {STATUS_TABS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatus(s.value)}
                aria-pressed={status === s.value}
                className={cx(
                  'nn-badge min-h-touch px-3.5 transition-colors duration-fast ease-settle',
                  status === s.value
                    ? 'border-accent bg-accent-soft font-semibold text-accent-text'
                    : 'border-control bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            onClick={reset}
            disabled={!filtered}
            disabledReason="Nothing is filtered."
          >
            {t('common.clear')}
          </Button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Shop name contains"
            hint="Matches the shop name only. Commodity, brand and batch live on the package and are not searchable here."
          >
            {(props) => (
              <div className="relative">
                <Input
                  {...props}
                  icon={Search}
                  value={qRaw}
                  onChange={(e) => setQRaw(e.target.value)}
                  placeholder="e.g. Provision"
                  className={qRaw ? 'pr-11' : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                {qRaw && (
                  <button
                    type="button"
                    onClick={() => setQRaw('')}
                    aria-label="Clear the shop name filter"
                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-sm text-ink-3 hover:text-ink-2"
                  >
                    <X size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={from}
                  max={to || today}
                  onChange={(e) => setFrom(e.target.value)}
                />
              )}
            </Field>
            <Field label="To">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={today}
                  onChange={(e) => setTo(e.target.value)}
                />
              )}
            </Field>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Date presets">
          {PRESETS.map((p) => {
            const active =
              p.days == null
                ? from === '' && to === ''
                : from === iso(subDays(new Date(), p.days - 1)) && to === today
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                aria-pressed={active}
                className={cx(
                  'nn-badge min-h-touch px-3 transition-colors duration-fast ease-settle',
                  active
                    ? 'border-accent bg-accent-soft font-semibold text-accent-text'
                    : 'border-control bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </Card>

      {/* ---- The result. ---- */}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-small text-ink-2">
          <span className="tabular-nums font-medium text-ink">{rows.length}</span>{' '}
          {rows.length === 1 ? 'inspection' : 'inspections'} ·{' '}
          <span className="tabular-nums font-medium text-ink">{packages}</span>{' '}
          {packages === 1 ? 'package' : 'packages'}
        </p>
        <p className="nn-mono text-caption text-ink-3">
          {from || to ? `${from || 'earliest'} → ${to || 'today'}` : 'all dates'}
        </p>
      </div>

      {shops.error && (
        <Callout family="review" title="Shop names could not be loaded" className="mt-4">
          The inspection list arrived but /stores did not, so rows below show the shop number instead
          of its name.
        </Callout>
      )}

      {list.loading ? (
        <Card className="mt-4 p-5">
          <Skeleton lines={6} />
        </Card>
      ) : list.error ? (
        <Callout
          family="violation"
          title="Your inspections could not be loaded"
          className="mt-4"
          actions={
            <Button size="sm" onClick={list.reload}>
              {t('common.retry')}
            </Button>
          }
        >
          {list.error.message}
        </Callout>
      ) : rows.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={ClipboardList}
            title={filtered ? 'Nothing matches these filters' : 'You have not recorded an inspection yet'}
            body={
              filtered
                ? 'Widen the date window, clear the shop name, or set the status back to All.'
                : 'Start one from a shop you are standing in, and it will appear here from the moment it is created.'
            }
            action={
              filtered ? (
                <Button size="sm" icon={RotateCcw} onClick={reset}>
                  {t('common.clear')}
                </Button>
              ) : (
                <Button size="sm" icon={PlusCircle} onClick={() => navigate('/inspector/inspections/new')}>
                  {t('nav.newInspection')}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {groups.map(([day, items]) => (
            <section key={day || 'undated'} aria-label={prettyDay(day)}>
              <h2 className="nn-eyebrow px-1">{prettyDay(day)}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {items.map((r) => (
                  <VisitCard key={r.id} row={r} onOpen={navigate} t={t} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ---- The honest boundary. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="text-h2 text-ink">What this list cannot do</h2>
        <p className="mt-1 max-w-prose text-caption text-ink-2">
          Named rather than faked, so a missing feature never reads as a broken one.
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {[
            [
              'It cannot show another officer’s work',
              'GET /inspections filters on your own user id for any non-admin caller. That happens on the server, so it is not a preference this screen could change.',
            ],
            [
              'It cannot be sorted, or paged',
              'The endpoint takes neither parameter and returns the whole filtered set in date order. The date window above is what keeps that response small.',
            ],
            [
              'It cannot search a commodity, brand or batch',
              'Those belong to a package, not a visit. The q parameter matches the shop name only — the router says so in its own comment.',
            ],
            [
              'It cannot show a result per visit',
              'A verdict belongs to a package. The package count here is a count, deliberately not a score; open a visit to see how each package was assessed.',
            ],
          ].map(([title, body]) => (
            <li key={title} className="border-l-2 border-divider pl-3">
              <p className="text-small font-semibold text-ink">{title}</p>
              <p className="mt-0.5 max-w-prose text-caption text-ink-2">{body}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

/**
 * One visit. A draft goes to capture, because the only useful thing to do with an
 * unfinished inspection is finish it; a submitted one goes to its detail page,
 * which is read-only by design.
 */
function VisitCard({ row: r, onOpen, t }) {
  const draft = r.status === 'draft'
  const to = draft ? `/inspector/inspections/${r.id}/capture` : `/inspector/inspections/${r.id}`
  const transactionKey = TRANSACTION_KEY[r.transaction]

  return (
    <button
      type="button"
      onClick={() => onOpen(to)}
      className={cx(
        'nn-card-interactive w-full min-h-touch p-4 text-left',
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2'
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="nn-mono text-caption text-ink-3">#{r.id}</span>
          <span className="text-body font-medium text-ink">{r.shopName}</span>
          {draft ? (
            <Pill family="na" icon={PenLine}>
              {t('inspection.draft')}
            </Pill>
          ) : (
            <Pill>{t('inspection.submitted')}</Pill>
          )}
          {r.inScope === false && <Pill family="na">{t('result.out_of_scope')}</Pill>}
        </span>

        <span className="mt-1 block text-small text-ink-2">
          {r.shopCity && <span>{r.shopCity} · </span>}
          {transactionKey ? t(transactionKey) : r.transaction || 'Transaction not recorded'} ·{' '}
          <span className="tabular-nums">{r.scans}</span>{' '}
          {r.scans === 1 ? 'package' : 'packages'}
        </span>

        {r.outOfScopeReason && (
          <span className="mt-1 block max-w-prose text-caption leading-5 text-ink-3">
            {r.outOfScopeReason}
          </span>
        )}

        {r.geofence === 'outside' && (
          <span className="mt-1 flex items-center gap-1 text-caption text-review-text">
            <MapPin size={12} strokeWidth={2} aria-hidden="true" />
            {r.geofenceDistance == null
              ? 'Recorded outside the shop geofence'
              : `Recorded ${Math.round(r.geofenceDistance)} m from the shop`}
          </span>
        )}
        {r.geofence === 'unknown' && (
          <span className="mt-1 block text-caption text-ink-3">
            {t('inspection.locationUnavailable')}
          </span>
        )}
        {r.mockLocation && (
          <span className="mt-1 block text-caption text-review-text">
            {t('inspection.mockLocation')}
          </span>
        )}
        {!draft && r.signature === 'refused' && (
          <span className="mt-1 block text-caption text-ink-3">{t('inspection.refused')}</span>
        )}
        {!draft && r.signature === 'unavailable' && (
          <span className="mt-1 block text-caption text-ink-3">{t('inspection.unavailable')}</span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-1 self-center text-small font-medium text-accent-text">
        {draft ? 'Continue' : 'Open'}
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </span>
    </button>
  )
}
