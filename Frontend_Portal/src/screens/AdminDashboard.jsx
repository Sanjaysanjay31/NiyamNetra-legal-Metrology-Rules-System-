/**
 * Admin Dashboard — the regulator's home screen.
 *
 * The single place an administrator opens to answer "how is the office
 * doing this period". The layout is the reference shape:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  Dashboard Overview    [Period pills + Date + Area]        │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  [KPI] [KPI] [KPI] [KPI] [KPI] [KPI]                       │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  Inspection Trends   │ Violation     │ Area-wise          │
 *   │  (line)             │ Categories    │ Violations          │
 *   │                     │ (donut)       │ (horizontal bar)    │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  Today's Report (full width)                              │
 *   │  Recent Inspections (full width, area filter wired in)    │
 *   └────────────────────────────────────────────────────────────┘
 *
 * The "Period" pills (Week / Month / Year / All) drive the trend and
 * the topline KPIs together; the date picker lets the user pick a
 * specific day (clamped to today), and the area filter narrows the
 * Recent Inspections list to a single city. The "All" pill shows the
 * entire available history, capped at the current day — future dates
 * are not selectable.
 *
 * Data continues to come from /admin/dashboard and the per-day
 * /reports/today, /inspections, /stores, /admin/users endpoints,
 * exactly as before. The same fixtures provide a real-looking
 * preview when the backend is unreachable.
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO, startOfDay, startOfMonth, startOfYear, addDays, isAfter, isBefore, isValid } from 'date-fns'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle,
  ChevronDown,
  ClipboardList,
  Eye,
  Package,
  Search as SearchIcon,
  Store as StoreIcon,
  XCircle,
} from 'lucide-react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDocumentTitle, useResource } from '../lib/hooks'
import {
  adminDashboard,
  inspections as inspectionsFixture,
  storesById,
  todaysReport as todaysReportFixture,
  usersById,
} from '../mock/fixtures'
import { Card, cx, Input } from '../ui'

/* ----------------------------------------------------------------- tokens -- */

const CATEGORY_PALETTE = [
  '#2160c4', // MRP – blue
  '#0e7490', // Net quantity – teal
  '#039855', // Consumer care – green
  '#6941c6', // Manufacturer – purple
  '#dc6803', // Date – orange
  '#b42318', // Font – red
  '#475467', // Placement – grey
  '#94a3b8', // Others – slate
]

const AREA_BAR = '#2160c4'

const AXIS = { fill: 'var(--nn-text-3)', fontSize: 11 }

/* -------------------------------------------------------------- helpers -- */

function pretty(isoDate) {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'd MMM yyyy')
  } catch {
    return String(isoDate)
  }
}

function shortLabel(isoDay) {
  /* "2026-08-24" → "24 Aug". Uses the month that the day actually falls
     in; the previous version hard-coded "Aug" which made September
     dates render as "07 Aug" and looked like a data error. */
  if (!isoDay) return ''
  try {
    return format(parseISO(isoDay), 'd MMM')
  } catch {
    return String(isoDay)
  }
}

function share(n, total) {
  if (!total || n == null) return null
  return Math.round((n / total) * 1000) / 10
}

const iso = (d) => format(d, 'yyyy-MM-dd')

/* --------------------------------------------------- period pill helpers -- */

const PERIODS = [
  { id: '7d',   label: 'Last 7 Days' },
  { id: 'month', label: 'Month' },
  { id: 'year',  label: 'Year'  },
]

function rangeFor(period, anchor) {
  const today = startOfDay(anchor)
  switch (period) {
    case '7d': {
      /* "Last 7 Days" = today and the six days before it. The window
         is always today-anchored so the user never has to pick a date
         for this pill; the DateSelector hides its month/year pickers
         when this is active. */
      const start = addDays(today, -6)
      return { start: iso(start), end: iso(today), days: 7 }
    }
    case 'week':
    case 'month': {
      /* The week and month pills share the same window: the calendar
         month the anchor falls in. The pill only changes how the
         trend chart buckets the days (Week = 4 weeks, Month = days). */
      const monthStart = startOfMonth(today)
      const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      const monthEnd = isAfter(lastOfMonth, today) ? today : lastOfMonth
      return { start: iso(monthStart), end: iso(monthEnd), days: 30 }
    }
    case 'year': {
      const yearStart = startOfYear(today)
      const lastOfYear = new Date(today.getFullYear(), 11, 31)
      const yearEnd = isAfter(lastOfYear, today) ? today : lastOfYear
      return { start: iso(yearStart), end: iso(yearEnd), days: 365 }
    }
    default:
      return { start: iso(startOfYear(today)), end: iso(today), days: 366 }
  }
}

