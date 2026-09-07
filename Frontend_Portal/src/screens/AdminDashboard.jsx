/**
 * Admin overview — 08 §4.7.
 *
 * Five decisions, and one deviation from the spec that is deliberate:
 *
 * 1. Five stat cards, because the three-state model needs five. A dashboard with
 *    Success / Violation / Under review has nowhere to put a scan where nine
 *    checks could not be assessed, so those scans quietly inflate one of the
 *    other two. The fifth card is the whole point of the product's honesty.
 *    Out of scope is the fourth scan result and appears in the reconciliation
 *    line under the cards, so the five numbers can be seen to add up.
 *
 * 2. A delta is never coloured. `/admin/dashboard` returns one period, so the
 *    only honest way to say "up on the previous month" is to ask for the
 *    previous month — which this screen does, as a second request. But the
 *    delta is rendered in neutral ink: green on a falling violation count would
 *    imply a target, and an enforcement tool that rewards a low number is an
 *    enforcement tool that teaches its officers to find less.
 *
 * 3. Every chart states its date range and its record count. An unlabelled
 *    chart is not evidence. Every bar also carries its value as a label, so the
 *    charts read without colour and survive greyscale printing.
 *
 * 4. The inspections table joins /stores and /admin/users on the client, because
 *    GET /inspections returns store_id and user_id and no names. It takes no
 *    query parameters either — no filter, no limit, no ordering — so the whole
 *    list arrives and this screen sorts and pages it, and says so in the caption.
 *
 * 5. What §4.7 asks for and this build cannot serve is stated in one panel at the
 *    foot of the screen rather than mocked up as controls that do nothing. A
 *    filter that silently filters nothing is worse than an absent filter.
 *
 * DEVIATION: §4.7 specifies the time chart as a single line with a 20% area
 * fill. It is drawn here as four stacked areas in the verdict colours, because a
 * single line of totals hides the one movement an administrator needs to see —
 * a week where the not-assessed share doubles is a capture problem, and a total
 * line renders it as an ordinary busy week. The grouping toggle the spec asks
 * for is present. Recorded for §2.1a of that document.
 *
 * CONTRACT GAP: AdminDashboardResponse (Backend/schemas.py:213) has
 * top_failed_checks and no not-assessed equivalent, and queries.py has
 * violations_by_check with no counterpart. §4.7 requires the not-assessed chart.
 * It renders when the field is present and states the gap when it is not.
 */

import { Suspense, lazy, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO, startOfISOWeek, startOfMonth, subDays } from 'date-fns'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  ClipboardList,
  Clock,
  Download,
  HelpCircle,
  XCircle,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { endpoints, saveBlob } from '../api/client'
import { useI18n } from '../i18n'
import { CHECKS } from '../lib/checks'
import {
  useDocumentTitle,
  useLocalPref,
  useReducedMotion,
  useResource,
  useSort,
} from '../lib/hooks'
import {
  adminDashboard,
  inspections as inspectionsFixture,
  storesById,
  usersById,
} from '../mock/fixtures'
/* Leaflet rides in its own chunk (lazy) so the map library never inflates
   the first paint of this screen — it loads when the section scrolls in. */
const EnforcementCoverage = lazy(() => import('../components/EnforcementCoverage'))
import {
  Button,
  Callout,
  Card,
  DemoChip,
  EmptyState,
  MetaStat,
  PageHeader,
  Pill,
  SectionTitle,
  Skeleton,
  StatCard,
  Table,
  Tabs,
  Td,
  Tr,
  cx,
} from '../ui'

const RULES_AS_AT = import.meta.env.VITE_RULES_AS_AT ?? '2026-07-01'
const ENGINE_VERSION = import.meta.env.VITE_ENGINE_VERSION ?? '2.0.0'

/* --------------------------------------------------------------- utilities -- */

const CHART_SERIES = ['var(--nn-chart-1)', 'var(--nn-chart-2)', 'var(--nn-chart-3)', 'var(--nn-chart-4)', 'var(--nn-chart-5)']

/* The four scan results, in the order they are reported everywhere else. Out of
   scope takes the muted ink rather than a fifth hue: it is not a milder verdict,
   it is the absence of a duty, and a colour of its own would rank it.

   The label is looked up as `result.<key>` at render time rather than stored
   here, so the chart legend and the stat cards translate together. */
