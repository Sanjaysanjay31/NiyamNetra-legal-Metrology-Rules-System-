/**
 * Repeat Offender Tracking — the dedicated home of the "manufacturer with
 * breaches in three or more distinct shops" alert.
 *
 * Six decisions:
 *
 *  1. THE TOP-OF-PAGE ALERT IS THE ONE THE DASHBOARD SHOWS. The worst
 *     current offender is the same on both screens, so the navigation reads
 *     as one feature, not two. The threshold (three distinct shops) is named
 *     on the card and in the page caption, in the same words the brief used,
 *     rather than chosen by the screen.
 *
 *  2. FIVE SEARCH MODES, ONE BOX. The brief asked for Manufacturer, Brand,
 *     Shop, Region and Declaration type. The list endpoint takes none of
 *     them as a parameter; the search is a single text field that filters
 *     the loaded list client-side against whichever mode is selected. The
 *     "About the filters" callout names the gap so a filter that does
 *     nothing is not silent.
 *
 *  3. HISTORY OPENS AS A DRAWER, NOT A NEW PAGE. The user explicitly said
 *     "Click → show history." The drawer keeps the ranked list visible, so
 *     an admin can scan one offender's history, close it, and open the
 *     next without losing their place. The history rows are real findings,
 *     each with a deep link to the package and the failed-check anchor.
 *
 *  4. THE RANK IS THE ENGINE'S, NOT THE SCREEN'S. The list comes back
 *     sorted by violation count; the screen does not re-rank, because a
 *     re-rank that disagrees with the endpoint is the kind of bug a
 *     defence lawyer will read.
 *
 *  5. THE LIST IS UNPAGED. The endpoint returns all offenders. The
 *     caption says so. If the dataset grows, the cap is named on the page,
 *     not chosen silently.
 *
 *  6. THE THRESHOLD IS NAMED, NOT INVENTED. The brief gave the rule; the
 *     screen shows it as text on the alert, the caption and the empty
 *     state. An admin reading "no offenders" should know whether the data
 *     is empty because nobody crossed the line or because nobody exists.
 */

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Filter,
  MapPin,
  RotateCcw,
  Search,
  ShieldAlert,
  Store as StoreIcon,
  Tag,
  X,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDebounced, useDocumentTitle, useResource } from '../lib/hooks'
import { CHECKS } from '../lib/checks'
import {
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  Input,
  MetaStat,
  Modal,
  PageHeader,
  Pill,
  Select,
  Skeleton,
  cx,
} from '../ui'

/* The five search modes, in the order the brief listed them. */
const MODES = [
  { id: 'manufacturer', icon: Building2,  placeholderKey: 'placeholderManufacturer' },
  { id: 'brand',        icon: Tag,        placeholderKey: 'placeholderBrand' },
  { id: 'shop',         icon: StoreIcon,  placeholderKey: 'placeholderShop' },
  { id: 'region',       icon: MapPin,     placeholderKey: 'placeholderRegion' },
  { id: 'declaration',  icon: ShieldAlert, placeholderKey: 'placeholderDeclaration' },
]

function pretty(isoDate) {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'd MMM yyyy')
  } catch {
    return String(isoDate)
  }
}

const VIOLATION_CATEGORY_OF_MAP = {
  CHK01: 'manufacturer',
  CHK04: 'mrp',
  CHK05: 'net_quantity',
  CHK06: 'net_quantity',
  CHK06b: 'net_quantity',
  CHK07: 'net_quantity',
  CHK08: 'consumer_care',
  CHK11: 'manufacturer',
  CHK12: 'manufacturer',
  CHK13: 'date',
}

function declarationOf(checkId) {
  return VIOLATION_CATEGORY_OF_MAP[checkId] ?? null
}

function declarationLabel(id, t) {
  return id ? t(`violations.top.category_${id}`) : '—'
}

/* ----------------------------------------------------------- alert card -- */

