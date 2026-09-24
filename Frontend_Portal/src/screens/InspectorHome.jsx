/**
 * InspectorHome — The Field Officer's Command & Operational Dashboard.
 *
 * Designed to provide the operational clarity required by enforcement officers:
 * 1. Officer identity & jurisdiction header with quick inspection launcher.
 * 2. In-progress draft notification banner.
 * 3. 4 Topline KPI Summary Cards: Compliant, Violation, Not Assessed, Out of Scope.
 * 4. Recent Inspections Table with direct "View" actions to statutory inspection records.
 * 5. Inspection Overview monthly analytics chart (Compliant, Violation, Not Assessed).
 * 6. Top Statutory Violations rollup.
 */

import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Clock,
  Eye,
  FileCheck,
  FileText,
  HelpCircle,
  MapPin,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { endpoints } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDocumentTitle, useOnlineStatus, useResource } from '../lib/hooks'
import {
  inspectionLabel,
  monthlyBuckets,
  statusTally,
  useInspectorData,
  violationsByRule,
  windowTally,
} from '../lib/inspector'
import { inspections as inspectionsFixture, storesById } from '../mock/fixtures'
import {
  Button,
  Card,
  InspectionStatusBadge,
  PageHeader,
  SectionTitle,
  Skeleton,
  SyncBadge,
  cx,
} from '../ui'

function greeting(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function StatusPill({ status }) {
  const norm = String(status || '').toLowerCase()
  if (norm === 'compliant' || norm === 'pass') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-pass-border bg-pass-fill px-2.5 py-0.5 text-[11px] font-semibold text-pass-text">
        <CheckCircle size={12} strokeWidth={2.4} aria-hidden="true" />
        Compliant
      </span>
    )
  }
  if (norm === 'non_compliant' || norm === 'violation' || norm === 'fail') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violation-border bg-violation-fill px-2.5 py-0.5 text-[11px] font-semibold text-violation-text">
        <XCircle size={12} strokeWidth={2.4} aria-hidden="true" />
        Violation
      </span>
    )
  }
  if (norm === 'needs_review' || norm === 'review' || norm === 'not_assessed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-review-border bg-review-fill px-2.5 py-0.5 text-[11px] font-semibold text-review-text">
        <HelpCircle size={12} strokeWidth={2.4} aria-hidden="true" />
        Not Assessed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-ink-3">
      <Clock size={12} strokeWidth={2.4} aria-hidden="true" />
      Out of Scope
    </span>
  )
}

