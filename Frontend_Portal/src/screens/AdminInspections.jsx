/**
 * All inspections — the admin list.
 *
 * Five decisions, and one of them corrects an earlier assumption in this project.
 *
 * 1. THE FILTERS ARE THE ENDPOINT'S FILTERS, NOT A LONGER WISHLIST.
 *    GET /inspections accepts exactly five parameters (routers/inspections.py:180)
 *    — store_id, status, date_from, date_to and q — so this screen offers exactly
 *    those five and nothing else. A filter for commodity or for city would have to
 *    be applied on this device over an unpaged list, which reads as a server
 *    filter and is not one. The panel at the foot names what is missing instead.
 *
 * 2. `q` SEARCHES THE SHOP NAME ONLY. The endpoint joins Store and matches
 *    Store.name ILIKE %q%; its own comment says commodity and brand search "is
 *    done client-side for now". The field is therefore labelled "Shop name" and
 *    not "Search", because a box labelled Search that silently ignores a brand
 *    name teaches an officer that the brand is absent from the data.
 *
 * 3. NAMES ARE JOINED HERE, AND THE JOIN CAN FAIL INDEPENDENTLY. The list carries
 *    store_id and user_id; /stores and /admin/users carry the names. Three
 *    requests, and if either name request fails the rows still render with the
 *    numeric id, under a notice naming which one did not arrive.
 *
 * 4. SORTING AND PAGING ARE THIS DEVICE'S JOB, because the endpoint has neither
 *    parameter. Said in the caption, with the row count, so the officer can see
 *    that the whole filtered set is present rather than a first page of it.
 *
 * 5. STATUS HAS TWO VALUES, NOT THREE. models.py constrains it to
 *    ('draft','submitted') — there is no 'reviewed'. The filter offers the two
 *    that exist.
 *
 * CORRECTION recorded here on purpose: an earlier note in this project stated
 * that GET /inspections "accepts no query parameters". It does. The dashboard's
 * caption has been corrected too. The rule that produced the error — read the
 * router, not the memory of the router — is the one worth keeping.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Download,
  Filter,
  MapPin,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { endpoints, saveBlob } from '../api/client'
import { useI18n } from '../i18n'
import { useDebounced, useDocumentTitle, useResource, useSort } from '../lib/hooks'
import {
  inspections as inspectionsFixture,
  storesById,
  usersById,
} from '../mock/fixtures'
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
  Select,
  Skeleton,
  Table,
  Td,
  Tr,
  cx,
} from '../ui'

const PAGE_SIZE = 25

/* The two values models.py permits, plus the do-not-filter option. */
const STATUSES = [
  { value: '', label: 'Any status' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'draft', label: 'Draft' },
]

const STATUS_META = {
  submitted: { label: 'Submitted', family: null },
  draft: { label: 'Draft', family: 'na' },
}

/* Presets, and a Custom row that is always available. A preset writes real dates
   into the two inputs rather than holding a separate mode, so what is sent to the
   server is always exactly what the two date fields show. */
const PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All dates', days: null },
]

const COLUMNS = [
  { key: 'id', label: 'Inspection' },
  { key: 'storeName', label: 'Shop' },
  { key: 'inspectorName', label: 'Inspector' },
  { key: 'date', label: 'Date' },
  { key: 'status', label: 'Status' },
  { key: 'scans', label: 'Packages', align: 'right' },
]

const iso = (d) => format(d, 'yyyy-MM-dd')

function pretty(isoDate) {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'd MMM yyyy')
  } catch {
    return String(isoDate)
  }
}

