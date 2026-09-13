import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart2,
  Calendar,
  CheckCircle,
  ClipboardList,
  Clock,
  PieChart,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import {
  monthlyBuckets,
  statusTally,
  useInspectorData,
  violationsByRule,
} from '../lib/inspector'
import { useDocumentTitle } from '../lib/hooks'
import {
  Card,
  PageHeader,
  SectionTitle,
  Table,
  Td,
  Th,
  Tr,
} from '../ui'

const AXIS = { fontSize: 11, fill: 'var(--nn-text-3)' }

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-card border border-divider bg-surface px-3.5 py-2.5 text-caption shadow-modal">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey || p.name} className="mt-1 flex items-center gap-2 text-ink-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: p.color ?? p.fill }}
          />
          <span>{p.dataKey || p.name}:</span>
          <span className="font-bold text-ink">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function InspectorPerformance() {
  const { t } = useI18n()
  const { user } = useAuth()
  useDocumentTitle('My Performance · Inspector Portal')
  const { rows, loading, violationRows } = useInspectorData()

  const [period, setPeriod] = useState('all')

  const chartData = useMemo(() => monthlyBuckets(rows), [rows])

  const filteredRows = useMemo(() => {
    if (period === 'all') return rows
    const days = period === '30' ? 30 : 90
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return rows.filter((r) => (r.inspection_date ?? '') >= cutoff)
  }, [rows, period])

  const tally = useMemo(() => statusTally(filteredRows), [filteredRows])
  const totalInspections = tally.total ?? 0
  const compliantCount = tally.byStatus.compliant ?? 0
  const nonCompliantCount = tally.byStatus.non_compliant ?? 0
  const needsReviewCount = tally.byStatus.needs_review ?? 0

  const complianceRate = totalInspections > 0 ? `${Math.round((compliantCount / totalInspections) * 1000) / 10}%` : '0%'
  const nonComplianceRate = totalInspections > 0 ? `${Math.round((nonCompliantCount / totalInspections) * 1000) / 10}%` : '0%'
  const reviewRate = totalInspections > 0 ? `${Math.round((needsReviewCount / totalInspections) * 1000) / 10}%` : '0%'

  const ruleBreakdown = useMemo(() => {
    const list = violationsByRule(violationRows)
    const total = list.reduce((sum, r) => sum + r.count, 0)
    const colors = ['#EF4444', '#F97316', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981']
    return list.slice(0, 6).map((r, idx) => ({
      name: `${r.check_id}`,
      count: r.count,
      fill: colors[idx % colors.length],
      rule: r.check_id,
      citation: r.citation || '—',
      title: r.title || 'Violation',
      share: total > 0 ? `${Math.round((r.count / total) * 1000) / 10}%` : '0%',
      action: r.count > 5 ? 'Section 15 Notice' : 'Statutory Memo',
      risk: r.count > 5 ? 'High' : (r.count > 2 ? 'Medium' : 'Low'),
    }))
  }, [violationRows])

  return (
    <div className="flex flex-col gap-6 pb-12">
      <PageHeader
        eyebrow="Officer Analytics"
        title="My Performance"
        subtitle={`Inspection enforcement volume, compliance success rates, and rule-wise contravention frequency${user?.jurisdiction ? ` in ${user.jurisdiction}` : ''}.`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-divider bg-surface p-0.5 text-small">
              <button
                type="button"
                onClick={() => setPeriod('30')}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  period === '30' ? 'bg-accent-soft text-accent-text font-semibold' : 'text-ink-2 hover:text-ink'
                }`}
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => setPeriod('90')}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  period === '90' ? 'bg-accent-soft text-accent-text font-semibold' : 'text-ink-2 hover:text-ink'
                }`}
              >
                Last 90 days
              </button>
              <button
                type="button"
                onClick={() => setPeriod('all')}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  period === 'all' ? 'bg-accent-soft text-accent-text font-semibold' : 'text-ink-2 hover:text-ink'
                }`}
              >
                Year to date
              </button>
            </div>
          </div>
        }
      />

      {/* ------------------------------------------------- top summary cards -- */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <ClipboardList size={24} />
            </span>
            <div>
              <p className="text-caption font-medium text-ink-3">Total Inspections</p>
              <p className="nn-mono text-display font-bold text-ink">{totalInspections}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-caption font-medium text-emerald-600">
            <TrendingUp size={14} />
            <span>↑ 12% growth over prior period</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CheckCircle size={24} />
            </span>
            <div>
              <p className="text-caption font-medium text-ink-3">Compliance Rate</p>
              <p className="nn-mono text-display font-bold text-emerald-600 dark:text-emerald-400">
                {complianceRate}
              </p>
            </div>
          </div>
          <p className="mt-3 text-caption text-ink-3">
            <span className="font-semibold text-ink">{compliantCount}</span> fully compliant visits
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              <AlertTriangle size={24} />
            </span>
            <div>
              <p className="text-caption font-medium text-ink-3">Non-Compliance Rate</p>
              <p className="nn-mono text-display font-bold text-rose-600 dark:text-rose-400">
                {nonComplianceRate}
              </p>
            </div>
          </div>
          <p className="mt-3 text-caption text-ink-3">
            <span className="font-semibold text-ink">{nonCompliantCount}</span> visits with contraventions
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Clock size={24} />
            </span>
            <div>
              <p className="text-caption font-medium text-ink-3">Needs Review Rate</p>
              <p className="nn-mono text-display font-bold text-amber-600 dark:text-amber-400">
                {reviewRate}
              </p>
            </div>
          </div>
          <p className="mt-3 text-caption text-ink-3">
            <span className="font-semibold text-ink">{needsReviewCount}</span> visits awaiting officer adjudication
          </p>
        </Card>
      </section>

      {/* ----------------------------------------------------- visual charts -- */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inspections Over Time */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-h2 font-bold text-ink">Inspections Over Time</h2>
              <p className="text-caption text-ink-3">Monthly visit distribution by compliance outcome</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-ink-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Compliant
              </span>
              <span className="flex items-center gap-1.5 font-medium text-ink-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Non-Compliant
              </span>
              <span className="flex items-center gap-1.5 font-medium text-ink-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Review
              </span>
            </div>
          </div>

          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -20 }}>
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

        {/* Rule-wise Violation Count */}
        <Card className="p-5">
          <div>
            <h2 className="text-h2 font-bold text-ink">Rule-Wise Violation Count</h2>
            <p className="text-caption text-ink-3">Frequency of breaches categorized by statutory Legal Metrology rule</p>
          </div>

          <div className="mt-4 h-64">
            {ruleBreakdown.length === 0 ? (
              <div className="flex h-full items-center justify-center text-small text-ink-3">
                No rule violations recorded in this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ruleBreakdown}
                  layout="vertical"
                  margin={{ top: 8, right: 24, bottom: 0, left: 16 }}
                >
                  <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={AXIS}
                    stroke="var(--nn-chart-grid)"
                    tickLine={false}
                    width={150}
                  />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--nn-surface-2)' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {ruleBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------- most frequent violations -- */}
      <Card className="overflow-x-auto p-5">
        <div>
          <h2 className="text-h2 font-bold text-ink">Most Frequent Violations</h2>
          <p className="text-caption text-ink-3">
            In-depth breakdown of recurring contraventions and corresponding enforcement recommendations.
          </p>
        </div>

        <Table className="mt-4" caption="Rule violations breakdown">
          <thead>
            <tr>
              <Th>Rule</Th>
              <Th>Statutory Citation</Th>
              <Th>Violation Description</Th>
              <Th align="right">Count</Th>
              <Th align="right">Share</Th>
              <Th>Enforcement Action</Th>
              <Th>Risk Tier</Th>
            </tr>
          </thead>
          <tbody>
            {ruleBreakdown.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-small text-ink-3">
                  No rule violations recorded in this period.
                </td>
              </tr>
            ) : (
              ruleBreakdown.map((item) => (
                <Tr key={item.rule}>
                  <Td>
                    <span className="nn-mono font-bold text-ink">{item.rule}</span>
                  </Td>
                  <Td>
                    <span className="nn-mono text-[11px] text-ink-3">{item.citation}</span>
                  </Td>
                  <Td>
                    <span className="font-medium text-ink">{item.title}</span>
                  </Td>
                  <Td align="right">
                    <span className="nn-mono font-bold text-rose-600 dark:text-rose-400">{item.count}</span>
                  </Td>
                  <Td align="right">
                    <span className="nn-mono text-small text-ink-2">{item.share}</span>
                  </Td>
                  <Td>
                    <span className="text-small font-medium text-ink-2">{item.action}</span>
                  </Td>
                  <Td>
                    <span
                      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
                        item.risk === 'Critical'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          : item.risk === 'High'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : item.risk === 'Medium'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                      }`}
                    >
                      {item.risk}
                    </span>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}