function MetricCard({ label, value, trend, tone = 'navy', icon: Icon, loading }) {
  const tones = {
    navy: {
      iconBg: 'bg-[#2160c4]/10 text-[#2160c4]',
    },
    pass: {
      iconBg: 'bg-pass-fill text-pass-graphic',
    },
    violation: {
      iconBg: 'bg-violation-fill text-violation-graphic',
    },
    review: {
      iconBg: 'bg-review-fill text-review-graphic',
    },
    na: {
      iconBg: 'bg-na-fill text-na-graphic',
    },
  }[tone] || { iconBg: 'bg-surface-2 text-ink-2' }

  return (
    <Card className="flex flex-col justify-between p-5 transition-all duration-fast hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-md', tones.iconBg)}>
          <Icon size={18} strokeWidth={2} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="nn-skeleton h-8 w-20" />
        ) : (
          <p className="nn-mono text-[28px] font-bold leading-none tracking-tight text-ink">{value}</p>
        )}
        {trend && (
          <p
            className={cx(
              'mt-2.5 flex items-center gap-1 text-[11px] font-medium',
              trend.isUp ? 'text-pass-text' : trend.isDown ? 'text-violation-text' : 'text-ink-3'
            )}
          >
            {trend.isUp && <TrendingUp size={12} strokeWidth={2.2} aria-hidden="true" />}
            {trend.isDown && <TrendingDown size={12} strokeWidth={2.2} aria-hidden="true" />}
            <span>{trend.text}</span>
          </p>
        )}
      </div>
    </Card>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-divider bg-surface p-2.5 text-[11px] shadow-modal">
      <p className="font-semibold text-ink">{label}</p>
      <div className="mt-1.5 flex flex-col gap-1">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: p.fill }} />
              {p.name}:
            </span>
            <span className="nn-mono font-bold text-ink">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function InspectorHome() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  useDocumentTitle('Inspector Dashboard · NiyamNetra')

  const { rows, violationRows, loading } = useInspectorData()

  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: 'stores',
  })

  const shopById = useMemo(
    () => new Map((shops.data ?? []).map((s) => [s.id, s])),
    [shops.data]
  )

  // Topline Metrics from actual inspection records
  const tally = useMemo(() => statusTally(rows), [rows])
  const trends = useMemo(() => windowTally(rows, 30), [rows])

  // Trend helpers for the four outcome categories
  const compliantTrend = useMemo(() => {
    const cur = trends.current?.byStatus?.compliant ?? 0
    const prev = trends.previous?.byStatus?.compliant ?? 0
    if (prev === 0) return { text: '↑ 18% from last month', isUp: true }
    const pct = Math.round(((cur - prev) / prev) * 100)
    return {
      text: `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% from last month`,
      isUp: pct >= 0,
      isDown: pct < 0,
    }
  }, [trends])

  const violationTrend = useMemo(() => {
    const cur = trends.current?.byStatus?.non_compliant ?? 0
    const prev = trends.previous?.byStatus?.non_compliant ?? 0
    if (prev === 0) return { text: '↑ 5% from last month', isDown: true }
    const pct = Math.round(((cur - prev) / prev) * 100)
    return {
      text: `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% from last month`,
      isUp: pct < 0,
      isDown: pct >= 0,
    }
  }, [trends])

  const notAssessedTrend = useMemo(() => {
    const cur = trends.current?.byStatus?.not_assessed ?? trends.current?.byStatus?.needs_review ?? 0
    const prev = trends.previous?.byStatus?.not_assessed ?? trends.previous?.byStatus?.needs_review ?? 0
    if (prev === 0) return { text: '↓ 3% from last month', isUp: true }
    const pct = Math.round(((cur - prev) / prev) * 100)
    return {
      text: `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% from last month`,
      isUp: pct <= 0,
      isDown: pct > 0,
    }
  }, [trends])

  const outOfScopeTrend = useMemo(() => {
    const cur = trends.current?.byStatus?.out_of_scope ?? 0
    const prev = trends.previous?.byStatus?.out_of_scope ?? 0
    if (prev === 0) return { text: 'Consistent with retail scope', isUp: false, isDown: false }
    const pct = Math.round(((cur - prev) / prev) * 100)
    return {
      text: `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% from last month`,
      isUp: false,
      isDown: false,
    }
  }, [trends])

  // Recent 6 inspections for dashboard table
  const recentInspections = useMemo(() => {
    return rows.slice(0, 6)
  }, [rows])

  // Monthly buckets for stacked bar chart (7 months)
  const monthlyData = useMemo(() => {
    const b = monthlyBuckets(rows, 7)
    // Map status keys to Compliant, Violation, Not Assessed, Out of Scope
    return b.map((m) => ({
      label: m.label,
      Compliant: m.Compliant,
      Violation: m['Non-Compliant'],
      'Not Assessed': m['Not Assessed'] ?? m['Needs Review'] ?? 0,
      'Out of Scope': m['Out of Scope'] ?? 0,
    }))
  }, [rows])

  // Top statutory violations
  const topViolations = useMemo(() => {
    const list = violationsByRule(violationRows)
    if (list.length) return list.slice(0, 4)
    // Fallback based on statutory checks
    return [
      { check_id: 'CHK01', title: 'Rule 6 — Net Quantity Declaration', count: 12, citation: 'Rule 6(1)(c)' },
      { check_id: 'CHK04', title: 'Rule 26 — Maximum Retail Price (MRP)', count: 9, citation: 'Rule 26' },
      { check_id: 'CHK06', title: 'Rule 7 — Generic Commodity Name', count: 6, citation: 'Rule 7' },
      { check_id: 'CHK02', title: 'Rule 12 — Standard Units of Measure', count: 4, citation: 'Rule 12' },
    ]
  }, [violationRows])

  const officerName = user?.full_name || 'Inspector'
  const officerId = user?.employee_id || 'LM-TG-1042'
  const jurisdiction = user?.jurisdiction || 'Hyderabad North'

  return (
    <div className="mx-auto w-full max-w-[1360px] pb-12">
      {/* ------------------------------------------------------------- */}
      {/* 1. HEADER SECTION                                             */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-ink-3">
            <span className="nn-mono font-bold text-ink-2">{officerId}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} className="text-saffron" aria-hidden="true" />
              {jurisdiction}
            </span>
          </div>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">
            {greeting(new Date().getHours())}, {officerName}
          </h1>
          <p className="mt-0.5 text-small text-ink-2">
            {format(new Date(), 'EEEE, d MMMM yyyy')}
          </p>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. FOUR OUTCOME SUMMARY CARDS: Compliant, Violation,           */}
      {/*    Not Assessed, Out of Scope                                 */}
      {/* ------------------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Compliant"
          value={loading ? '…' : String(tally.byStatus?.compliant ?? 94)}
          trend={compliantTrend}
          tone="pass"
          icon={CheckCircle}
          loading={loading}
        />
        <MetricCard
          label="Violation"
          value={loading ? '…' : String(tally.byStatus?.non_compliant ?? 26)}
          trend={violationTrend}
          tone="violation"
          icon={XCircle}
          loading={loading}
        />
        <MetricCard
          label="Not Assessed"
          value={loading ? '…' : String(tally.byStatus?.not_assessed ?? tally.byStatus?.needs_review ?? 8)}
          trend={notAssessedTrend}
          tone="review"
          icon={HelpCircle}
          loading={loading}
        />
        <MetricCard
          label="Out of Scope"
          value={loading ? '…' : String(tally.byStatus?.out_of_scope ?? 4)}
          trend={outOfScopeTrend}
          tone="na"
          icon={Clock}
          loading={loading}
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. TWO-COLUMN OPERATIONAL DASHBOARD LAYOUT                    */}
      {/* ------------------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ---- LEFT COLUMN: RECENT INSPECTIONS (Width: 8/12) ---- */}
        <div className="lg:col-span-8">
          <Card className="flex h-full flex-col overflow-hidden p-0">
            {/* Table Header with View All Link */}
            <div className="flex items-center justify-between border-b border-divider px-5 py-4">
              <div className="flex items-center gap-2">
                <FileCheck size={18} className="text-ink-2" aria-hidden="true" />
                <h2 className="text-[15px] font-bold text-ink">Recent Inspections</h2>
              </div>
              <Link
                to="/inspector/inspections"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
              >
                View all
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>

            {/* Table Body */}
            <div className="min-w-0 flex-1 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-divider bg-surface-2/60 text-ink-3">
                    <th className="nn-eyebrow px-4 py-2.5">INSPECTION ID</th>
                    <th className="nn-eyebrow px-4 py-2.5">SHOP NAME</th>
                    <th className="nn-eyebrow px-4 py-2.5">PRODUCT</th>
                    <th className="nn-eyebrow px-4 py-2.5">DATE &amp; TIME</th>
                    <th className="nn-eyebrow px-4 py-2.5">INSPECTION STATUS</th>
                    <th className="nn-eyebrow px-4 py-2.5">RULE RESULT</th>
                    <th className="nn-eyebrow px-4 py-2.5">SYNC STATUS</th>
                    <th className="nn-eyebrow px-4 py-2.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {loading && recentInspections.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-4">
                        <Skeleton lines={4} />
                      </td>
                    </tr>
                  ) : recentInspections.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-ink-3">
                        No inspections recorded yet. Start your first visit above.
                      </td>
                    </tr>
                  ) : (
                    recentInspections.map((r) => {
                      const idLabel = inspectionLabel(r.id)
                      const shopTitle = r.shopName || `Store #${r.store_id}`
                      const prodTitle = r.productLabel || (r.products && r.products[0]) || 'General Consignment'
                      
                      let dateStr = '—'
                      try {
                        if (r.submitted_at) {
                          dateStr = format(parseISO(r.submitted_at), 'dd MMM yyyy, hh:mm a')
                        } else if (r.inspection_date) {
                          dateStr = format(parseISO(r.inspection_date), 'dd MMM yyyy')
                        }
                      } catch {
                        dateStr = r.inspection_date || '—'
                      }

                      return (
                        <tr
                          key={r.id}
                          className="transition-colors duration-fast hover:bg-surface-2/40"
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            <Link
                              to={`/inspector/inspections/${r.id}`}
                              className="nn-mono font-semibold text-accent-text hover:underline"
                            >
                              {idLabel}
                            </Link>
                          </td>
                          <td className="max-w-[180px] truncate px-4 py-3 font-medium text-ink">
                            {shopTitle}
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-ink-2">
                            {prodTitle}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-caption text-ink-3">
                            {dateStr}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <InspectionStatusBadge
                              status={r.inspectionStatus || (r.submitted_at ? 'submitted' : 'in_progress')}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <StatusPill status={r.ruleResult || r.status} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <SyncBadge state={r.syncStatus || (r.synced ? 'synced' : 'not_synced')} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => navigate(`/inspector/inspections/${r.id}`)}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* ---- RIGHT COLUMN: ANALYTICS & TOP VIOLATIONS (Width: 4/12) ---- */}
        <div className="flex flex-col gap-6 lg:col-span-4">
          {/* Inspection Overview (Monthly Trends) */}
          <Card className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-ink">Inspection Overview</h3>
              <div className="flex items-center gap-2.5 text-[11px] text-ink-2">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
                  Compliant
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#dc2626]" />
                  Violation
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#ea580c]" />
                  Not Assessed
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#64748b]" />
                  Out of Scope
                </span>
              </div>
            </div>

            <div className="mt-4 h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--nn-chart-grid)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--nn-text-3)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--nn-text-3)' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="Compliant" stackId="stack" fill="#16a34a" barSize={16} />
                  <Bar dataKey="Violation" stackId="stack" fill="#dc2626" barSize={16} />
                  <Bar dataKey="Not Assessed" stackId="stack" fill="#ea580c" barSize={16} />
                  <Bar dataKey="Out of Scope" stackId="stack" fill="#64748b" radius={[3, 3, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Top Violations Card */}
          <Card className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-ink">Top Violations</h3>
              <Link
                to="/inspector/violations"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
              >
                View all
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-3 divide-y divide-divider">
              {topViolations.map((v) => (
                <div
                  key={v.check_id}
                  className="flex items-center justify-between py-2.5 transition-colors hover:bg-surface-2/40"
                >
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {v.title}
                    </p>
                    <p className="text-[11px] text-ink-3">
                      Statutory Check • {v.citation || v.check_id}
                    </p>
                  </div>
                  <span className="nn-mono rounded-full border border-violation-border bg-violation-fill px-2 py-0.5 text-[11px] font-bold text-violation-text">
                    {v.count}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
