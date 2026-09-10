/**
 * Violations — the regulator's view of every breach the engine has ruled on.
 *
 * Layout:
 *   - Breadcrumb + title + Apply Filters & Multi-format Export (CSV, Excel, PDF, Word)
 *   - Neatly arranged, responsive filter row: Date Range, Area, Violation Type, Result, Search, Reset
 *   - Dynamic KPI cards (Total Violations, Unique Stores, Repeat Offenders, Open Cases)
 *   - Top Violations breakdown (reactive to active filters)
 *   - Violation Trend chart (reactive to active filters)
 *   - Repeat Offender Alert table (reactive to active filters)
 *   - Filtered Violations record table with rule references & reasons
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Search,
  Store as StoreIcon,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { endpoints, saveBlob } from '../api/client'
import { useI18n } from '../i18n'
import { useDocumentTitle, useResource } from '../lib/hooks'
import { VIOLATIONS_DATA } from '../mock/violationsData'
import {
  Button,
  Card,
  cx,
  DemoChip,
  Field,
  Input,
  Pill,
  Select,
  Skeleton,
  useToast,
  VerdictBadge,
} from '../ui'

/* ----------------------------------------------------------------- tokens -- */

const VIOLATION_PALETTE = [
  'var(--nn-chart-1)', // MRP – blue
  'var(--nn-chart-6)', // Net quantity – teal
  'var(--nn-chart-2)', // Consumer care – green
  'var(--nn-chart-5)', // Manufacturer – purple
  'var(--nn-chart-3)', // Date – orange
  'var(--nn-chart-4)', // Font – red
  'var(--nn-chart-7)', // Placement – grey
  'var(--nn-chart-8)', // Others – slate
]

const iso = (d) => format(d, 'yyyy-MM-dd')
const todayIso = () => iso(new Date())

function pretty(isoDate) {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'd MMM yyyy')
  } catch {
    return String(isoDate)
  }
}

function share(n, total) {
  if (!total || n == null) return null
  return Math.round((n / total) * 1000) / 10
}

/* ------------------------------------------------------------- breadcrumb -- */

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-ink-3">
      <Link
        to="/admin"
        className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
      >
        Dashboard
      </Link>
      <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
      <span className="font-semibold text-ink">Violations</span>
    </nav>
  )
}

/* ----------------------------------------------------------------- KPI ---- */

function KpiCard({ label, value, delta, icon: Icon, accent = 'violation' }) {
  const accentClass = {
    violation: 'bg-violation-fill text-violation-graphic border border-violation-border',
    review: 'bg-review-fill text-review-graphic border border-review-border',
    pass: 'bg-pass-fill text-pass-graphic border border-pass-border',
    navy: 'bg-navy text-ink-inverse',
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
      {delta && (
        <span className="nn-mono inline-flex w-fit items-center gap-0.5 rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
          {delta}
        </span>
      )}
    </Card>
  )
}

/* ----------------------------------------------------- top violations list -- */

function TopViolationsList({ items, total }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">Top Violations</h3>
        <span className="text-[11px] text-ink-3">By count</span>
      </div>

      <ul className="mt-4 flex flex-1 flex-col justify-between gap-3">
        {items.length === 0 ? (
          <li className="py-6 text-center text-[12px] text-ink-3">
            No violations found for selected filters.
          </li>
        ) : (
          items.map((row, idx) => {
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0
            const color = VIOLATION_PALETTE[idx % VIOLATION_PALETTE.length]
            return (
              <li key={row.category} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-ink">{row.category}</span>
                  <span className="nn-mono font-semibold text-ink">{row.count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
                  <div
                    className="h-full rounded-pill transition-all duration-300"
                    style={{ width: `${Math.max(4, pct)}%`, background: color }}
                    aria-hidden="true"
                  />
                </div>
              </li>
            )
          })
        )}
      </ul>
    </Card>
  )
}

/* ----------------------------------------------------- violation trend line -- */

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