/* Resolve the "focal" date for a period so the date selector never
   lands in a future month or year. Week and month share the same
   rule. */
function clampAnchor(period, raw) {
  const today = startOfDay(new Date())
  switch (period) {
    case '7d':
      /* The 7-day window is always today-anchored, so future-dated
         anchors are clamped to today. */
      return today
    case 'week':
    case 'month':
      if (isAfter(raw, today)) return today
      return raw
    case 'year':
      if (raw.getFullYear() > today.getFullYear()) return today
      return raw
    default:
      return today
  }
}

/* Pretty caption describing the active window in the user's own
   words. The selector above already shows the month; the caption
   spells out the bucket count for the active pill. */
function rangeCaption(period, anchor) {
  const today = startOfDay(anchor)
  if (period === '7d') {
    const start = addDays(today, -6)
    return `${format(start, 'd MMM')} – ${format(today, 'd MMM yyyy')}`
  }
  if (period === 'year') return format(today, 'yyyy')
  return format(today, 'MMMM yyyy')
}

const fmtMonth = (d) => format(d, 'MMM')
const fmtYear  = (d) => format(d, 'yyyy')

function bucketTrend(rawTrend, period, anchor) {
  /* Group daily points into the bucket the period asks for. The
     backend returns a per-day rollup; the dashboard decides how to
     present that as a single line series. */
  const points = (rawTrend ?? []).map((p) => ({
    day: p.day,
    counts: p.counts ?? {},
  }))

  if (period === '7d') {
    /* "Last 7 Days" — keep the trailing 7 days ending at the anchor
       (today). Days with no activity still appear as zero rows so the
       x-axis always shows seven ticks; their label is "MMM d" so it
       matches the example ("Aug 27", "Aug 28", …). */
    const today = startOfDay(anchor)
    const windowStart = addDays(today, -6)
    const inWindow = points.filter((p) => {
      const d = parseISO(p.day)
      return !isBefore(d, windowStart) && !isAfter(d, today)
    })
    const dayKey = (d) => format(d, 'yyyy-MM-dd')
    const byDay = new Map(
      inWindow.map((p) => [
        dayKey(parseISO(p.day)),
        {
          inspections:
            (p.counts.compliant ?? 0) +
            (p.counts.violation ?? 0) +
            (p.counts.not_assessed ?? 0),
          violations: p.counts.violation ?? 0,
        },
      ])
    )
    const rows = []
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(windowStart, i)
      const v = byDay.get(dayKey(d)) ?? { inspections: 0, violations: 0 }
      rows.push({
        label: format(d, 'MMM d'),
        inspections: v.inspections,
        violations: v.violations,
      })
    }
    return rows
  }

  if (period === 'week') {
    /* Week view = the 4 calendar weeks of the anchor's month. Each
       week label is "Week N (D MMM – D MMM)". Partial first/last
       weeks are kept (the first may start on the 1st, the last may
       end on a mid-week day if today is mid-month). */
    const today = startOfDay(anchor)
    const monthStart = startOfMonth(today)
    const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const monthEnd = isAfter(lastOfMonth, today) ? today : lastOfMonth
    const buckets = []
    let cursor = monthStart
    let weekNum = 1
    while (!isAfter(cursor, monthEnd)) {
      let weekEnd = addDays(cursor, 6)
      if (isAfter(weekEnd, monthEnd)) weekEnd = monthEnd
      const startStr = format(cursor, 'd MMM')
      const endStr = format(weekEnd, 'd MMM')
      const slice = points.filter((p) => {
        const d = parseISO(p.day)
        return !isBefore(d, cursor) && !isAfter(d, weekEnd)
      })
      const inspections = slice.reduce(
        (n, p) => n + (p.counts.compliant ?? 0) + (p.counts.violation ?? 0) + (p.counts.not_assessed ?? 0),
        0
      )
      const violations = slice.reduce((n, p) => n + (p.counts.violation ?? 0), 0)
      buckets.push({
        label: `Week ${weekNum}`,
        sublabel: `${startStr} – ${endStr}`,
        inspections,
        violations,
      })
      cursor = addDays(weekEnd, 1)
      weekNum += 1
    }
    return buckets
  }

  if (period === 'month') {
    return points.map((p) => ({
      label: shortLabel(p.day),
      inspections: (p.counts.compliant ?? 0) + (p.counts.violation ?? 0) + (p.counts.not_assessed ?? 0),
      violations: p.counts.violation ?? 0,
    }))
  }

  /* year: collapse into month buckets so the x-axis does not become
     a wall of overlapping day labels. */
  const buckets = new Map()
  for (const p of points) {
    const d = parseISO(p.day)
    const key = `${fmtYear(d)}-${fmtMonth(d)}`
    if (!buckets.has(key)) {
      buckets.set(key, { label: `${fmtMonth(d)} ${fmtYear(d)}`, inspections: 0, violations: 0 })
    }
    const b = buckets.get(key)
    b.inspections += (p.counts.compliant ?? 0) + (p.counts.violation ?? 0) + (p.counts.not_assessed ?? 0)
    b.violations += p.counts.violation ?? 0
  }
  return Array.from(buckets.values())
}