function csvCell(v) {
  const s = v == null ? '' : String(v)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

function toCsv(header, rows) {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

/**
 * A sortable header cell. The whole cell is the hit area, so the padding belongs
 * on the button and the th carries none — which is why this is a plain th rather
 * than the Th primitive, whose own px-4 py-3 cannot be overridden by a later
 * class (Tailwind emits padding before padding-left).
 */
function SortTh({ label, colKey, sort, toggle, align = 'left' }) {
  const active = sort.key === colKey
  const Glyph = active && sort.dir === 'desc' ? ArrowDown : ArrowUp
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="whitespace-nowrap border-b border-divider bg-surface-2 p-0"
    >
      <button
        type="button"
        onClick={() => toggle(colKey)}
        className={cx(
          'nn-eyebrow flex min-h-touch w-full items-center gap-1.5 px-4 py-3',
          'transition-colors duration-fast ease-settle hover:text-ink',
          align === 'right' ? 'justify-end' : 'justify-start',
          active && 'text-ink'
        )}
      >
        {label}
        <Glyph
          size={13}
          strokeWidth={2.4}
          aria-hidden="true"
          className={active ? 'text-accent-text' : 'text-ink-3 opacity-0'}
        />
      </button>
    </th>
  )
}

/* ------------------------------------------------------------------- shop ---- */

/**
 * A type-to-search shop picker. The officer types; the list narrows as they
 * type; picking a row selects that shop. This replaces the old <select>, which
 * made an officer scroll a long list instead of typing three letters.
 */
function ShopCombobox({ options, value, onChange, disabled, ...props }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = options.find((s) => String(s.id) === String(value)) ?? null

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 8)
    return options
      .filter(
        (s) =>
          String(s.name).toLowerCase().includes(q) ||
          String(s.city ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [options, query])

  const label = (s) => (s.city ? `${s.name} — ${s.city}` : s.name)
  const display = selected && query === '' ? label(selected) : query

  function pick(s) {
    onChange(String(s.id))
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        {...props}
        value={display}
        disabled={disabled}
        placeholder="Type a shop name…"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value)
          if (selected) onChange('')
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && open && matches.length > 0) {
            e.preventDefault()
            pick(matches[0])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {selected && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            setQuery('')
            setOpen(false)
          }}
          aria-label="Clear the shop filter"
          className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-sm text-ink-3 hover:text-ink-2"
        >
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {open && !selected && matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Matching shops"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-sm border border-divider bg-surface py-1 shadow-modal"
        >
          {matches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="flex min-h-touch w-full items-center justify-between gap-3 px-3 text-left text-small text-ink transition-colors duration-fast ease-settle hover:bg-surface-2"
              >
                <span className="truncate">{s.name}</span>
                {s.city && (
                  <span className="nn-mono shrink-0 text-caption text-ink-3">{s.city}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AdminInspections() {
  const { t } = useI18n()
  useDocumentTitle(t('nav.inspections'))

  /* Filter state. Held here rather than in the URL because the endpoint returns
     the whole filtered set at once — a shared link would restore the filters but
     not a page position, so there is nothing durable to put in the query string
     that is not already visible in the controls. */
  const today = iso(new Date())
  const [storeId, setStoreId] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState(iso(subDays(new Date(), 29)))
  const [to, setTo] = useState(today)
  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw.trim(), 350)
  const [categoryRaw, setCategoryRaw] = useState('')
  const category = useDebounced(categoryRaw.trim().toLowerCase(), 350)
  const [page, setPage] = useState(0)
  const { sort, toggle, compare } = useSort('date', 'desc')

  /* Only the parameters the officer actually set are sent. An empty string for
     status would be `status=` and match nothing, which is a different answer from
     "do not filter on status". */
  const params = useMemo(() => {
    const p = {}
    if (storeId) p.store_id = Number(storeId)
    if (status) p.status = status
    if (from) p.date_from = from
    if (to) p.date_to = to
    if (q) p.q = q
    if (category) p.category = category
    return p
  }, [storeId, status, from, to, q, category])

  const key = JSON.stringify(params)

  const list = useResource(() => endpoints.inspections.list(params), {
    deps: [key],
    fallback: inspectionsFixture,
    label: 'inspections',
  })
  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: 'stores',
  })
  const officers = useResource(() => endpoints.admin.users(), {
    fallback: Object.values(usersById),
    label: 'users',
  })

  const shopOptions = useMemo(
    () => [...(shops.data ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [shops.data]
  )

  const rows = useMemo(() => {
    const shopById = new Map((shops.data ?? []).map((s) => [s.id, s]))
    const userById = new Map((officers.data ?? []).map((u) => [u.id, u]))
    return (list.data ?? []).map((i) => {
      const shop = shopById.get(i.store_id)
      const officer = userById.get(i.user_id)
      return {
        id: i.id,
        date: i.inspection_date ?? null,
        storeName: shop?.name ?? `Shop #${i.store_id}`,
        storeCity: shop?.city ?? null,
        inspectorName: officer?.full_name ?? `Officer #${i.user_id}`,
        inspectorId: officer?.employee_id ?? null,
        status: i.status ?? null,
        scans: i.scan_count ?? 0,
        inScope: i.in_scope,
        outOfScopeReason: i.out_of_scope_reason ?? null,
        transaction: i.transaction_type ?? null,
        geofence: i.geofence_status ?? null,
        geofenceDistance: i.geofence_distance_m ?? null,
        mockLocation: i.mock_location === true,
        signature: i.signature_status ?? null,
      }
    })
  }, [list.data, shops.data, officers.data])

  const sorted = useMemo(() => [...rows].sort(compare), [rows, compare])

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const slice = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const firstOnPage = sorted.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const lastOnPage = Math.min(sorted.length, (safePage + 1) * PAGE_SIZE)

  /* Reset the page whenever the filters change, without an effect: the request
     key is part of the comparison, so a new key means page 0. */
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setPage(0)
  }

  const joinIncomplete = shops.error != null || officers.error != null
  const demo = list.demo || shops.demo || officers.demo
  const filtered = Boolean(storeId || status || q) || from !== '' || to !== ''

  const counts = useMemo(() => {
    let submitted = 0
    let draft = 0
    let outOfScope = 0
    let packages = 0
    for (const r of rows) {
      if (r.status === 'submitted') submitted += 1
      if (r.status === 'draft') draft += 1
      if (r.inScope === false) outOfScope += 1
      packages += r.scans
    }
    return { submitted, draft, outOfScope, packages }
  }, [rows])

  function applyPreset(p) {
    if (p.days == null) {
      setFrom('')
      setTo('')
      return
    }
    setFrom(iso(subDays(new Date(), p.days - 1)))
    setTo(iso(new Date()))
  }

  function clearAll() {
    setStoreId('')
    setStatus('')
    setQRaw('')
    setFrom(iso(subDays(new Date(), 29)))
    setTo(today)
  }

  function exportCsv() {
    const csv = toCsv(
      [
        'Inspection',
        'Date',
        'Shop',
        'City',
        'Inspector',
        'Employee ID',
        'Status',
        'Packages',
        'In scope',
        'Transaction type',
        'Geofence',
        'Distance from shop (m)',
        'Signature',
      ],
      sorted.map((r) => [
        r.id,
        r.date,
        r.storeName,
        r.storeCity,
        r.inspectorName,
        r.inspectorId,
        STATUS_META[r.status]?.label ?? r.status,
        r.scans,
        r.inScope === false ? 'No' : r.inScope === true ? 'Yes' : '',
        r.transaction,
        r.geofence,
        r.geofenceDistance == null ? '' : Math.round(r.geofenceDistance),
        r.signature,
      ])
    )
    const span = from || to ? `${from || 'start'}-to-${to || 'today'}` : 'all-dates'
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `niyamnetra-inspections-${span}.csv`)
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Legal Metrology · enforcement"
        title={t('nav.inspections')}
        subtitle="Every visit recorded by every officer in your jurisdiction. Filters marked below are applied by the server; sorting and paging are done in this browser."
        actions={
          <div className="flex items-center gap-2">
            {demo && <DemoChip />}
            <Button
              icon={Download}
              size="sm"
              onClick={exportCsv}
              disabled={sorted.length === 0}
              disabledReason="There are no inspections in this result to export."
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------ filters -- */}
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter size={15} strokeWidth={1.9} aria-hidden="true" className="text-ink-3" />
            <h2 className="text-h2 text-ink">Filters</h2>
            <span className="nn-badge border-control bg-surface-2 text-ink-3">server-side</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            onClick={clearAll}
            disabled={!filtered}
            disabledReason="Nothing is filtered."
          >
            Reset
          </Button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Search"
            hint="Matches shop, commodity, brand and batch."
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

          <Field
            label="Shop"
            hint={
              shops.error
                ? 'The shop list did not load; filter by name instead.'
                : 'Type to search shops by name, then pick one.'
            }
          >
            {(props) => (
              <ShopCombobox
                {...props}
                options={shopOptions}
                value={storeId}
                onChange={setStoreId}
                disabled={shops.error != null || shopOptions.length === 0}
              />
            )}
          </Field>

          <Field label="Status" hint="Draft or submitted. The schema permits no third value.">
            {(props) => (
              <Select {...props} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Category"
            hint="Package commodity category, e.g. food, beverage. Exact match."
          >
            {(props) => (
              <Input
                {...props}
                value={categoryRaw}
                onChange={(e) => setCategoryRaw(e.target.value)}
                placeholder="e.g. food"
                autoComplete="off"
                spellCheck={false}
              />
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
                  'nn-badge min-h-touch px-3.5 transition-colors duration-fast ease-settle',
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

      {/* ------------------------------------------------------------- result -- */}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-small text-ink-2">
          <span className="nn-mono font-semibold text-ink">{sorted.length}</span>{' '}
          {sorted.length === 1 ? 'inspection' : 'inspections'} ·{' '}
          <span className="nn-mono font-semibold text-ink">{counts.packages}</span>{' '}
          {counts.packages === 1 ? 'package' : 'packages'} ·{' '}
          <span className="nn-mono">{counts.submitted}</span> submitted,{' '}
          <span className="nn-mono">{counts.draft}</span> draft
          {counts.outOfScope > 0 && (
            <>
              {' '}
              · <span className="nn-mono">{counts.outOfScope}</span> recorded as out of scope at the
              inspection level
            </>
          )}
        </p>
        <p className="nn-mono text-caption text-ink-3">
          {from || to ? `${from || 'earliest'} → ${to || today}` : 'all dates'}
        </p>
      </div>

      {joinIncomplete && (
        <Callout family="review" title="Some names could not be resolved" className="mt-4">
          The inspection list arrived, but{' '}
          {[shops.error && '/stores', officers.error && '/admin/users'].filter(Boolean).join(' and ')}{' '}
          did not. Rows below show the numeric id in place of a name rather than a blank cell.
        </Callout>
      )}

      <Card className="mt-4 overflow-hidden">
        {list.loading ? (
          <div className="p-5">
            <Skeleton lines={8} />
          </div>
        ) : list.error ? (
          <Callout
            family="violation"
            title="The inspection list could not be loaded"
            className="m-5"
            actions={
              <Button size="sm" onClick={list.reload}>
                Try again
              </Button>
            }
          >
            {list.error.message}
          </Callout>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={filtered ? 'No inspections match these filters' : 'No inspections recorded yet'}
            body={
              filtered
                ? 'Widen the date range, clear the shop name, or set the status back to Any.'
                : 'Inspections appear here as officers submit them from the app.'
            }
            action={
              filtered ? (
                <Button size="sm" icon={RotateCcw} onClick={clearAll}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table
              caption={`${sorted.length} inspections, sorted by ${sort.key}, ${sort.dir}ending. Showing ${firstOnPage} to ${lastOnPage}.`}
            >
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <SortTh
                      key={c.key}
                      label={c.label}
                      colKey={c.key}
                      sort={sort}
                      toggle={toggle}
                      align={c.align}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => {
                  const s = STATUS_META[r.status] ?? { label: r.status ?? 'Unknown', family: 'na' }
                  return (
                    <Tr key={r.id}>
                      <Td className="align-top">
                        <Link
                          to={`/admin/inspections/${r.id}`}
                          className="nn-mono font-semibold text-accent-text underline decoration-dotted underline-offset-2"
                        >
                          #{r.id}
                        </Link>
                      </Td>
                      <Td className="align-top">
                        <span className="font-medium text-ink">{r.storeName}</span>
                        {r.storeCity && (
                          <span className="block text-caption text-ink-3">{r.storeCity}</span>
                        )}
                        {r.inScope === false && (
                          <Pill family="na" className="mt-1.5">
                            Out of scope
                          </Pill>
                        )}
                      </Td>
                      <Td className="align-top">
                        <span className="text-ink-2">{r.inspectorName}</span>
                        {r.inspectorId && (
                          <span className="nn-mono block text-caption text-ink-3">
                            {r.inspectorId}
                          </span>
                        )}
                      </Td>
                      <Td className="nn-mono align-top text-ink-2">{pretty(r.date)}</Td>
                      <Td className="align-top">
                        <Pill family={s.family ?? undefined}>{s.label}</Pill>
                        {r.geofence === 'outside' && (
                          <span className="mt-1 flex items-center gap-1 text-caption text-review-text">
                            <MapPin size={12} strokeWidth={2} aria-hidden="true" />
                            {r.geofenceDistance == null
                              ? 'Outside the geofence'
                              : `${Math.round(r.geofenceDistance)} m from the shop`}
                          </span>
                        )}
                        {r.geofence === 'unknown' && (
                          <span className="block text-caption text-ink-3">No location recorded</span>
                        )}
                        {r.mockLocation && (
                          <span className="block text-caption text-review-text">
                            Device reported a mock location
                          </span>
                        )}
                      </Td>
                      <Td align="right" className="nn-mono align-top text-ink">
                        {r.scans}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-4 py-3">
              <p className="nn-mono text-caption text-ink-3">
                {firstOnPage}–{lastOnPage} of {sorted.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  disabledReason="This is the first page."
                >
                  Previous
                </Button>
                <span className="nn-mono text-caption text-ink-3">
                  {safePage + 1} / {pages}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPage(Math.min(pages - 1, safePage + 1))}
                  disabled={safePage >= pages - 1}
                  disabledReason="This is the last page."
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="text-h2 text-ink">What this list cannot filter or show</h2>
        <p className="mt-1 max-w-prose text-caption text-ink-2">
          Named rather than mocked, so a reviewer can tell a missing feature from a broken one.
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {[
            [
              'Commodity, brand or batch',
              'These live on the scan. GET /inspections joins Store only, and its own comment says commodity and brand search "is done client-side for now". Filtering on them would mean fetching every scan of every inspection, so the option is not offered.',
            ],
            [
              'City, district or jurisdiction',
              'The shop carries a city and the officer carries a jurisdiction, but neither is a parameter of the list endpoint. Choosing a shop by name is the nearest thing that is genuinely server-side.',
            ],
            [
              'A result column',
              'A verdict belongs to a package, not to a visit, and _inspection_dict carries no per-inspection tally. The Packages column is a count of packages, deliberately not a score.',
            ],
            [
              'Server-side paging',
              'The endpoint returns every matching row. With a wide date range that is a large response, which is why the default window is the last thirty days rather than all dates.',
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
