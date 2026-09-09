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
  REFERENCE_OVERVIEW,
  REFERENCE_STATS,
  REFERENCE_TOP_VIOLATIONS,
  useInspectorData,
} from '../lib/inspector'
import { useDocumentTitle } from '../lib/hooks'
import {
  Card,
  DemoChip,
  PageHeader,
  SectionTitle,
  Table,
  Td,
  Th,
  Tr,
} from '../ui'

const AXIS = { fontSize: 11, fill: 'var(--nn-text-3)' }

const RULE_BREAKDOWN_DATA = [
  { name: 'Rule 6 (Declarations)', count: 12, fill: '#EF4444' },
  { name: 'Rule 7 (Font size)', count: 8, fill: '#F97316' },
  { name: 'Rule 26 (MRP/Tax)', count: 5, fill: '#F59E0B' },
  { name: 'Rule 3 (Weight/Ceiling)', count: 4, fill: '#3B82F6' },
  { name: 'Section 36 (Penalty Tier)', count: 3, fill: '#8B5CF6' },
]

const VIOLATION_TABLE = [
  {
    rule: 'Rule 6',
    citation: 'Rule 6(1)(a) & 6(1)(b)',
    title: 'Mandatory declarations missing on package',
    count: 12,
    share: '37.5%',
    action: 'Section 15 Improvement Notice',
    risk: 'High',
  },
  {
    rule: 'Rule 7',
    citation: 'Rule 7, Table 1',
    title: 'Numeral & letter height below minimum statutory threshold',
    count: 8,
    share: '25.0%',
    action: 'Rectification Notice',
    risk: 'Medium',
  },
  {
    rule: 'Rule 26',
    citation: 'Rule 26 / Rule 6(1)(e)',
    title: 'Retail sale price declaration without inclusive of all taxes',
    count: 5,
    share: '15.6%',
    action: 'Compounding Notice',
    risk: 'High',
  },
  {
    rule: 'Rule 3',
    citation: 'Rule 3, Chapter II',
    title: 'Standard units qualifier / weight expression error',
    count: 4,
    share: '12.5%',
    action: 'Advisory Warning',
    risk: 'Low',
  },
  {
    rule: 'Section 36',
    citation: 'Legal Metrology Act, Sec 36(1)',
    title: 'Multiple repeated offences on commercial consignment',
    count: 3,
    share: '9.4%',
    action: 'Provisional Seizure',
    risk: 'Critical',
  },
]

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
  const { rows, loading, demo } = useInspectorData()

  const [period, setPeriod] = useState('all')

  const chartData = useMemo(() => monthlyBuckets(rows), [rows])

  // Rates
  const totalInspections = 128
  const compliantCount = 94
  const nonCompliantCount = 27
  const needsReviewCount = 7

  const complianceRate = '73.4%'
  const nonComplianceRate = '21.1%'
  const reviewRate = '5.5%'

  return (
    <div className="flex flex-col gap-6 pb-12">
      <PageHeader
        eyebrow="Officer Analytics"
        title="My Performance"
        subtitle="Inspection enforcement volume, compliance success rates, and rule-wise contravention frequency in Hyderabad North."
        actions={
          <div className="flex items-center gap-2">
            {demo && <DemoChip />}
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={RULE_BREAKDOWN_DATA}
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
                  {RULE_BREAKDOWN_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
            {VIOLATION_TABLE.map((item) => (
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
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}