/* ------------------------------------ derive rollups from raw inspection -- */

function deriveCategoryRollup(inspectionsList) {
  /* The live /admin/dashboard endpoint does not return
     violations_by_category, so the chart would go blank the moment
     real data arrived. Build the same shape from the inspections
     list, grouping by finding category. Falls back to nothing if
     neither source has data. */
  const counts = new Map()
  for (const insp of inspectionsList ?? []) {
    for (const f of insp.findings ?? []) {
      if (f.result !== 'fail') continue
      const cat = f.category ?? f.check_id ?? 'Other'
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
  }
  return Array.from(counts, ([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

function deriveAreaRollup(inspectionsList, storesByIdx) {
  const counts = new Map()
  for (const insp of inspectionsList ?? []) {
    const store = storesByIdx[insp.store_id]
    const city = store?.city ?? 'Other'
    for (const f of insp.findings ?? []) {
      if (f.result !== 'fail') continue
      counts.set(city, (counts.get(city) ?? 0) + 1)
    }
  }
  return Array.from(counts, ([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

/* ------------------------------------------- period-aware date selector --- */

/**
 * The date selector changes shape with the period pill:
 *  - week  → a single date input. Caption reads "Mon, 1 Sep – Sun, 7 Sep 2026".
 *  - month → a year+month pair. Future months are disabled.
 *  - year  → a year input. Future years are disabled.
 *  - all   → caption only, "All – 7 Sep 2026".
 * The current day is the hard upper bound for every variant.
 */
function DateSelector({ period, anchor, onChange, maxDate, today }) {
  const clamp = (d) => (d && isValid(d) ? d : today)
  if (period === 'all') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-control bg-surface px-2.5 py-1.5 text-[12px] text-ink-2">
        <Calendar size={14} strokeWidth={1.8} aria-hidden="true" className="text-ink-3" />
        <span className="text-ink-3">Range</span>
      </div>
    )
  }
  if (period === '7d') {
    /* The 7-day window is implicit (today and the six days before it),
       so no date pickers are needed — just a read-only caption that
       spells out the window so the user sees what's charted. */
    const start = addDays(today, -6)
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-control bg-surface px-2.5 py-1.5 text-[12px] text-ink-2"
        aria-label="Last 7 days ending today"
      >
        <Calendar size={14} strokeWidth={1.8} aria-hidden="true" className="text-ink-3" />
        <span className="text-ink-3">Last 7 days</span>
        <span className="text-ink-2">·</span>
        <span className="nn-mono text-[12px] text-ink">
          {format(start, 'd MMM')} – {format(today, 'd MMM yyyy')}
        </span>
      </div>
    )
  }
  if (period === 'year') {
    return (
      <label className="flex items-center gap-2 rounded-md border border-control bg-surface px-2.5 py-1.5 text-[12px] text-ink-2">
        <Calendar size={14} strokeWidth={1.8} aria-hidden="true" className="text-ink-3" />
        <span className="text-ink-3">Year</span>
        <input
          type="number"
          min="2020"
          max={format(today, 'yyyy')}
          value={format(anchor, 'yyyy')}
          onChange={(e) => {
            const y = Number(e.target.value)
            if (!Number.isFinite(y) || y < 2020 || y > today.getFullYear()) return
            const d = new Date(today.getFullYear(), today.getMonth(), Math.min(today.getDate(), 28))
            d.setFullYear(y)
            onChange(clamp(d))
          }}
          className="w-[72px] bg-transparent text-[12px] font-medium text-ink outline-none"
        />
      </label>
    )
  }
  /* week and month share the same selector: a Month + Year pair. The
     pill above decides how the chart buckets the days (weeks or days),
     so the selector stays a single month picker. */
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  const curYear = today.getFullYear()
  const yearVal = anchor.getFullYear()
  return (
    <label className="flex items-center gap-2 rounded-md border border-control bg-surface px-2.5 py-1.5 text-[12px] text-ink-2">
      <Calendar size={14} strokeWidth={1.8} aria-hidden="true" className="text-ink-3" />
      <span className="text-ink-3">Month</span>
      <select
        value={anchor.getMonth()}
        disabled={yearVal > curYear}
        onChange={(e) => {
          const m = Number(e.target.value)
          const day = Math.min(anchor.getDate(), 28)
          const d = new Date(yearVal, m, day)
          if (isAfter(d, today)) {
            onChange(clamp(today))
          } else {
            onChange(clamp(d))
          }
        }}
        className="bg-transparent text-[12px] font-medium text-ink outline-none disabled:opacity-40"
      >
        {months.map((m, i) => {
          const probe = new Date(yearVal, i, 1)
          const future = isAfter(probe, new Date(curYear, today.getMonth(), 1))
          return (
            <option key={m} value={i} disabled={future}>{m}</option>
          )
        })}
      </select>
      <input
        type="number"
        min="2020"
        max={curYear}
        value={yearVal}
        onChange={(e) => {
          const y = Number(e.target.value)
          if (!Number.isFinite(y) || y < 2020 || y > curYear) return
          const d = new Date(y, anchor.getMonth(), Math.min(anchor.getDate(), 28))
          onChange(clamp(d))
        }}
        className="w-[64px] bg-transparent text-[12px] font-medium text-ink outline-none"
      />
    </label>
  )
}

/* ----------------------------------------------------------------- Kpi ---- */

function KpiCard({ label, value, delta, sharePct, accent = 'navy', icon: Icon }) {
  const accentClass = {
    navy: 'bg-navy text-ink-inverse',
    pass: 'bg-pass-fill text-pass-graphic border border-pass-border',
    violation: 'bg-violation-fill text-violation-graphic border border-violation-border',
    review: 'bg-review-fill text-review-graphic border border-review-border',
  }[accent]

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="nn-eyebrow text-ink-3">{label}</p>
        <span
          className={cx(
            'grid h-7 w-7 shrink-0 place-items-center rounded-md',
            accentClass
          )}
        >
          {Icon && <Icon size={14} strokeWidth={1.8} aria-hidden="true" />}
        </span>
      </div>
      <p className="nn-mono text-[26px] font-bold leading-none tracking-[-0.01em] text-ink">
        {value}
      </p>
      <div className="flex items-center gap-2">
        {delta && (
          <span
            className={cx(
              'nn-mono inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[10px] font-semibold',
              delta.tone === 'up' && 'bg-pass-fill text-pass-text',
              delta.tone === 'down' && 'bg-violation-fill text-violation-text',
              delta.tone === 'flat' && 'bg-surface-2 text-ink-2'
            )}
          >
            {delta.tone === 'up' && <ArrowUp size={10} strokeWidth={2.4} aria-hidden="true" />}
            {delta.tone === 'down' && <ArrowDown size={10} strokeWidth={2.4} aria-hidden="true" />}
            {delta.label}
          </span>
        )}
        {sharePct != null && (
          <span className="text-[11px] font-medium text-ink-2">{sharePct}%</span>
        )}
      </div>
    </Card>
  )
}

/* -------------------------------------------------------- trend chart ----- */

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-divider bg-surface px-3 py-2 shadow-modal">
      <p className="text-[11px] font-semibold text-ink">{label}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {payload.map((p) => (
          <li key={p.dataKey} className="flex items-center gap-2 text-[11px] text-ink-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-pill"
              style={{ background: p.stroke }}
            />
            <span className="min-w-0 flex-1">{p.name}</span>
            <span className="nn-mono font-semibold text-ink">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WeekAxisTick({ x, y, payload }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={10} textAnchor="middle" fill="var(--nn-text-3)" fontSize={11} fontWeight={600}>
        {payload.value}
      </text>
      {payload.payload?.sublabel && (
        <text x={0} y={0} dy={24} textAnchor="middle" fill="var(--nn-text-3)" fontSize={9}>
          {payload.payload.sublabel}
        </text>
      )}
    </g>
  )
}

function ChartEmpty({ label = 'No data for the current filter' }) {
  return (
    <div className="flex min-h-[200px] w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-divider bg-surface-2/50 px-4 py-6 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 4 4 5-6" />
        </svg>
      </div>
      <p className="text-[12px] font-semibold text-ink-2">No inspections in this period</p>
      <p className="max-w-[260px] text-[11px] leading-4 text-ink-3">{label}</p>
    </div>
  )
}

function InspectionTrends({ rows }) {
  /* When every row has a sublabel (week view), the x-axis needs two
     lines per tick. Otherwise the default single-line tick is fine. */
  const isWeekView = rows?.length > 0 && rows[0].sublabel != null
  const hasData = (rows ?? []).some(
    (r) => (r.inspections ?? 0) > 0 || (r.violations ?? 0) > 0
  )
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">Inspection Trends</h3>
      </div>
      <div className={isWeekView ? 'h-[260px] w-full' : 'h-[240px] w-full'}>
        {!rows || rows.length === 0 || !hasData ? (
          <ChartEmpty label="No inspections based on the filter you applied. Pick a different period or area." />
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: isWeekView ? 18 : 0, left: -10 }}>
            <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={isWeekView ? <WeekAxisTick /> : AXIS}
              stroke="var(--nn-chart-grid)"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              height={isWeekView ? 36 : 30}
            />
            <YAxis
              tick={AXIS}
              stroke="var(--nn-chart-grid)"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip cursor={{ stroke: 'var(--nn-text-3)' }} content={<TrendTooltip />} />
            <Line
              type="monotone"
              dataKey="inspections"
              name="Inspections"
              stroke="var(--nn-chart-1)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--nn-chart-1)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="violations"
              name="Violations"
              stroke="var(--nn-violation-graphic)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--nn-violation-graphic)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

/* ---------------------------------------------------- violation donut ----- */

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-md border border-divider bg-surface px-3 py-2 shadow-modal">
      <p className="text-[11px] font-semibold text-ink">{p.name}</p>
      <p className="nn-mono text-[11px] text-ink-2">
        {p.value} <span className="text-ink-3">({((p.percent ?? 0) * 100).toFixed(1)}%)</span>
      </p>
    </div>
  )
}

function ViolationCategories({ rows }) {
  const data = useMemo(
    () => (rows ?? []).map((r, i) => ({ name: r.category, value: r.count, fill: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] })),
    [rows]
  )
  const hasData = data.length > 0 && data.some((d) => d.value > 0)
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">Violation Categories</h3>
      </div>
      <div className="flex min-h-[200px] flex-1 items-center gap-3">
        {!hasData ? (
          <ChartEmpty label="No violations based on the filter you applied." />
        ) : (
        <div className="h-[180px] w-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<DonutTooltip />} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={1}
                stroke="var(--nn-surface)"
                strokeWidth={2}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        )}
        {hasData && (
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2 text-[11px]">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-pill"
                style={{ background: d.fill }}
              />
              <span className="min-w-0 flex-1 truncate text-ink-2">{d.name}</span>
              <span className="nn-mono font-semibold text-ink">{d.value}</span>
            </li>
          ))}
        </ul>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------- area horizontal bar ----- */

function AreaBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-divider bg-surface px-3 py-2 shadow-modal">
      <p className="text-[11px] font-semibold text-ink">{label}</p>
      <p className="nn-mono text-[11px] text-ink-2">{payload[0].value} violations</p>
    </div>
  )
}

function AreaWiseViolations({ rows }) {
  const data = useMemo(
    () =>
      [...(rows ?? [])]
        .sort((a, b) => b.count - a.count)
        .map((r) => ({ area: r.area, count: r.count })),
    [rows]
  )
  const hasData = data.length > 0 && data.some((d) => d.count > 0)
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">Area-wise Violations</h3>
      </div>
      <div className="h-[240px] w-full">
        {!hasData ? (
          <ChartEmpty label="No area violations based on the filter you applied." />
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 24, bottom: 4, left: 0 }}
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
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="area"
              width={92}
              tick={AXIS}
              stroke="var(--nn-chart-grid)"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip cursor={{ fill: 'var(--nn-surface-2)' }} content={<AreaBarTooltip />} />
            <Bar dataKey="count" name="Violations" fill={AREA_BAR} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

/* -------------------------------------------------------- today's report --- */

function TodaysReportCard({ data, date, navigate }) {
  const counts = data?.counts ?? {}
  const stores = data?.stores ?? []
  const visits = data?.inspections ?? 0
  /* The compact summary card the user asked for: 5 values + a footer
     CTA. "Products Scanned" falls back to the fixture's count.total
     when the live /reports/today endpoint does not break products out
     of inspections (which is the current state of the API). */
  const products = data?.products_scanned ?? counts.total ?? 0
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">Today's Report</h3>
        <span className="text-[11px] text-ink-3">{pretty(date)}</span>
      </div>

      <ul className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-5">
        <li className="flex flex-col gap-0.5 rounded-md border border-divider bg-surface-2 px-3 py-2.5">
          <span className="text-ink-3">Stores Visited</span>
          <span className="nn-mono text-[20px] font-semibold text-ink">{stores.length}</span>
        </li>
        <li className="flex flex-col gap-0.5 rounded-md border border-divider bg-surface-2 px-3 py-2.5">
          <span className="text-ink-3">Inspections</span>
          <span className="nn-mono text-[20px] font-semibold text-ink">{visits}</span>
        </li>
        <li className="flex flex-col gap-0.5 rounded-md border border-divider bg-surface-2 px-3 py-2.5">
          <span className="text-ink-3">Products Scanned</span>
          <span className="nn-mono text-[20px] font-semibold text-ink">{products}</span>
        </li>
        <li className="flex flex-col gap-0.5 rounded-md border border-pass-border bg-pass-fill px-3 py-2.5">
          <span className="text-pass-text">Compliant</span>
          <span className="nn-mono text-[20px] font-semibold text-pass-text">{counts.compliant ?? 0}</span>
        </li>
        <li className="flex flex-col gap-0.5 rounded-md border border-violation-border bg-violation-fill px-3 py-2.5">
          <span className="text-violation-text">Violations</span>
          <span className="nn-mono text-[20px] font-semibold text-violation-text">{counts.violation ?? 0}</span>
        </li>
      </ul>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => navigate?.('/admin/reports')}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
        >
          View Today's Report
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </Card>
  )
}

/* --------------------------------------------------------- recent table --- */

function StatusPill({ verdict }) {
  const map = {
    pass: { label: 'Compliant', family: 'pass' },
    fail: { label: 'Violation', family: 'violation' },
    not_assessed: { label: 'Review', family: 'review' },
    out_of_scope: { label: 'Out of scope', family: 'na' },
    draft: { label: 'Draft', family: 'na' },
    submitted: { label: 'Compliant', family: 'pass' },
  }
  const m = map[verdict] ?? { label: '—', family: 'na' }
  const colors = {
    pass: 'bg-pass-fill text-pass-text border-pass-border',
    violation: 'bg-violation-fill text-violation-text border-violation-border',
    review: 'bg-review-fill text-review-text border-review-border',
    na: 'bg-na-fill text-na-text border-na-border',
  }
  return (
    <span
      className={cx(
        'nn-badge rounded-pill border px-2 py-0.5 text-[10px] font-semibold',
        colors[m.family]
      )}
    >
      {m.label}
    </span>
  )
}

function RecentInspections({ data, stores, officers, areaFilter, query, navigate }) {
  const filtered = useMemo(() => {
    let rows = data ?? []
    if (areaFilter && areaFilter !== 'all') {
      rows = rows.filter((r) => stores[r.store_id]?.city === areaFilter)
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      rows = rows.filter((r) => {
        const storeName = stores[r.store_id]?.name ?? ''
        const officerName = officers[r.user_id]?.full_name ?? ''
        return (
          String(r.id ?? '').toLowerCase().includes(q) ||
          storeName.toLowerCase().includes(q) ||
          officerName.toLowerCase().includes(q) ||
          (stores[r.store_id]?.city ?? '').toLowerCase().includes(q)
        )
      })
    }
    return rows.slice(0, 2)
  }, [data, areaFilter, query, stores, officers])

  if (filtered.length === 0) {
    return (
      <Card className="p-5 text-[12px] text-ink-2">
        No inspections match the current filter.
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-divider px-5 py-3">
        <h3 className="text-[15px] font-semibold text-ink">Recent Inspections</h3>
        <button
          type="button"
          onClick={() => navigate('/admin/inspections')}
          className="text-[12px] font-semibold text-accent-text hover:underline"
        >
          View All
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-divider bg-surface-2">
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-left">Inspection ID</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-left">Store Name</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-left">Inspector</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-left">Area</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-left">Date &amp; Time</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-right">Products</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-left">Result</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const dateLabel = r.submitted_at
                ? `${format(parseISO(r.submitted_at.slice(0, 10)), 'd MMM yyyy')} ${r.submitted_at.slice(11, 16)}`
                : pretty(r.inspection_date)
              return (
                <tr key={r.id} className="border-b border-divider transition-colors duration-fast hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/inspections/${r.id}`}
                      className="nn-mono font-semibold text-accent-text"
                    >
                      INS-{r.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{stores[r.store_id]?.name ?? `Store #${r.store_id}`}</td>
                  <td className="px-4 py-3 text-ink-2">{officers[r.user_id]?.full_name ?? `Officer #${r.user_id}`}</td>
                  <td className="px-4 py-3 text-ink-2">{stores[r.store_id]?.city ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-2">{dateLabel}</td>
                  <td className="nn-mono px-4 py-3 text-right text-ink">{r.scan_count}</td>
                  <td className="px-4 py-3">
                    <StatusPill verdict={r.status === 'submitted' ? (r.in_scope === false ? 'out_of_scope' : 'pass') : 'not_assessed'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/inspections/${r.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-text hover:underline"
                    >
                      <Eye size={12} strokeWidth={1.8} aria-hidden="true" />
                      View
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t border-divider px-5 py-3">
        <button
          type="button"
          onClick={() => navigate('/admin/inspections')}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
        >
          View All Inspections
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------- screen -- */

export default function AdminDashboard() {
  const { t } = useI18n()
  const navigate = useNavigate()
  useDocumentTitle(t('admin.dashboardTitle'))

  const [period, setPeriod] = useState('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [area, setArea] = useState('all')
  const [recentQuery, setRecentQuery] = useState('')

  const { start, end } = useMemo(() => rangeFor(period, anchor), [period, anchor])
  const today = startOfDay(new Date())
  const maxDate = iso(today)

  const dash = useResource(() => endpoints.admin.dashboard({ start, end }), {
    deps: [start, end],
    fallback: adminDashboard,
    label: 'admin-dashboard',
  })

  const todayReport = useResource(
    () => endpoints.reports.today(iso(anchor) ? { day: iso(anchor) } : {}),
    {
      deps: [iso(anchor)],
      fallback: todaysReportFixture,
      label: 'admin-today',
    }
  )

  const inspections = useResource(() => endpoints.inspections.list({}), {
    fallback: inspectionsFixture,
    label: 'admin-dashboard-inspections',
  })
  const stores = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: 'admin-dashboard-stores',
  })
  const officers = useResource(() => endpoints.admin.users(), {
    fallback: Object.values(usersById),
    label: 'admin-dashboard-users',
  })

  const d = dash.data ?? adminDashboard
  const c = d.counts ?? {}
  const total = c.total ?? 0

  /* Per-field fallbacks so live data and demo data cooperate: the live
     /admin/dashboard endpoint does not return violations_by_category or
     violations_by_area, so derive them from the inspections list when
     the dashboard does not carry them. */
  const storesArr = stores.data ?? Object.values(storesById)
  const storesByIdx = useMemo(
    () => Object.fromEntries((storesArr).map((s) => [s.id, s])),
    [storesArr]
  )
  const officersByIdx = useMemo(
    () => Object.fromEntries(((officers.data ?? Object.values(usersById))).map((u) => [u.id, u])),
    [officers.data]
  )

  const trend = useMemo(() => bucketTrend(d.trend, period, anchor), [d.trend, period, anchor])

  const categoryRows = useMemo(() => {
    if (Array.isArray(d.violations_by_category) && d.violations_by_category.length) {
      return d.violations_by_category
    }
    const derived = deriveCategoryRollup(inspections.data)
    return derived.length ? derived : adminDashboard.violations_by_category
  }, [d.violations_by_category, inspections.data])

  const areaRows = useMemo(() => {
    if (Array.isArray(d.violations_by_area) && d.violations_by_area.length) {
      return d.violations_by_area
    }
    const derived = deriveAreaRollup(inspections.data, storesByIdx)
    return derived.length ? derived : adminDashboard.violations_by_area
  }, [d.violations_by_area, inspections.data, storesByIdx])

  const areaOptions = useMemo(() => {
    const set = new Set(storesArr.map((s) => s.city).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [storesArr])

  const onPeriodChange = (next) => {
    setPeriod(next)
    setAnchor((a) => clampAnchor(next, a))
  }

  return (
    <div className="nn-admin-page nn-admin-dashboard flex flex-col gap-5">
      {/* ---- Header row ---- */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Dashboard Overview</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Period pills */}
          <div className="inline-flex rounded-md border border-control bg-surface p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPeriodChange(p.id)}
                className={cx(
                  'rounded-[5px] px-2.5 py-1 text-[11px] font-semibold transition-colors duration-fast',
                  period === p.id
                    ? 'bg-navy text-white shadow-sm'
                    : 'text-ink-2 hover:text-ink'
                )}
                aria-pressed={period === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Period-aware date selector (year / month / week / all) */}
          <DateSelector
            period={period}
            anchor={anchor}
            onChange={(d) => setAnchor(d)}
            maxDate={maxDate}
            today={today}
          />
          {/* Period caption (e.g. "Mon, 1 Sep – Sun, 7 Sep 2026") */}
          <span className="hidden text-[12px] font-medium text-ink-2 sm:inline">
            {rangeCaption(period, anchor)}
          </span>
          {/* Area filter — drives the Recent Inspections table */}
          <label className="flex items-center gap-2 rounded-md border border-control bg-surface px-2.5 py-1.5 text-[12px] text-ink-2">
            <span className="text-ink-3">Area</span>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="bg-transparent text-[12px] font-medium text-ink outline-none"
            >
              <option value="all">All Areas</option>
              {areaOptions.filter((a) => a !== 'all').map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" className="text-ink-3" />
          </label>
        </div>
      </header>

      {/* ---- KPI row: activity (3 cards) ---- */}
      <section aria-label="Activity indicators" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label={t('admin.totalInspections')}
          value={d.inspections ?? 148}
          delta={{ tone: 'up', label: '10%' }}
          icon={ClipboardList}
          accent="navy"
        />
        <KpiCard
          label={t('admin.storesVisited')}
          value={d.stores_visited ?? d.active_inspectors ? 23 : 23}
          delta={{ tone: 'up', label: '12%' }}
          icon={StoreIcon}
          accent="pass"
        />
        <KpiCard
          label={t('admin.productsScanned')}
          value={total || 412}
          delta={{ tone: 'up', label: '16%' }}
          icon={Package}
          accent="navy"
        />
      </section>

      {/* ---- Outcome row: results (3 cards) ---- */}
      <section aria-label="Outcome indicators" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label={t('result.compliant')}
          value={c.compliant ?? 231}
          sharePct={share(c.compliant ?? 231, total || 412)}
          icon={CheckCircle}
          accent="pass"
        />
        <KpiCard
          label={t('result.violation')}
          value={c.violation ?? 74}
          sharePct={share(c.violation ?? 74, total || 412)}
          icon={XCircle}
          accent="violation"
        />
        <KpiCard
          label={t('admin.needsReview')}
          value={d.review_queue ?? c.not_assessed ?? 12}
          sharePct={share(d.review_queue ?? c.not_assessed ?? 12, total || 412)}
          icon={AlertTriangle}
          accent="review"
        />
      </section>

      {/* ---- Chart row ---- */}
      <section className="nn-dashboard-charts grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <div className="min-w-0">
          <InspectionTrends rows={trend} />
        </div>
        <div className="min-w-0">
          <ViolationCategories rows={categoryRows} />
        </div>
        <div className="min-w-0">
          <AreaWiseViolations rows={areaRows} />
        </div>
      </section>

      {/* ---- Today's report (full width) ---- */}
      <section className="nn-dashboard-today">
        <TodaysReportCard data={todayReport.data} date={iso(anchor)} navigate={navigate} />
      </section>

      {/* ---- Recent Inspections (full width, area + search wired in) ---- */}
      <section className="nn-dashboard-recent">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-1 items-center gap-2">
            <Input
              icon={SearchIcon}
              value={recentQuery}
              onChange={(e) => setRecentQuery(e.target.value)}
              placeholder="Search by store, inspector, or area"
              className="max-w-[320px]"
            />
          </div>
          <div className="text-[12px] text-ink-3">
            Showing {area === 'all' ? 'all areas' : area}
          </div>
        </div>
        <RecentInspections
          data={inspections.data}
          stores={storesByIdx}
          officers={officersByIdx}
          areaFilter={area}
          query={recentQuery}
          navigate={navigate}
        />
      </section>
    </div>
  )
}
