import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  Clock,
  FileText,
  HelpCircle,
  MapPin,
  PenLine,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import {
  inspectionLabel,
  monthlyBuckets,
  REFERENCE_OVERVIEW,
  REFERENCE_STATS,
  REFERENCE_TOP_VIOLATIONS,
  STATUS_META,
  statusTally,
  useInspectorData,
  violationsByRule,
  windowTally,
} from '../lib/inspector'
import { useDocumentTitle } from '../lib/hooks'
import {
  Button,
  Card,
  DemoChip,
  Pill,
  SectionTitle,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
  cx,
} from '../ui'

const AXIS = { fontSize: 11, fill: 'var(--nn-text-3)' }

const STATUS_ICONS = {
  compliant: CheckCircle,
  non_compliant: AlertTriangle,
  needs_review: Clock,
  out_of_scope: HelpCircle,
  draft: PenLine,
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft
  const Icon = STATUS_ICONS[status] ?? HelpCircle
  return (
    <Pill family={meta.family} icon={Icon}>
      {meta.label}
    </Pill>
  )
}

function greeting(hour) {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function prettyDateTime(row) {
  const date = row.inspection_date
  if (!date) return '—'
  let time = null
  try {
    time = row.submitted_at ? format(parseISO(row.submitted_at), 'hh:mm a') : null
  } catch {
    time = null
  }
  try {
    return `${format(parseISO(date), 'dd MMM yyyy')}${time ? `, ${time}` : ''}`
  } catch {
    return String(date)
  }
}

function StatTile({ icon: Icon, label, value, family, trend, loading }) {
  const tileStyles = {
    total: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-900',
      iconBg: 'bg-blue-500',
      iconText: 'text-white',
    },
    compliant: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      border: 'border-emerald-200 dark:border-emerald-900',
      iconBg: 'bg-emerald-600',
      iconText: 'text-white',
    },
    nonCompliant: {
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      border: 'border-rose-200 dark:border-rose-900',
      iconBg: 'bg-rose-500',
      iconText: 'text-white',
    },
    needsReview: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-900',
      iconBg: 'bg-amber-500',
      iconText: 'text-white',
    },
  }

  const s = tileStyles[family] ?? tileStyles.total

  return (
    <Card className="flex flex-col justify-between p-5 transition-shadow hover:shadow-card">
      <div className="flex items-start gap-3.5">
        <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-xl shadow-sm', s.iconBg, s.iconText)}>
          <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-caption font-medium text-ink-3">{label}</p>
          {loading ? (
            <div className="nn-skeleton mt-1 h-8 w-16" />
          ) : (
            <p className="nn-mono text-display font-bold leading-tight text-ink">{value}</p>
          )}
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5 text-caption font-medium">
          <span className={trend.tone === 'pass' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
            {trend.label}
          </span>
        </div>
      )}
    </Card>
  )
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-card border border-divider bg-surface px-3.5 py-2.5 text-caption shadow-modal">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="mt-1 flex items-center gap-2 text-ink-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          <span>{p.dataKey}:</span>
          <span className="font-bold text-ink">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function InspectorHome() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  useDocumentTitle('Home · Inspector Portal')
  const { rows, loading, demo } = useInspectorData()

  const tally = useMemo(() => statusTally(rows), [rows])

  // Top summary values matching reference dashboard
  const displayStats = REFERENCE_STATS

  // Submitted / Finished Inspections (4 rows matching Image 2)
  const recentSubmitted = useMemo(() => {
    const submitted = rows.filter((r) => r.status !== 'draft')
    return submitted.slice(0, 4)
  }, [rows])

  const chartData = useMemo(() => monthlyBuckets(rows), [rows])
  const topViolations = REFERENCE_TOP_VIOLATIONS

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* ------------------------------------------------------ greeting -- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display font-bold tracking-tight text-ink">
            Good morning, Inspector
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
            <span className="nn-mono font-semibold text-ink">{user?.employee_id || 'LM-TG-1042'}</span>
            <span aria-hidden="true" className="text-ink-3">·</span>
            <MapPin size={14} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
            <span>{user?.jurisdiction || 'Hyderabad North'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-card border border-divider bg-surface px-3.5 py-2 text-small font-medium text-ink shadow-sm">
          <CalendarDays size={16} strokeWidth={1.8} className="text-ink-2" aria-hidden="true" />
          <span>Tuesday, 8 September 2026</span>
        </div>
      </div>

      {/* ------------------------------------------------- summary cards -- */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={ClipboardList}
          label="Total Inspections"
          value={displayStats.total}
          family="total"
          trend={displayStats.trends.total}
          loading={loading}
        />
        <StatTile
          icon={CheckCircle}
          label="Compliant"
          value={displayStats.compliant}
          family="compliant"
          trend={displayStats.trends.compliant}
          loading={loading}
        />
        <StatTile
          icon={AlertTriangle}
          label="Non-Compliant"
          value={displayStats.nonCompliant}
          family="nonCompliant"
          trend={displayStats.trends.nonCompliant}
          loading={loading}
        />
        <StatTile
          icon={Clock}
          label="Needs Review"
          value={displayStats.needsReview}
          family="needsReview"
          trend={displayStats.trends.needsReview}
          loading={loading}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* --------------------------------------------- tables column -- */}
        <div className="flex flex-col gap-6">
          {/* Recent Inspections Table */}
          <Card className="overflow-x-auto p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-ink-2" />
                <h2 className="text-h2 font-bold text-ink">Recent Inspections</h2>
              </div>
              <Link
                to="/inspector/inspections"
                className="flex items-center gap-1 text-small font-semibold text-accent-text hover:underline"
              >
                View all <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>

            {loading ? (
              <div className="mt-4">
                <Skeleton lines={6} />
              </div>
            ) : recentSubmitted.length === 0 ? (
              <p className="mt-4 rounded-card border border-dashed border-divider px-4 py-6 text-center text-small text-ink-2">
                No inspections recorded yet.
              </p>
            ) : (
              <Table className="mt-2" caption="Recent inspections, newest first">
                <thead>
                  <tr>
                    <Th>Inspection ID</Th>
                    <Th>Shop Name</Th>
                    <Th>Product</Th>
                    <Th>Date &amp; Time</Th>
                    <Th>Status</Th>
                    <Th align="right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubmitted.map((r) => (
                    <Tr key={r.id} onClick={() => navigate(`/inspector/inspections/${r.id}`)}>
                      <Td>
                        <span className="nn-mono text-small font-semibold text-accent-text">
                          {inspectionLabel(r.id)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-small font-medium text-ink">{r.shopName}</span>
                      </Td>
                      <Td>
                        <span className="text-small text-ink-2">
                          {r.productLabel || 'Commodity Package'}
                        </span>
                      </Td>
                      <Td className="text-small text-ink-2">{prettyDateTime(r)}</Td>
                      <Td>
                        <StatusPill status={r.status} />
                      </Td>
                      <Td align="right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/inspector/inspections/${r.id}`)
                          }}
                        >
                          View
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------- side rail -- */}
        <div className="flex flex-col gap-6">
          {/* Inspection Overview Bar Chart */}
          <Card className="p-5">
            <h2 className="text-h2 font-bold text-ink">Inspection Overview</h2>
            <div className="mt-3 flex items-center justify-end gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-ink-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Compliant
              </span>
              <span className="flex items-center gap-1.5 font-medium text-ink-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Non-Compliant
              </span>
              <span className="flex items-center gap-1.5 font-medium text-ink-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Needs Review
              </span>
            </div>

            <div className="mt-3 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
                  <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} />
                  <YAxis tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--nn-surface-2)' }} />
                  <Bar dataKey="Compliant" stackId="a" fill="#16A34A" />
                  <Bar dataKey="Non-Compliant" stackId="a" fill="#EF4444" />
                  <Bar dataKey="Needs Review" stackId="a" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Top Violations Card */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-h2 font-bold text-ink">Top Violations</h2>
              <Link
                to="/inspector/violations"
                className="flex items-center gap-1 text-small font-semibold text-accent-text hover:underline"
              >
                View all <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>

            <ul className="mt-4 flex flex-col divide-y divide-divider">
              {topViolations.map((r) => (
                <li key={r.check_id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="nn-mono shrink-0 rounded-sm bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                    {r.ruleNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-small text-ink-2" title={r.title}>
                    {r.title}
                  </span>
                  <span className="nn-mono grid h-6 min-w-6 place-items-center rounded-pill bg-rose-50 px-1.5 text-caption font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Quick Actions Card */}
          <Card className="p-5">
            <h2 className="text-h2 font-bold text-ink">Quick Actions</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button
                variant="secondary"
                icon={FileText}
                onClick={() => navigate('/inspector/reports')}
                className="justify-start py-2.5 font-medium"
              >
                View Reports
              </Button>
              <Button
                variant="secondary"
                icon={BarChart2}
                onClick={() => navigate('/inspector/performance')}
                className="justify-start py-2.5 font-medium"
              >
                View Performance
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}