function ViolationTrend({ series }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">Violation Trend</h3>
        <div className="flex items-center gap-3 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-pill"
              style={{ background: 'var(--nn-violation-graphic)' }}
            />
            Total Violations
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-pill"
              style={{ background: 'var(--nn-chart-1)' }}
            />
            Unique Stores
          </span>
        </div>
      </div>
      <div className="mt-4 h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--nn-text-3)', fontSize: 11 }}
              stroke="var(--nn-chart-grid)"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--nn-text-3)', fontSize: 11 }}
              stroke="var(--nn-chart-grid)"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip cursor={{ stroke: 'var(--nn-text-3)' }} content={<TrendTooltip />} />
            <Line
              type="monotone"
              dataKey="violations"
              name="Total Violations"
              stroke="var(--nn-violation-graphic)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--nn-violation-graphic)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="stores"
              name="Unique Stores"
              stroke="var(--nn-chart-1)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--nn-chart-1)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------- repeat offender table -- */

function RepeatOffenderTable({ rows }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-divider px-5 py-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Repeat Offender Alert</h3>
          <p className="mt-0.5 text-[11px] text-ink-3">
            Manufacturers with findings in two or more distinct retail stores.
          </p>
        </div>
        <Link
          to="/admin/repeat-offenders"
          className="text-[12px] font-semibold text-accent-text hover:underline"
        >
          View All
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-divider bg-surface-2">
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-left">
                Manufacturer / Brand
              </th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-right">
                Total Violations
              </th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-right">
                Stores Involved
              </th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-left">
                Last Violation
              </th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                  No repeat offenders match the selected filter.
                </td>
              </tr>
            ) : (
              rows.map((o, i) => {
                const isAlert = i === 0
                return (
                  <tr
                    key={o.manufacturer ?? o.name}
                    className="border-b border-divider transition-colors duration-fast last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">
                          {o.manufacturer ?? o.name}
                        </span>
                        {isAlert && (
                          <Pill family="review" icon={AlertTriangle}>
                            Alert
                          </Pill>
                        )}
                      </div>
                      {o.brand && (
                        <p className="mt-0.5 text-[11px] text-ink-3">{o.brand}</p>
                      )}
                    </td>
                    <td className="nn-mono px-4 py-3 text-right font-semibold text-violation-text">
                      {o.violations ?? 0}
                    </td>
                    <td className="nn-mono px-4 py-3 text-right text-ink">
                      {o.stores ?? 0}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{pretty(o.last_violation)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/repeat-offenders?q=${encodeURIComponent(o.manufacturer ?? o.name ?? '')}`}
                        className="inline-grid h-7 w-7 place-items-center rounded-sm text-accent-text transition-colors duration-fast hover:bg-accent-soft"
                        aria-label={`View ${o.manufacturer ?? o.name}`}
                        title="View"
                      >
                        <Eye size={14} strokeWidth={2} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------- violations detail table -- */

function ViolationsRecordsTable({ rows }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-divider px-5 py-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Recorded Violations &amp; Findings</h3>
          <p className="mt-0.5 text-[11px] text-ink-3">
            Showing {rows.length} record{rows.length === 1 ? '' : 's'} matching active filters.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-divider bg-surface-2 text-left">
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Date</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Store &amp; Area</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Product &amp; Brand</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Category</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Violated Rule</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Finding Details</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-3">
                  No records match the selected date, area, or violation type.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-divider transition-colors duration-fast last:border-b-0 hover:bg-surface-2"
                >
                  <td className="nn-mono whitespace-nowrap px-4 py-3 text-ink-2">
                    {pretty(r.date)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{r.store_name}</p>
                    <p className="text-[11px] text-ink-3">{r.area}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{r.product_name}</p>
                    <p className="text-[11px] text-ink-3">{r.manufacturer}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-2">{r.category}</td>
                  <td className="px-4 py-3 font-mono text-[11px] font-semibold text-violation-text">
                    {r.rule}
                  </td>
                  <td className="px-4 py-3 text-ink-2 max-w-[280px]">
                    <span className="line-clamp-2">{r.reason}</span>
                  </td>
                  <td className="px-4 py-3">
                    <VerdictBadge verdict={r.result} size="sm" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------- export -- */

function csvCell(v) {
  const s = v == null ? '' : String(v)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

function toCsv(header, rows) {
  return '\ufeff' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

/* -------------------------------------------------------------- screen -- */

export default function AdminViolations() {
  const { t } = useI18n()
  useDocumentTitle(t('violations.title'))
  const toast = useToast()

  const today = todayIso()
  // Dynamic date defaults: last 30 days
  const [from, setFrom] = useState(() => iso(subDays(new Date(), 29)))
  const [to, setTo] = useState(() => todayIso())
  const [area, setArea] = useState('all')
  const [violationType, setViolationType] = useState('all')
  const [result, setResult] = useState('all')
  const [exportFormat, setExportFormat] = useState('csv')
  const [exporting, setExporting] = useState(false)

  /* ---- Fetch live violations from backend ---- */
  const violRes = useResource(
    () => endpoints.admin.violations({ start: from, end: to }),
    {
      fallback: { total: VIOLATIONS_DATA.length, violations: VIOLATIONS_DATA, top_violations: [] },
      deps: [from, to],
      label: 'admin-violations',
    }
  )

  const isDemo = violRes.demo
  const isLoading = violRes.loading

  /* Unwrap: live API returns { total, violations: [...], top_violations: [...] }
     Demo fallback is the raw VIOLATIONS_DATA array */
  const allViolations = useMemo(() => {
    const d = violRes.data
    if (!d) return []
    if (Array.isArray(d)) return d
    if (Array.isArray(d.violations)) return d.violations
    return []
  }, [violRes.data])

  /* Active multi-criteria filtering (client-side on top of server-filtered data) */
  const filteredViolations = useMemo(() => {
    return allViolations.filter((v) => {
      // Area filter
      if (area !== 'all' && v.area?.toLowerCase() !== area.toLowerCase()) {
        return false
      }

      // Violation Type filter
      if (violationType !== 'all') {
        const catMatch = v.category?.toLowerCase() === violationType.toLowerCase()
        const ruleMatch = v.rule?.toLowerCase().includes(violationType.toLowerCase())
        if (!catMatch && !ruleMatch) return false
      }

      // Result filter
      if (result !== 'all') {
        if (result === 'violation' && v.result !== 'violation') return false
        if (result === 'review' && v.result !== 'review') return false
        if (result === 'compliant' && v.result !== 'compliant') return false
      }

      return true
    })
  }, [allViolations, area, violationType, result])

  /* Dynamic KPIs based on filtered records */
  const totalViolations = useMemo(() => {
    return filteredViolations.filter((r) => r.result === 'violation').length
  }, [filteredViolations])

  const uniqueStores = useMemo(() => {
    const set = new Set()
    for (const r of filteredViolations) set.add(r.store_id)
    return set.size
  }, [filteredViolations])

  /* Grouped category breakdown */
  const topViolations = useMemo(() => {
    const counts = {}
    for (const r of filteredViolations) {
      if (r.result === 'violation') {
        counts[r.category] = (counts[r.category] || 0) + 1
      }
    }
    const list = Object.entries(counts).map(([category, count]) => ({
      category,
      count,
    }))
    list.sort((a, b) => b.count - a.count)
    return list
  }, [filteredViolations])

  /* Trend data over filtered period */
  const trendSeries = useMemo(() => {
    const dayMap = new Map()
    for (const r of filteredViolations) {
      const d = r.date
      if (!dayMap.has(d)) {
        dayMap.set(d, { violations: 0, stores: new Set() })
      }
      const entry = dayMap.get(d)
      if (r.result === 'violation') entry.violations++
      entry.stores.add(r.store_id)
    }

    const sortedDays = Array.from(dayMap.keys()).sort()
    return sortedDays.map((d) => {
      const entry = dayMap.get(d)
      let label = d
      try {
        label = format(parseISO(d), 'd MMM')
      } catch {
        label = d
      }
      return {
        label,
        violations: entry.violations,
        stores: entry.stores.size,
      }
    })
  }, [filteredViolations])

  /* Repeat offenders from filtered records */
  const offenderRows = useMemo(() => {
    const map = new Map()
    for (const r of filteredViolations) {
      if (r.result === 'violation' && r.manufacturer) {
        if (!map.has(r.manufacturer)) {
          map.set(r.manufacturer, {
            manufacturer: r.manufacturer,
            brand: r.brand_name,
            violations: 0,
            stores: new Set(),
            last_violation: r.date,
          })
        }
        const item = map.get(r.manufacturer)
        item.violations++
        item.stores.add(r.store_id)
        if (r.date > item.last_violation) item.last_violation = r.date
      }
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        stores: item.stores.size,
      }))
      .sort((a, b) => b.violations - a.violations)
  }, [filteredViolations])

  const openCases = useMemo(() => {
    return filteredViolations.filter((r) => r.result === 'review').length
  }, [filteredViolations])

  /* Filter actions */
  function handleSearch() {
    toast.push({
      family: 'pass',
      title: 'Filters applied',
      body: `Showing ${filteredViolations.length} records matching criteria.`,
    })
  }

  function handleReset() {
    setFrom('2026-08-10')
    setTo('2026-09-08')
    setArea('all')
    setViolationType('all')
    setResult('all')
    toast.push({
      family: 'pass',
      title: 'Filters reset',
      body: 'All filters returned to default view.',
    })
  }

  /* Multi-format export handler */
  async function handleExport() {
    setExporting(true)
    try {
      const filename = `niyamnetra-violations-${from}-to-${to}`

      if (exportFormat === 'csv') {
        const header = [
          'Date',
          'Store',
          'Area',
          'Product',
          'Brand',
          'Category',
          'Manufacturer',
          'Violated Rule',
          'Finding Details',
          'Result',
          'Inspector',
        ]
        const rows = filteredViolations.map((r) => [
          r.date,
          r.store_name,
          r.area,
          r.product_name,
          r.brand_name,
          r.category,
          r.manufacturer,
          r.rule,
          r.reason,
          r.result,
          r.inspector,
        ])
        const csvContent = toCsv(header, rows)
        saveBlob(
          new Blob([csvContent], { type: 'text/csv;charset=utf-8' }),
          `${filename}.csv`
        )
        toast.push({
          family: 'pass',
          title: 'CSV exported',
          body: `Exported ${filteredViolations.length} violation records.`,
        })
      } else if (exportFormat === 'excel') {
        // XML Spreadsheet 2003 format (opens natively in Excel without extra dependencies)
        const header = [
          'Date',
          'Store',
          'Area',
          'Product',
          'Brand',
          'Category',
          'Manufacturer',
          'Violated Rule',
          'Finding Details',
          'Result',
          'Inspector',
        ]
        const rowsXml = filteredViolations
          .map(
            (r) => `<Row>
            <Cell><Data ss:Type="String">${r.date}</Data></Cell>
            <Cell><Data ss:Type="String">${r.store_name}</Data></Cell>
            <Cell><Data ss:Type="String">${r.area}</Data></Cell>
            <Cell><Data ss:Type="String">${r.product_name}</Data></Cell>
            <Cell><Data ss:Type="String">${r.brand_name}</Data></Cell>
            <Cell><Data ss:Type="String">${r.category}</Data></Cell>
            <Cell><Data ss:Type="String">${r.manufacturer}</Data></Cell>
            <Cell><Data ss:Type="String">${r.rule}</Data></Cell>
            <Cell><Data ss:Type="String">${r.reason.replace(/&/g, '&amp;')}</Data></Cell>
            <Cell><Data ss:Type="String">${r.result}</Data></Cell>
            <Cell><Data ss:Type="String">${r.inspector}</Data></Cell>
          </Row>`
          )
          .join('')

        const xml = `<?xml version="1.0"?>
        <?mso-application progid="Excel.Sheet"?>
        <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
          <Worksheet ss:Name="Violations Report">
            <Table>
              <Row>
                ${header.map((h) => `<Cell><Data ss:Type="String">${h}</Data></Cell>`).join('')}
              </Row>
              ${rowsXml}
            </Table>
          </Worksheet>
        </Workbook>`

        saveBlob(
          new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }),
          `${filename}.xls`
        )
        toast.push({
          family: 'pass',
          title: 'Excel file exported',
          body: `Exported ${filteredViolations.length} records to Excel.`,
        })
      } else if (exportFormat === 'word') {
        const docHtml = `
          <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
          <head><title>NiyamNetra Violations Report</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 10pt; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #0b1f3a; color: white; padding: 8px; border: 1px solid #ddd; font-size: 9pt; }
            td { padding: 6px; border: 1px solid #ddd; font-size: 9pt; }
            h1 { color: #0b1f3a; font-size: 16pt; }
          </style>
          </head>
          <body>
            <h1>NiyamNetra — Legal Metrology Violations Report</h1>
            <p><strong>Date Range:</strong> ${from} to ${to} &middot; <strong>Area:</strong> ${area} &middot; <strong>Total Records:</strong> ${filteredViolations.length}</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Store</th>
                  <th>Area</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Rule</th>
                  <th>Finding Details</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                ${filteredViolations
                  .map(
                    (r) => `<tr>
                  <td>${r.date}</td>
                  <td>${r.store_name}</td>
                  <td>${r.area}</td>
                  <td>${r.product_name}</td>
                  <td>${r.category}</td>
                  <td>${r.rule}</td>
                  <td>${r.reason}</td>
                  <td>${r.result}</td>
                </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </body>
          </html>
        `
        saveBlob(
          new Blob([docHtml], { type: 'application/msword;charset=utf-8' }),
          `${filename}.doc`
        )
        toast.push({
          family: 'pass',
          title: 'Word document exported',
          body: `Exported ${filteredViolations.length} records to Word.`,
        })
      } else if (exportFormat === 'pdf') {
        const printWin = window.open('', '_blank')
        if (printWin) {
          printWin.document.write(`<!DOCTYPE html>
          <html>
          <head>
            <title>NiyamNetra — Violations Report (${from} to ${to})</title>
            <style>
              body { font-family: system-ui, sans-serif; padding: 20px; font-size: 12px; color: #111; }
              h1 { color: #0b1f3a; font-size: 20px; margin-bottom: 4px; }
              table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 11px; }
              th { background: #0b1f3a; color: #fff; padding: 8px; text-align: left; }
              td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
              tr:nth-child(even) { background: #f8fafc; }
              .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; }
              .badge-violation { background: #fee2e2; color: #991b1b; }
              .badge-pass { background: #dcfce7; color: #166534; }
              .badge-review { background: #fef3c7; color: #92400e; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>
            <h1>NiyamNetra — Legal Metrology Violations Report</h1>
            <p><strong>Period:</strong> ${from} to ${to} &middot; <strong>Area:</strong> ${area} &middot; <strong>Total Records:</strong> ${filteredViolations.length}</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Store</th>
                  <th>Area</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Rule</th>
                  <th>Finding</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                ${filteredViolations
                  .map(
                    (r) => `<tr>
                  <td>${r.date}</td>
                  <td>${r.store_name}</td>
                  <td>${r.area}</td>
                  <td>${r.product_name}</td>
                  <td>${r.category}</td>
                  <td><strong>${r.rule}</strong></td>
                  <td>${r.reason}</td>
                  <td><span class="badge badge-${r.result}">${r.result.toUpperCase()}</span></td>
                </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
            <script>
              window.onload = function() { window.print(); };
            </script>
          </body>
          </html>`)
          printWin.document.close()
        }
        toast.push({
          family: 'pass',
          title: 'PDF Print dialog opened',
          body: `Prepared PDF printable view for ${filteredViolations.length} records.`,
        })
      }
    } catch (err) {
      toast.push({
        family: 'violation',
        title: 'Export failed',
        body: err?.message ?? 'Could not complete export.',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="nn-admin-page nn-admin-list-page nn-violations-page flex flex-col gap-5">
      {/* ---- Page header + Actions ---- */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Breadcrumb />
            <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Violations</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={Filter}
              onClick={handleSearch}
            >
              Apply Filters
            </Button>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                icon={Download}
                loading={exporting}
                onClick={handleExport}
                className="min-w-[120px] justify-center font-semibold"
              >
                Export
              </Button>
              <div className="w-28 sm:w-32">
                <Select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  aria-label="Select export format"
                  className="cursor-pointer text-small font-medium"
                >
                  <option value="csv">CSV</option>
                  <option value="excel">Excel</option>
                  <option value="pdf">PDF</option>
                  <option value="word">Word</option>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Neatly arranged Side-by-Side Filter Bar ---- */}
        <Card className="p-4">
          <div className="grid grid-cols-1 items-end gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-12">
            {/* Date Range: 4 cols */}
            <div className="xl:col-span-4">
              <Field label="Date range">
                {(props) => (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-[120px]">
                      <Input
                        {...props}
                        type="date"
                        value={from}
                        max={to || today}
                        onChange={(e) => setFrom(e.target.value)}
                        aria-label="From date"
                        className="w-full text-[12px]"
                      />
                    </div>
                    <span className="shrink-0 text-ink-3 font-semibold">–</span>
                    <div className="flex-1 min-w-[120px]">
                      <Input
                        type="date"
                        value={to}
                        min={from || undefined}
                        max={today}
                        onChange={(e) => setTo(e.target.value)}
                        aria-label="To date"
                        className="w-full text-[12px]"
                      />
                    </div>
                  </div>
                )}
              </Field>
            </div>

            {/* Area: 2 cols, neatly placed side by side */}
            <div className="xl:col-span-2">
              <Field label="Area">
                {(props) => (
                  <Select
                    {...props}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full text-[12px]"
                  >
                    <option value="all">All Areas</option>
                    <option value="kakinada">Kakinada</option>
                    <option value="rajahmundry">Rajahmundry</option>
                    <option value="anakapalli">Anakapalli</option>
                    <option value="visakhapatnam">Visakhapatnam</option>
                    <option value="vijayawada">Vijayawada</option>
                    <option value="guntur">Guntur</option>
                  </Select>
                )}
              </Field>
            </div>

            {/* Violation Type: 2 cols */}
            <div className="xl:col-span-2">
              <Field label="Violation Type">
                {(props) => (
                  <Select
                    {...props}
                    value={violationType}
                    onChange={(e) => setViolationType(e.target.value)}
                    className="w-full text-[12px]"
                  >
                    <option value="all">All Violation Types</option>
                    <option value="MRP Declaration">MRP Declaration</option>
                    <option value="Net Quantity">Net Quantity</option>
                    <option value="Consumer Care">Consumer Care</option>
                    <option value="Manufacturer Details">Manufacturer Details</option>
                    <option value="Date Declaration">Date Declaration</option>
                    <option value="Font &amp; Readability">Font &amp; Readability</option>
                    <option value="Placement &amp; Manner">Placement &amp; Manner</option>
                    <option value="Others">Others</option>
                  </Select>
                )}
              </Field>
            </div>

            {/* Result: 2 cols */}
            <div className="xl:col-span-2">
              <Field label="Result">
                {(props) => (
                  <Select
                    {...props}
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                    className="w-full text-[12px]"
                  >
                    <option value="all">All Results</option>
                    <option value="violation">Violation</option>
                    <option value="review">Needs Review</option>
                    <option value="compliant">Compliant</option>
                  </Select>
                )}
              </Field>
            </div>

            {/* Actions: 2 cols */}
            <div className="xl:col-span-2">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  icon={Search}
                  variant="primary"
                  onClick={handleSearch}
                  className="flex-1 justify-center font-semibold"
                >
                  Search
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleReset}
                  className="flex-1 justify-center"
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </header>

      {/* ---- Dynamic KPI row ---- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Violations"
          value={totalViolations}
          delta={totalViolations > 0 ? `+${totalViolations}` : '0'}
          icon={AlertTriangle}
          accent="violation"
        />
        <KpiCard
          label="Unique Stores"
          value={uniqueStores}
          delta={uniqueStores > 0 ? `${uniqueStores} active` : '0'}
          icon={StoreIcon}
          accent="navy"
        />
        <KpiCard
          label="Repeat Offenders"
          value={offenderRows.length}
          delta={offenderRows.length > 0 ? `${offenderRows.length} flagged` : '0'}
          icon={Users}
          accent="review"
        />
        <KpiCard
          label="Open Cases"
          value={openCases}
          delta={openCases > 0 ? `${openCases} pending` : '0'}
          icon={ClipboardList}
          accent="navy"
        />
      </section>

      {/* ---- Analytics: Top Violations & Trend ---- */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopViolationsList items={topViolations} total={totalViolations} />
        <ViolationTrend series={trendSeries} />
      </section>

      {/* ---- Repeat Offender Alert table ---- */}
      <RepeatOffenderTable rows={offenderRows} />

      {/* ---- Recorded Violations Details Table ---- */}
      <ViolationsRecordsTable rows={filteredViolations} />
    </div>
  )
}