function TopAlertCard({ top, onShowHistory, onPick }) {
  const { t } = useI18n()
  if (!top) return null
  return (
    <Callout
      family="violation"
      title={`${t('repeatOffenders.alert.title')} — ${top.name}`}
      icon={AlertTriangle}
      actions={
        <Button
          size="sm"
          variant="secondary"
          icon={ChevronRight}
          onClick={() => onShowHistory(top)}
        >
          {t('repeatOffenders.alert.showHistory')}
        </Button>
      }
    >
      <div className="mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaStat
          label={t('repeatOffenders.alert.violations')}
          value={String(top.violations ?? 0)}
        />
        <MetaStat
          label={t('repeatOffenders.alert.stores')}
          value={String(top.stores ?? 0)}
        />
        <MetaStat
          label={t('repeatOffenders.alert.brands')}
          value={top.brands?.length ? `${top.brands.length} brands` : '—'}
          title={top.brands?.join(', ')}
        />
        <MetaStat
          label={t('repeatOffenders.alert.lastViolation')}
          value={pretty(top.last_violation)}
        />
      </div>
      <p className="mt-3 max-w-prose text-caption text-ink-2">
        {t('repeatOffenders.subtitle')}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="nn-eyebrow text-ink-3">Brands</span>
        {(top.brands ?? []).map((b) => (
          <Pill key={b} icon={Tag}>{b}</Pill>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="nn-eyebrow text-ink-3">Regions</span>
        {(top.regions ?? []).map((r) => (
          <Pill key={r} icon={MapPin}>{r}</Pill>
        ))}
        <button
          type="button"
          onClick={() => onPick(top.id)}
          className="ml-1 inline-flex items-center gap-1 text-caption font-semibold text-accent-text underline decoration-dotted underline-offset-2"
        >
          <Filter size={12} strokeWidth={2} aria-hidden="true" />
          Open this manufacturer's full record
        </button>
      </div>
    </Callout>
  )
}

/* ----------------------------------------------------------- search bar -- */

function SearchBar({ mode, setMode, query, setQuery, appliedCount, reset }) {
  const { t } = useI18n()
  const modeMeta = MODES.find((m) => m.id === mode) ?? MODES[0]
  const ModeIcon = modeMeta.icon
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Search size={15} strokeWidth={1.9} aria-hidden="true" className="text-ink-3" />
          <h2 className="text-h2 text-ink">{t('repeatOffenders.search.title')}</h2>
          <span className="nn-badge border-control bg-surface-2 text-ink-3">
            {t('repeatOffenders.search.applied', { count: appliedCount })}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={RotateCcw}
          onClick={reset}
          disabled={appliedCount === 0}
          disabledReason="No filters are applied."
        >
          {t('violations.filters.reset')}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <Field label={t('repeatOffenders.search.mode')}>
          {(props) => (
            <Select
              {...props}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {t(`repeatOffenders.search.mode${m.id[0].toUpperCase()}${m.id.slice(1)}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t(`repeatOffenders.search.mode${mode[0].toUpperCase()}${mode.slice(1)}`)}
          hint={
            mode === 'declaration'
              ? 'e.g. MRP declaration, Net quantity, Consumer care.'
              : 'Client-side filter — the live router does not yet accept any of the five search modes as a parameter.'
          }
        >
          {(props) => (
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                aria-hidden="true"
              >
                <ModeIcon size={14} strokeWidth={1.9} />
              </span>
              <Input
                {...props}
                className="pl-9"
                icon={null}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(`repeatOffenders.search.${modeMeta.placeholderKey}`)}
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear the search query"
                  className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-sm text-ink-3 hover:text-ink-2"
                >
                  <X size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </Field>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------- history -- */

/**
 * The drawer that shows one offender's full history. Rows are the per-finding
 * facts — date, store, region, brand, product, the failed check, the rule
 * and the inspector. The "View" link goes to the package's findings page with
 * a fragment that scrolls to the failed check.
 */
function HistoryDrawer({ offender, open, onClose }) {
  const { t } = useI18n()
  const shops = useResource(() => endpoints.inspections.stores(), {
    label: 'repeat-stores',
  })
  const officers = useResource(() => endpoints.admin.users(), {
    label: 'repeat-users',
  })

  if (!offender) return null
  const shopById = new Map((shops.data ?? []).map((s) => [s.id, s]))
  const userById = new Map((officers.data ?? []).map((u) => [u.id, u]))
  const history = offender.history ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('repeatOffenders.history.title', { name: offender.name })}
      description={t('repeatOffenders.history.caption')}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <MetaStat label={t('repeatOffenders.alert.violations')} value={String(offender.violations ?? 0)} />
        <MetaStat label={t('repeatOffenders.alert.stores')} value={String(offender.stores ?? 0)} />
        <MetaStat label={t('repeatOffenders.alert.lastViolation')} value={pretty(offender.last_violation)} />
        <MetaStat label="Distinct regions" value={String(offender.regions?.length ?? 0)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="nn-eyebrow text-ink-3">Brands</span>
        {(offender.brands ?? []).map((b) => (
          <Pill key={b} icon={Tag}>{b}</Pill>
        ))}
        <span className="ml-3 nn-eyebrow text-ink-3">Regions</span>
        {(offender.regions ?? []).map((r) => (
          <Pill key={r} icon={MapPin}>{r}</Pill>
        ))}
      </div>

      <div className="mt-4 max-h-[55vh] overflow-auto rounded-card border border-divider">
        {history.length === 0 ? (
          <p className="p-4 text-caption text-ink-2">{t('repeatOffenders.history.noHistory')}</p>
        ) : (
          <table className="w-full text-left text-small">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className="nn-eyebrow whitespace-nowrap border-b border-divider px-3 py-2 font-semibold">
                  {t('repeatOffenders.history.colDate')}
                </th>
                <th className="nn-eyebrow border-b border-divider px-3 py-2 font-semibold">
                  {t('repeatOffenders.history.colStore')}
                </th>
                <th className="nn-eyebrow border-b border-divider px-3 py-2 font-semibold">
                  {t('repeatOffenders.history.colRegion')}
                </th>
                <th className="nn-eyebrow border-b border-divider px-3 py-2 font-semibold">
                  {t('repeatOffenders.history.colBrand')}
                </th>
                <th className="nn-eyebrow border-b border-divider px-3 py-2 font-semibold">
                  {t('repeatOffenders.history.colCheck')}
                </th>
                <th className="nn-eyebrow border-b border-divider px-3 py-2 font-semibold">
                  {t('repeatOffenders.history.colRule')}
                </th>
                <th className="nn-eyebrow border-b border-divider px-3 py-2 font-semibold">
                  {t('repeatOffenders.history.colInspector')}
                </th>
                <th className="nn-eyebrow border-b border-divider px-3 py-2 text-right font-semibold">
                  {t('repeatOffenders.history.colView')}
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const shop = shopById.get(h.store_id)
                const officer = userById.get(h.inspector_id)
                const decl = declarationOf(h.check_id)
                const rule = CHECKS[h.check_id]?.citation ?? '—'
                const checkTitle = CHECKS[h.check_id]?.title ?? h.check_id
                return (
                  <tr key={h.id} className="border-t border-divider align-top transition-colors duration-fast ease-settle hover:bg-surface-2">
                    <td className="px-3 py-2.5">
                      <span className="nn-mono text-caption">{pretty(h.date)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-ink">
                      {shop?.name ?? h.store_name ?? (h.store_id ? `Shop #${h.store_id}` : '—')}
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{h.region ?? '—'}</td>
                    <td className="px-3 py-2.5 text-ink">{h.brand ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-col gap-0.5">
                        <span className="font-semibold text-ink">{checkTitle}</span>
                        <span className="nn-mono text-[11px] uppercase tracking-wider text-ink-3">
                          {h.check_id}
                          {decl && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-pill border border-divider bg-surface-2 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-ink-2">
                              {declarationLabel(decl, t)}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[16rem] text-ink-2">
                      <span className="line-clamp-2">{rule}</span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{officer?.full_name ?? `Officer #${h.inspector_id}`}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        to={`/admin/scans/${h.scan_id}#check-${h.check_id}`}
                        className="inline-flex items-center gap-1 font-semibold text-accent-text underline decoration-dotted underline-offset-2"
                      >
                        {t('repeatOffenders.history.colView')}
                        <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-caption text-ink-3">
        Each row opens the package and jumps to the failed check on its findings page.
      </p>
    </Modal>
  )
}

/* ---------------------------------------------------------------- page --- */

export default function RepeatOffenders() {
  const { t } = useI18n()
  useDocumentTitle(t('repeatOffenders.title'))

  /* -------------------------------------------------------------- search -- */
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const [mode, setMode] = useState('manufacturer')
  const [qRaw, setQRaw] = useState(initialQuery)
  const q = useDebounced(qRaw, 200)
  const [openOffender, setOpenOffender] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  function reset() {
    setQRaw('')
  }

  /* -------------------------------------------------------------- data --- */
  const list = useResource(() => endpoints.admin.repeatOffenders(), {
    label: 'repeat-offenders',
  })

  const offenders = list.data?.offenders ?? []

  /* ---------------------------------------------------------- filtering -- */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return offenders
    return offenders.filter((m) => {
      switch (mode) {
        case 'manufacturer':
          return m.name?.toLowerCase().includes(needle)
        case 'brand':
          return (m.brands ?? []).some((b) => b.toLowerCase().includes(needle))
        case 'shop': {
          /* A manufacturer "covers" a shop when any of its history rows
             was recorded at that shop. Client-side join. */
          return (m.history ?? []).some((h) => {
            const shopName = h.store_name?.toLowerCase() ?? ''
            return shopName.includes(needle) || String(h.store_id ?? '').includes(needle)
          })
        }
        case 'region':
          return (m.regions ?? []).some((r) => r.toLowerCase().includes(needle))
        case 'declaration':
          return (m.history ?? []).some((h) => declarationOf(h.check_id) === needle)
        default:
          return true
      }
    })
  }, [offenders, mode, q])

  const top = offenders[0] ?? null

  const appliedCount = q.trim() ? 1 : 0

  function showHistory(o) {
    setOpenOffender(o)
    setHistoryOpen(true)
  }
  function closeHistory() {
    setHistoryOpen(false)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Legal Metrology · enforcement"
        title={t('repeatOffenders.title')}
        subtitle={t('repeatOffenders.subtitle')}
      />

      <div className="mt-6">
        <TopAlertCard
          top={top}
          onShowHistory={showHistory}
          onPick={() => setQRaw(top?.name?.split(' ')[0] ?? '')}
        />
      </div>

      <div className="mt-6">
        <SearchBar
          mode={mode}
          setMode={setMode}
          query={qRaw}
          setQuery={setQRaw}
          appliedCount={appliedCount}
          reset={reset}
        />
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-h2 text-ink">{t('repeatOffenders.list.title')}</h2>
            <p className="mt-1 max-w-prose text-small text-ink-2">
              {t('repeatOffenders.list.caption')}{' '}
              <span className="nn-mono">
                {filtered.length === offenders.length
                  ? `${filtered.length} ${filtered.length === 1 ? 'row' : 'rows'}`
                  : `${filtered.length} of ${offenders.length}`}
              </span>
              .
            </p>
          </div>
        </div>

        {list.error ? (
          <Callout family="violation" title="The list could not be loaded" className="mt-4">
            {list.error.message}
          </Callout>
        ) : list.loading && !list.data ? (
          <Skeleton rows={4} className="mt-4" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title={t('repeatOffenders.list.empty')}
            body="Try clearing the search or switching the search mode to a different column."
            action={
              <Button size="sm" variant="secondary" icon={RotateCcw} onClick={reset}>
                {t('violations.filters.reset')}
              </Button>
            }
          />
        ) : (
          <Card className="mt-4 overflow-x-auto p-0">
            <table className="w-full text-left text-small">
              <thead>
                <tr className="text-caption uppercase tracking-wide text-ink-3">
                  <th className="nn-eyebrow w-[44px] border-b border-divider bg-surface-2 px-4 py-3 font-semibold">
                    {t('repeatOffenders.list.colRank')}
                  </th>
                  <th className="nn-eyebrow border-b border-divider bg-surface-2 px-4 py-3 font-semibold">
                    {t('repeatOffenders.list.colManufacturer')}
                  </th>
                  <th className="nn-eyebrow border-b border-divider bg-surface-2 px-4 py-3 font-semibold">
                    {t('repeatOffenders.list.colBrands')}
                  </th>
                  <th className="nn-eyebrow border-b border-divider bg-surface-2 px-4 py-3 text-right font-semibold">
                    {t('repeatOffenders.list.colViolations')}
                  </th>
                  <th className="nn-eyebrow border-b border-divider bg-surface-2 px-4 py-3 text-right font-semibold">
                    {t('repeatOffenders.list.colStores')}
                  </th>
                  <th className="nn-eyebrow border-b border-divider bg-surface-2 px-4 py-3 font-semibold">
                    {t('repeatOffenders.list.colRegions')}
                  </th>
                  <th className="nn-eyebrow border-b border-divider bg-surface-2 px-4 py-3 font-semibold">
                    {t('repeatOffenders.list.colLast')}
                  </th>
                  <th className="nn-eyebrow border-b border-divider bg-surface-2 px-4 py-3 text-right font-semibold">
                    {t('repeatOffenders.list.colView')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const rank = offenders.findIndex((x) => x.id === m.id) + 1
                  const isTop = m.id === top?.id
                  return (
                    <tr
                      key={m.id}
                      className={cx(
                        'border-t border-divider align-top transition-colors duration-fast ease-settle hover:bg-surface-2',
                        isTop && 'bg-violation-fill/30'
                      )}
                    >
                      <td className="px-4 py-3 nn-mono text-caption font-bold text-ink-2">
                        {String(rank).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-ink">{m.name}</span>
                          {isTop && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-pill border border-violation-border bg-violation-fill px-1.5 py-0.5 text-[10px] font-semibold text-violation-text">
                              <AlertTriangle size={10} strokeWidth={2.2} aria-hidden="true" />
                              Most active
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(m.brands ?? []).slice(0, 3).map((b) => (
                            <Pill key={b} icon={Tag}>{b}</Pill>
                          ))}
                          {m.brands?.length > 3 && (
                            <Pill>+{m.brands.length - 3}</Pill>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="nn-mono text-small font-bold text-violation-text">
                          {m.violations}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right nn-mono text-small font-semibold text-ink">
                        {m.stores}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(m.regions ?? []).map((r) => (
                            <Pill key={r} icon={MapPin}>{r}</Pill>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="nn-mono text-caption text-ink-2 inline-flex items-center gap-1">
                          <CalendarDays size={12} strokeWidth={1.9} className="text-ink-3" aria-hidden="true" />
                          {pretty(m.last_violation)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={ChevronRight}
                          onClick={() => showHistory(m)}
                        >
                          {t('repeatOffenders.list.colView')}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="border-t border-divider px-4 py-2.5 text-caption text-ink-3">
              The list is unpaged. The threshold is three distinct shops in the period shown — a manufacturer with two shops or fewer does not appear.
            </p>
          </Card>
        )}
      </div>

      <Callout family="review" title="About the search" icon={Filter} className="mt-6">
        {t('violations.gap.body')}
      </Callout>

      <HistoryDrawer
        offender={openOffender}
        open={historyOpen}
        onClose={closeHistory}
      />
    </div>
  )
}