const RESULTS = [
  { key: 'compliant', colour: 'var(--nn-pass-graphic)' },
  { key: 'violation', colour: 'var(--nn-violation-graphic)' },
  { key: 'not_assessed', colour: 'var(--nn-na-graphic)' },
  { key: 'out_of_scope', colour: 'var(--nn-text-3)' },
]

const iso = (d) => format(d, 'yyyy-MM-dd')

function periodFor(days) {
  const end = new Date()
  const start = subDays(end, days - 1)
  const prevEnd = subDays(start, 1)
  const prevStart = subDays(prevEnd, days - 1)
  return { start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd) }
}

function pretty(isoDate) {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'd MMM yyyy')
  } catch {
    return String(isoDate)
  }
}

function shareOf(n, total) {
  if (!total || n == null) return null
  return Math.round((n / total) * 100)
}

/**
 * The delta against the previous window of equal length. Returns null when there
 * is no previous window to compare against — the spec's "where a prior period
 * exists" is a real condition, not a formality, and a first month of use has no
 * comparison to make.
 */
function deltaLabel(now, before, days) {
  if (before == null || now == null) return null
  const diff = now - before
  const period = `the previous ${days} days`
  if (diff === 0) return { label: `Unchanged on ${period}`, tone: 'flat' }
  const sign = diff > 0 ? '+' : '−'
  const pct = before > 0 ? ` (${sign}${Math.round((Math.abs(diff) / before) * 100)}%)` : ''
  return { label: `${sign}${Math.abs(diff)}${pct} on ${period}`, tone: 'flat' }
}

function groupTrend(points, mode) {
  const rows = []
  const index = new Map()
  for (const p of points ?? []) {
    let key = p.day
    let label = p.day
    try {
      const d = parseISO(p.day)
      if (mode === 'week') {
        key = iso(startOfISOWeek(d))
        label = `w/c ${format(startOfISOWeek(d), 'd MMM')}`
      } else if (mode === 'month') {
        key = iso(startOfMonth(d))
        label = format(d, 'MMM yyyy')
      } else {
        label = format(d, 'd MMM')
      }
    } catch {
      /* an unparseable day is still plotted, under its raw key */
    }
    let row = index.get(key)
    if (!row) {
      row = { key, label, compliant: 0, violation: 0, not_assessed: 0, out_of_scope: 0, total: 0 }
      index.set(key, row)
      rows.push(row)
    }
    const c = p.counts ?? {}
    for (const r of RESULTS) row[r.key] += c[r.key] ?? 0
    row.total += c.total ?? 0
  }
  return rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/* Excel and Sheets both execute a cell that opens with =, +, - or @. A shop name
   is never a formula, so every field is neutralised before it is written. */
function csvCell(v) {
  const s = v == null ? '' : String(v)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

function toCsv(header, rows) {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

/* ------------------------------------------------------------------ chrome -- */

function PeriodPills({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Period">
      {options.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={cx(
              'nn-badge min-h-touch px-3.5 transition-colors duration-fast ease-settle',
              active
                ? 'border-accent bg-accent-soft font-semibold text-accent-text'
                : 'border-control bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * One frame for every chart, so the caption can never be forgotten. `range` and
 * `records` are required arguments rather than optional decoration: 08 §4.7 —
 * "an unlabelled chart is not evidence".
 */
function ChartFrame({ title, caption, range, records, children, right, footer }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-h2 text-ink">{title}</h3>
          {caption && <p className="mt-1 max-w-prose text-caption text-ink-2">{caption}</p>}
        </div>
        {right}
      </div>
      <p className="nn-mono mt-2 text-caption text-ink-3">
        {range} · {records}
      </p>
      <div className="mt-4 h-[280px] w-full">{children}</div>
      {footer && <div className="mt-4">{footer}</div>}
    </Card>
  )
}

/**
 * Recharts' default tooltip carries inline light-mode styles, which is exactly
 * the sort of thing that looks finished until the theme is switched. This one
 * uses the same tokens as the rest of the interface.
 */
function ChartTip({ active, payload, label, labelFormatter, total = false }) {
  if (!active || !payload?.length) return null
  const sum = payload.reduce((n, p) => n + (Number(p.value) || 0), 0)
  const heading = labelFormatter ? labelFormatter(label, payload) : label
  return (
    <div className="rounded-card border border-divider bg-surface p-3 shadow-modal">
      <p className="text-caption font-semibold text-ink">{heading}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {payload.map((p) => (
          <li key={p.dataKey ?? p.name} className="flex items-center gap-2 text-caption text-ink-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-pill"
              style={{ background: p.color ?? p.fill }}
            />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="nn-mono font-semibold text-ink">{p.value}</span>
          </li>
        ))}
      </ul>
      {total && payload.length > 1 && (
        <p className="nn-mono mt-1.5 border-t border-divider pt-1.5 text-caption text-ink-2">
          Total {sum}
        </p>
      )}
    </div>
  )
}

const AXIS = { fill: 'var(--nn-text-3)', fontSize: 11 }
const AXIS_MONO = { ...AXIS, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }

/* ------------------------------------------------------------------ charts -- */

/**
 * A ranked bar chart over check ids, used twice: once for the checks that fail
 * most often and once for the checks that most often cannot be assessed.
 *
 * The axis carries the check id rather than its title, because a truncated
 * "Character height meets Table-I for the pa…" is worse than a code with a key
 * beneath it. The key is beneath it, in full, with the provision cited — which is
 * the part an officer actually needs to act on the number.
 */
function RankedChecks({ rows, note, empty }) {
  const reduced = useReducedMotion()
  const data = useMemo(
    () =>
      (rows ?? []).map((r, i) => {
        const meta = CHECKS[r.check_id] ?? null
        return {
          id: r.check_id,
          count: r.count ?? 0,
          short: meta?.short ?? r.title ?? r.check_id,
          title: meta?.title ?? r.title ?? r.check_id,
          citation: meta?.citation ?? null,
          colour: CHART_SERIES[i % CHART_SERIES.length],
        }
      }),
    [rows]
  )

  if (!data.length) {
    return <p className="grid h-full place-items-center text-small text-ink-2">{empty}</p>
  }

  return (
    <div className="flex h-full flex-col gap-3 lg:flex-row">
      <div className="min-h-[150px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
            barCategoryGap="22%"
          >
            <CartesianGrid
              stroke="var(--nn-chart-grid)"
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={AXIS}
              stroke="var(--nn-chart-grid)"
              allowDecimals={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="id"
              width={58}
              tick={AXIS_MONO}
              stroke="var(--nn-chart-grid)"
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--nn-surface-2)' }}
              content={<ChartTip />}
              labelFormatter={(id) => `${id} — ${CHECKS[id]?.short ?? ''}`}
            />
            <Bar dataKey="count" name="Findings" isAnimationActive={!reduced} radius={[0, 3, 3, 0]}>
              {data.map((d) => (
                <Cell key={d.id} fill={d.colour} />
              ))}
              {/* Every bar states its own value, so the chart reads at a glance
                  and survives a greyscale print. 08 §4.7. */}
              <LabelList
                dataKey="count"
                position="right"
                style={{ fill: 'var(--nn-text-2)', fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ol className="flex min-h-0 shrink-0 flex-col gap-1.5 overflow-y-auto lg:w-[46%]">
        {data.map((d) => (
          <li key={d.id} className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-pill"
              style={{ background: d.colour }}
            />
            <span className="min-w-0">
              <span className="nn-mono text-caption font-semibold text-ink">{d.id}</span>{' '}
              <span className="text-caption text-ink-2">{d.title}</span>
              {d.citation && (
                <span className="block text-caption text-ink-3">{d.citation}</span>
              )}
            </span>
          </li>
        ))}
        {note && <li className="mt-1 text-caption text-ink-3">{note}</li>}
      </ol>
    </div>
  )
}

/** The four results over time, stacked. See the DEVIATION note at the top. */
function TrendChart({ rows }) {
  const { t } = useI18n()
  const reduced = useReducedMotion()
  if (!rows?.length) {
    return (
      <p className="grid h-full place-items-center text-small text-ink-2">
        No scans were recorded in this period, so there is nothing to plot.
      </p>
    )
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
        <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS}
          stroke="var(--nn-chart-grid)"
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} allowDecimals={false} />
        <Tooltip cursor={{ stroke: 'var(--nn-text-3)' }} content={<ChartTip total />} />
        {RESULTS.map((r) => (
          <Area
            key={r.key}
            type="monotone"
            dataKey={r.key}
            name={t(`result.${r.key}`)}
            stackId="results"
            stroke={r.colour}
            strokeWidth={1.75}
            fill={r.colour}
            fillOpacity={0.2}
            isAnimationActive={!reduced}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** A shared legend, so the stack can be read without hovering it. */
function ResultLegend() {
  const { t } = useI18n()
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {RESULTS.map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-caption text-ink-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-pill border"
            style={{ background: r.colour, borderColor: r.colour }}
          />
          {t(`result.${r.key}`)}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------- table -- */

const PAGE_SIZE = 10

const COLUMNS = [
  { key: 'id', label: 'Inspection' },
  { key: 'storeName', label: 'Shop' },
  { key: 'inspectorName', label: 'Inspector' },
  { key: 'date', label: 'Date' },
  { key: 'status', label: 'Status' },
  { key: 'scans', label: 'Packages', align: 'right' },
]

const STATUS = {
  /* `submitted` is not a verdict and is not coloured like one. The CHECK
     constraint on the model allows exactly these two values (models.py:113). */
  submitted: { label: 'Submitted', family: null },
  draft: { label: 'Draft', family: 'na' },
}

/**
 * A sortable header cell. Written locally rather than reusing `Th`, because the
 * whole cell has to be the hit area — which means the padding belongs on the
 * button, and `Th` owns its own padding for good reasons elsewhere.
 *
 * `aria-sort` is on the cell, so a screen reader announces the sort state as part
 * of the column rather than as a separate live region. 08 §4.7.
 */
function SortTh({ label, colKey, sort, toggle, align = 'left' }) {
  const active = sort.key === colKey
  const Glyph = sort.dir === 'asc' ? ArrowUp : ArrowDown
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

function RecentInspections({ start, end, rangeLabel }) {
  const [page, setPage] = useState(0)
  const { sort, toggle, compare } = useSort('date', 'desc')

  /* Three requests for one table. GET /inspections returns store_id and user_id
     and no names, so the names have to be fetched and joined here. Stated rather
     than hidden, because it is a contract gap and not a design choice.

     The date window IS server-side: list_inspections accepts store_id, status,
     date_from, date_to and q (routers/inspections.py:180-206). What it does not
     accept is a sort or a page, so those two remain this device's job. */
  const list = useResource(() => endpoints.inspections.list({ date_from: start, date_to: end }), {
    deps: [start, end],
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
        geofence: i.geofence_status ?? null,
      }
    })
  }, [list.data, shops.data, officers.data])

  /* The server has already applied the window (date_from/date_to). This filter is
     the belt to that braces: the fixture path has no server to filter it, and a
     row without a date would otherwise sort to an arbitrary end of the table. */
  const inWindow = useMemo(
    () => rows.filter((r) => r.date != null && r.date >= start && r.date <= end),
    [rows, start, end]
  )
  const sorted = useMemo(() => [...inWindow].sort(compare), [inWindow, compare])

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const slice = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const firstOnPage = sorted.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const lastOnPage = Math.min(sorted.length, (safePage + 1) * PAGE_SIZE)

  const joinIncomplete = shops.error != null || officers.error != null
  const demo = list.demo || shops.demo || officers.demo

  function exportCsv() {
    const csv = toCsv(
      ['Inspection', 'Date', 'Shop', 'City', 'Inspector', 'Employee ID', 'Status', 'Packages', 'In scope', 'Geofence'],
      sorted.map((r) => [
        r.id,
        r.date,
        r.storeName,
        r.storeCity,
        r.inspectorName,
        r.inspectorId,
        STATUS[r.status]?.label ?? r.status,
        r.scans,
        r.inScope === false ? 'No' : r.inScope === true ? 'Yes' : '',
        r.geofence,
      ])
    )
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `niyamnetra-inspections-${start}-to-${end}.csv`)
  }

  return (
    <section className="mt-8">
      <SectionTitle
        right={
          <div className="flex items-center gap-2">
            {demo && <DemoChip />}
            <Button
              icon={Download}
              size="sm"
              onClick={exportCsv}
              disabled={sorted.length === 0}
              disabledReason="There are no inspections in this period to export."
            >
              Export CSV
            </Button>
          </div>
        }
        caption={`Inspections dated ${rangeLabel}, filtered by the server on date_from and date_to. GET /inspections has no sort or page parameter, so this device sorts and pages the ${inWindow.length} rows it returned. Names come from a separate join — the list carries store_id and user_id only.`}
      >
        Recent inspections
      </SectionTitle>

      {joinIncomplete && (
        <Callout family="review" title="Some names could not be resolved" className="mb-4">
          The inspection list arrived, but{' '}
          {[shops.error && '/stores', officers.error && '/admin/users'].filter(Boolean).join(' and ')}{' '}
          did not. Rows below show the numeric id in place of a name rather than a blank cell.
        </Callout>
      )}

      <Card className="overflow-hidden">
        {list.loading ? (
          <div className="p-5">
            <Skeleton lines={6} />
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
            title="No inspections in this period"
            body="Widen the period above, or check that inspections have been submitted from the app."
          />
        ) : (
          <>
            <Table caption={`Inspections between ${rangeLabel}, sorted by ${sort.key}, ${sort.dir}ending`}>
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
                  const s = STATUS[r.status] ?? { label: r.status ?? 'Unknown', family: 'na' }
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
                          <span className="block text-caption text-review-text">
                            Recorded outside the geofence
                          </span>
                        )}
                        {r.geofence === 'unknown' && (
                          <span className="block text-caption text-ink-3">No location recorded</span>
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
    </section>
  )
}

/* ------------------------------------------------------------------ screen -- */

const PERIODS = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
]

const GROUPINGS = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
]

export default function AdminDashboard() {
  const { t } = useI18n()
  const navigate = useNavigate()
  useDocumentTitle(t('admin.overview'))

  const [days, setDays] = useLocalPref('dash.days', 30)
  const [grouping, setGrouping] = useLocalPref('dash.grouping', 'day')
  const { start, end, prevStart, prevEnd } = useMemo(() => periodFor(days), [days])

  const now = useResource(() => endpoints.admin.dashboard({ start, end }), {
    deps: [start, end],
    fallback: adminDashboard,
    label: 'admin-dashboard',
  })

  /* No `fallback`, deliberately. useResource substitutes a fixture only when one
     is given, so a failed prior-period request leaves this undefined and the
     comparison lines simply do not render. A delta measured against invented
     numbers is the one thing worse than no delta at all. */
  const prior = useResource(
    () => endpoints.admin.dashboard({ start: prevStart, end: prevEnd }),
    { deps: [prevStart, prevEnd], label: 'admin-dashboard-prior' }
  )

  const d = now.data
  const c = d?.counts ?? {}
  const total = c.total ?? 0
  const before = prior.data?.counts ?? null

  const summed =
    (c.compliant ?? 0) + (c.violation ?? 0) + (c.not_assessed ?? 0) + (c.out_of_scope ?? 0)
  const countsDisagree = d != null && total !== summed

  const rangeLabel = `${pretty(d?.period_start ?? start)} – ${pretty(d?.period_end ?? end)}`
  const trendRows = useMemo(() => groupTrend(d?.trend, grouping), [d, grouping])
  const trendScans = useMemo(() => trendRows.reduce((n, r) => n + r.total, 0), [trendRows])
  const failedCount = useMemo(
    () => (d?.top_failed_checks ?? []).reduce((n, r) => n + (r.count ?? 0), 0),
    [d]
  )
  const naRows = Array.isArray(d?.top_not_assessed_checks) ? d.top_not_assessed_checks : null
  const naCount = useMemo(() => (naRows ?? []).reduce((n, r) => n + (r.count ?? 0), 0), [naRows])

  const share = (n) => {
    const s = shareOf(n, total)
    return s == null ? `${t('admin.scansCount')}: ${total}` : `${s}% of ${total} packages assessed`
  }

  return (
    <div>
      <PageHeader
        eyebrow="Legal Metrology · enforcement"
        title={t('admin.overview')}
        subtitle={
          <>
            Every figure below counts <strong className="font-semibold">packages</strong>, not
            inspections — one inspection carries several, and each one is assessed on its own.
            Eighteen checks are assessable; the Section 36 tier is derived from them and never
            counted.
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {now.demo && <DemoChip />}
            <PeriodPills value={days} onChange={setDays} options={PERIODS} />
          </div>
        }
        meta={
          <>
            <MetaStat label={t('admin.period')} value={rangeLabel} />
            <MetaStat label="Rules as at" value={RULES_AS_AT} />
            <MetaStat label="Engine" value={ENGINE_VERSION} />
          </>
        }
      />

      {now.error && (
        <Callout
          family="violation"
          title="The overview could not be loaded"
          className="mb-6"
          actions={
            <Button size="sm" onClick={now.reload}>
              {t('common.retry')}
            </Button>
          }
        >
          {now.error.message} The inspection list below is fetched separately and may still load.
        </Callout>
      )}

      {/* ------------------------------------------------------------ cards -- */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label={t('admin.inspectionsCount')}
          value={now.loading ? '' : (d?.inspections ?? 0)}
          loading={now.loading}
          icon={ClipboardList}
          caption={
            d?.active_inspectors != null
              ? `${d.active_inspectors} ${t('admin.activeInspectors').toLowerCase()} in this period`
              : undefined
          }
          trend={deltaLabel(d?.inspections, prior.data?.inspections, days) ?? undefined}
        />
        <StatCard
          label={t('result.compliant')}
          value={now.loading ? '' : (c.compliant ?? 0)}
          loading={now.loading}
          family="pass"
          icon={CheckCircle}
          caption={share(c.compliant)}
          trend={deltaLabel(c.compliant, before?.compliant, days) ?? undefined}
        />
        <StatCard
          label={t('result.violation')}
          value={now.loading ? '' : (c.violation ?? 0)}
          loading={now.loading}
          family="violation"
          icon={XCircle}
          caption={share(c.violation)}
          trend={deltaLabel(c.violation, before?.violation, days) ?? undefined}
        />
        <StatCard
          label={t('admin.reviewQueueCount')}
          value={now.loading ? '' : (d?.review_queue ?? 0)}
          loading={now.loading}
          family="review"
          icon={Clock}
          onClick={() => navigate('/admin/review-queue')}
          /* Not period-scoped, and saying so matters: an officer comparing this
             against the cards beside it would otherwise read the queue as
             something this month produced. */
          caption="Findings awaiting an officer's decision — the queue as it stands now, not this period"
        />
        <StatCard
          label={t('result.not_assessed')}
          value={now.loading ? '' : (c.not_assessed ?? 0)}
          loading={now.loading}
          family="na"
          icon={HelpCircle}
          caption={share(c.not_assessed)}
          trend={deltaLabel(c.not_assessed, before?.not_assessed, days) ?? undefined}
        />
      </section>

      {/* The arithmetic, in one line. Five cards that cannot be added up are five
          numbers a reviewer has to take on trust. */}
      {!now.loading && d != null && (
        <p className="mt-3 max-w-prose text-caption text-ink-2">
          <span className="nn-mono font-semibold text-ink">{total}</span> packages assessed
          between {rangeLabel}:{' '}
          <span className="nn-mono">{c.compliant ?? 0}</span> success,{' '}
          <span className="nn-mono">{c.violation ?? 0}</span> violation,{' '}
          <span className="nn-mono">{c.not_assessed ?? 0}</span> not assessed,{' '}
          <span className="nn-mono">{c.out_of_scope ?? 0}</span> out of scope. Out of scope is the
          fourth result and has no card of its own: there was no duty to breach.
          {prior.error != null && ' No comparison is shown — the previous period did not load.'}
        </p>
      )}

      {countsDisagree && (
        <Callout family="review" title="The counts do not reconcile" className="mt-4">
          The endpoint reports a total of <span className="nn-mono">{total}</span> and four results
          that add to <span className="nn-mono">{summed}</span>. Both figures are shown as
          returned; this screen will not pick one. Check{' '}
          <span className="nn-mono">queries.py</span> before quoting either.
        </Callout>
      )}

      {/* ----------------------------------------------------------- charts -- */}
      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <ChartFrame
          title={t('admin.topFailed')}
          caption="Checks that failed most often in this period, with the provision each one enforces."
          range={rangeLabel}
          records={`${failedCount} failing findings across ${(d?.top_failed_checks ?? []).length} checks`}
        >
          {now.loading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <RankedChecks
              rows={d?.top_failed_checks}
              empty="No check failed in this period."
              note="Ranked by the number of findings, not by severity — a minor omission repeated often ranks above a rare critical one."
            />
          )}
        </ChartFrame>

        <ChartFrame
          title={t('admin.trend')}
          caption="Results by day, stacked. The height of the stack is the number of packages assessed."
          range={rangeLabel}
          records={`${trendRows.length} ${grouping === 'day' ? 'days' : grouping === 'week' ? 'weeks' : 'months'} · ${trendScans} packages`}
          right={
            <Tabs tabs={GROUPINGS} value={grouping} onChange={setGrouping} />
          }
          footer={<ResultLegend />}
        >
          {now.loading ? <Skeleton className="h-full w-full" /> : <TrendChart rows={trendRows} />}
        </ChartFrame>

        {naRows ? (
          <ChartFrame
            title={t('admin.topNotAssessed')}
            caption={t('admin.topNotAssessedCaption')}
            range={rangeLabel}
            records={`${naCount} not-assessed findings across ${naRows.length} checks`}
          >
            <RankedChecks
              rows={naRows}
              empty="Every check was assessed on every package in this period."
              note="A count here is a gap in the evidence, not a finding against a shop. Nothing on this chart is a violation."
            />
          </ChartFrame>
        ) : (
          <Card className="flex flex-col p-5">
            <h3 className="text-h2 text-ink">{t('admin.topNotAssessed')}</h3>
            <p className="mt-1 max-w-prose text-caption text-ink-2">
              {t('admin.topNotAssessedCaption')}
            </p>
            <Callout family="review" title="This chart has no data source yet" className="mt-4">
              <span className="nn-mono">AdminDashboardResponse</span> returns{' '}
              <span className="nn-mono">top_failed_checks</span> and no not-assessed equivalent, and{' '}
              <span className="nn-mono">queries.py</span> has{' '}
              <span className="nn-mono">violations_by_check</span> with no counterpart. 08 §4.7 asks
              for this chart, so the gap is named here rather than filled with a plausible axis. It
              renders as soon as the field exists.
            </Callout>
            <p className="mt-3 text-caption text-ink-3">
              Until then, <span className="nn-mono">not assessed</span> per check is visible one
              scan at a time on a findings page.
            </p>
          </Card>
        )}

        <Card className="flex flex-col p-5">
          <h3 className="text-h2 text-ink">What this screen does not show</h3>
          <p className="mt-1 max-w-prose text-caption text-ink-2">
            08 §4.7 asks for five things the API cannot serve today. They are listed rather than
            mocked, because a control that silently does nothing is worse than an absent one.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {[
              [
                'Repeat violators',
                'Served by GET /admin/repeat-violators — stores ranked by violation count with last-violation date. The 50 m proximity note still needs capture-point clustering; coordinates are exposed (inspection latitude/longitude, store points via /stores) but no map component ships yet.',
              ],
              [
                'One verdict per inspection',
                'An inspection carries several packages and each is assessed on its own, so there is no single verdict to badge. _inspection_dict now carries overall_result/result/verdict rollups plus result_counts and check aggregates for list display.',
              ],
              [
                'Package thumbnails in the table',
                'Served by GET /scans/{id}/images/{image_id}/thumbnail (512px, auth). The detail view renders them; retained images only — purged compliant captures show metadata.',
              ],
              [
                'A commodity or category filter',
                'GET /inspections q now matches shop, commodity, brand and batch via a scans join. Category remains unindexed.',
              ],
              [
                'Excel export, and a PDF of this whole range',
                'Served: GET /reports/range.{pdf,docx,xlsx,csv} (own visits) and GET /admin/reports/range.{pdf,docx,xlsx,csv} (office-wide, optional user_id). The CSV button below remains a client-built convenience.',
              ],
            ].map(([title, body]) => (
              <li key={title} className="border-l-2 border-divider pl-3">
                <p className="text-small font-semibold text-ink">{title}</p>
                <p className="mt-0.5 max-w-prose text-caption text-ink-2">{body}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <RecentInspections start={start} end={end} rangeLabel={rangeLabel} />
      <Suspense fallback={<Card className="mt-6 p-5"><p className="text-caption text-ink-3">Loading coverage…</p></Card>}>
        <EnforcementCoverage start={start} end={end} />
      </Suspense>
    </div>
  )
}
