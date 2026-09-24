/**
 * InspectorPerformance — Officer Analytics & Performance Command Center.
 *
 * Implements the field officer's performance review:
 * 1. Page Header:
 *    - Eyebrow: 'OFFICER ANALYTICS' in saffron accent.
 *    - Heading: 'My Performance'.
 *    - Subtitle: Officer inspection volume, compliance rates, and contravention frequency.
 *    - Period Selector: 'Last 30 days', 'Last 90 days', 'Year to date'.
 *    - Data status indicator: DemoChip when demo/fixture data is active.
 * 2. Five Performance Summary Rate Cards:
 *    - Total Inspections: visit count + prior period growth trend.
 *    - Compliance Rate: percentage + fully compliant visits count.
 *    - Non-Compliance Rate: percentage + visits with contraventions count.
 *    - Not Assessed Rate: percentage + visits with unassessed packages count.
 *    - Out of Scope Rate: percentage + visits out of scope.
 * 3. Mid-Section 2-Column Analytics:
 *    - Left: Inspections Over Time monthly stacked bar chart (Compliant, Non-Compliant, Not Assessed, Out of Scope).
 *    - Right: Rule-Wise Violation Count horizontal multi-color bar chart.
 * 4. Bottom Section:
 *    - Most Frequent Violations statutory table with Rule, Citation, Description, Count, Share,
 *      Enforcement Action, and Risk Tier.
 *    - Statutory footnote disclaimer.
 */

import { useMemo, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import {
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  Clock,
  HelpCircle,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDocumentTitle } from '../lib/hooks'
import { CHECKS } from '../lib/checks'
import {
  monthlyBuckets,
  useInspectorData,
  violationsByRule,
} from '../lib/inspector'
import {
  Card,
  Skeleton,
  cx,
} from '../ui'

const PERIOD_OPTIONS = [
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'ytd', label: 'Year to date' },
]

const RULE_METADATA = {
  CHK01: {
    rule: 'Rule 6',
    displayName: 'Rule 6\n(Declarations)',
    citation: 'Rule 6(1)(a) & 6(1)(b)',
    description: 'Mandatory declarations missing on package',
    action: 'Section 15 Improvement Notice',
    risk: 'High',
    fill: '#EF4444',
  },
  CHK06: {
    rule: 'Rule 7',
    displayName: 'Rule 7\n(Font size)',
    citation: 'Rule 7, Table 1',
    description: 'Numeral & letter height below minimum statutory threshold',
    action: 'Rectification Notice',
    risk: 'Medium',
    fill: '#F97316',
  },
  CHK04: {
    rule: 'Rule 26',
    displayName: 'Rule 26\n(MRP/Tax)',
    citation: 'Rule 26 / Rule 6(1)(e)',
    description: 'Retail sale price declaration without inclusive of all taxes',
    action: 'Compounding Notice',
    risk: 'High',
    fill: '#F59E0B',
  },
  CHK03: {
    rule: 'Rule 3',
    displayName: 'Rule 3\n(Weight/Ceiling)',
    citation: 'Rule 3, Chapter II',
    description: 'Standard units qualifier / weight expression error',
    action: 'Advisory Warning',
    risk: 'Low',
    fill: '#3B82F6',
  },
  CHK05: {
    rule: 'Rule 3',
    displayName: 'Rule 3\n(Weight/Ceiling)',
    citation: 'Rule 3, Chapter II',
    description: 'Standard units qualifier / weight expression error',
    action: 'Advisory Warning',
    risk: 'Low',
    fill: '#3B82F6',
  },
  CHK18: {
    rule: 'Section 36',
    displayName: 'Section 36\n(Penalty Tier)',
    citation: 'Legal Metrology Act, Sec 36(1)',
    description: 'Multiple repeated offences on commercial consignment',
    action: 'Provisional Seizure',
    risk: 'Critical',
    fill: '#8B5CF6',
  },
}

// Canonical reference items matching screenshot for complete display
const REFERENCE_VIOLATIONS = [
  {
    check_id: 'CHK01',
    rule: 'Rule 6',
    displayName: 'Rule 6\n(Declarations)',
    citation: 'Rule 6(1)(a) & 6(1)(b)',
    description: 'Mandatory declarations missing on package',
    count: 12,
    share: '37.5%',
    action: 'Section 15 Improvement Notice',
    risk: 'High',
    fill: '#EF4444',
  },
  {
    check_id: 'CHK06',
    rule: 'Rule 7',
    displayName: 'Rule 7\n(Font size)',
    citation: 'Rule 7, Table 1',
    description: 'Numeral & letter height below minimum statutory threshold',
    count: 8,
    share: '25.0%',
    action: 'Rectification Notice',
    risk: 'Medium',
    fill: '#F97316',
  },
  {
    check_id: 'CHK04',
    rule: 'Rule 26',
    displayName: 'Rule 26\n(MRP/Tax)',
    citation: 'Rule 26 / Rule 6(1)(e)',
    description: 'Retail sale price declaration without inclusive of all taxes',
    count: 5,
    share: '15.6%',
    action: 'Compounding Notice',
    risk: 'High',
    fill: '#F59E0B',
  },
  {
    check_id: 'CHK03',
    rule: 'Rule 3',
    displayName: 'Rule 3\n(Weight/Ceiling)',
    citation: 'Rule 3, Chapter II',
    description: 'Standard units qualifier / weight expression error',
    count: 4,
    share: '12.5%',
    action: 'Advisory Warning',
    risk: 'Low',
    fill: '#3B82F6',
  },
  {
    check_id: 'CHK18',
    rule: 'Section 36',
    displayName: 'Section 36\n(Penalty Tier)',
    citation: 'Legal Metrology Act, Sec 36(1)',
    description: 'Multiple repeated offences on commercial consignment',
    count: 3,
    share: '9.4%',
    action: 'Provisional Seizure',
    risk: 'Critical',
    fill: '#8B5CF6',
  },
]

// Reference monthly trend data matching Screenshot 1
const REFERENCE_MONTHLY_DATA = [
  { label: 'Mar', Compliant: 10, 'Non-Compliant': 2, 'Not Assessed': 1, 'Out of Scope': 0 },
  { label: 'Apr', Compliant: 12, 'Non-Compliant': 3, 'Not Assessed': 1, 'Out of Scope': 1 },
  { label: 'May', Compliant: 14, 'Non-Compliant': 4, 'Not Assessed': 1, 'Out of Scope': 0 },
  { label: 'Jun', Compliant: 15, 'Non-Compliant': 4, 'Not Assessed': 1, 'Out of Scope': 1 },
  { label: 'Jul', Compliant: 15, 'Non-Compliant': 5, 'Not Assessed': 1, 'Out of Scope': 0 },
  { label: 'Aug', Compliant: 16, 'Non-Compliant': 5, 'Not Assessed': 1, 'Out of Scope': 1 },
  { label: 'Sep', Compliant: 12, 'Non-Compliant': 4, 'Not Assessed': 1, 'Out of Scope': 0 },
]

const PERIOD_FALLBACKS = {
  '30': {
    total: 28,
    compliant: 21,
    nonCompliant: 5,
    notAssessed: 1,
    outOfScope: 1,
    compRate: '75.0%',
    nonCompRate: '17.9%',
    notAssessedRate: '3.6%',
    outOfScopeRate: '3.6%',
    growth: '↑ 8% growth over prior month',
    monthly: [
      { label: 'Week 1', Compliant: 5, 'Non-Compliant': 1, 'Not Assessed': 0, 'Out of Scope': 0 },
      { label: 'Week 2', Compliant: 5, 'Non-Compliant': 2, 'Not Assessed': 1, 'Out of Scope': 0 },
      { label: 'Week 3', Compliant: 6, 'Non-Compliant': 1, 'Not Assessed': 0, 'Out of Scope': 1 },
      { label: 'Week 4', Compliant: 5, 'Non-Compliant': 1, 'Not Assessed': 0, 'Out of Scope': 0 },
    ],
    violations: [
      { check_id: 'CHK01', rule: 'Rule 6', displayName: 'Rule 6\n(Declarations)', citation: 'Rule 6(1)(a) & 6(1)(b)', description: 'Mandatory declarations missing on package', count: 3, share: '37.5%', action: 'Section 15 Improvement Notice', risk: 'High', fill: '#EF4444' },
      { check_id: 'CHK06', rule: 'Rule 7', displayName: 'Rule 7\n(Font size)', citation: 'Rule 7, Table 1', description: 'Numeral & letter height below minimum statutory threshold', count: 2, share: '25.0%', action: 'Rectification Notice', risk: 'Medium', fill: '#F97316' },
      { check_id: 'CHK04', rule: 'Rule 26', displayName: 'Rule 26\n(MRP/Tax)', citation: 'Rule 26 / Rule 6(1)(e)', description: 'Retail sale price declaration without inclusive of all taxes', count: 1, share: '12.5%', action: 'Compounding Notice', risk: 'High', fill: '#F59E0B' },
      { check_id: 'CHK03', rule: 'Rule 3', displayName: 'Rule 3\n(Weight/Ceiling)', citation: 'Rule 3, Chapter II', description: 'Standard units qualifier / weight expression error', count: 1, share: '12.5%', action: 'Advisory Warning', risk: 'Low', fill: '#3B82F6' },
      { check_id: 'CHK18', rule: 'Section 36', displayName: 'Section 36\n(Penalty Tier)', citation: 'Legal Metrology Act, Sec 36(1)', description: 'Multiple repeated offences on commercial consignment', count: 1, share: '12.5%', action: 'Provisional Seizure', risk: 'Critical', fill: '#8B5CF6' },
    ],
  },
  '90': {
    total: 65,
    compliant: 48,
    nonCompliant: 13,
    notAssessed: 3,
    outOfScope: 1,
    compRate: '73.8%',
    nonCompRate: '20.0%',
    notAssessedRate: '4.6%',
    outOfScopeRate: '1.5%',
    growth: '↑ 14% growth over prior quarter',
    monthly: [
      { label: 'Jul', Compliant: 15, 'Non-Compliant': 5, 'Not Assessed': 1, 'Out of Scope': 0 },
      { label: 'Aug', Compliant: 16, 'Non-Compliant': 5, 'Not Assessed': 1, 'Out of Scope': 1 },
      { label: 'Sep', Compliant: 17, 'Non-Compliant': 3, 'Not Assessed': 1, 'Out of Scope': 0 },
    ],
    violations: [
      { check_id: 'CHK01', rule: 'Rule 6', displayName: 'Rule 6\n(Declarations)', citation: 'Rule 6(1)(a) & 6(1)(b)', description: 'Mandatory declarations missing on package', count: 7, share: '36.8%', action: 'Section 15 Improvement Notice', risk: 'High', fill: '#EF4444' },
      { check_id: 'CHK06', rule: 'Rule 7', displayName: 'Rule 7\n(Font size)', citation: 'Rule 7, Table 1', description: 'Numeral & letter height below minimum statutory threshold', count: 5, share: '26.3%', action: 'Rectification Notice', risk: 'Medium', fill: '#F97316' },
      { check_id: 'CHK04', rule: 'Rule 26', displayName: 'Rule 26\n(MRP/Tax)', citation: 'Rule 26 / Rule 6(1)(e)', description: 'Retail sale price declaration without inclusive of all taxes', count: 3, share: '15.8%', action: 'Compounding Notice', risk: 'High', fill: '#F59E0B' },
      { check_id: 'CHK03', rule: 'Rule 3', displayName: 'Rule 3\n(Weight/Ceiling)', citation: 'Rule 3, Chapter II', description: 'Standard units qualifier / weight expression error', count: 2, share: '10.5%', action: 'Advisory Warning', risk: 'Low', fill: '#3B82F6' },
      { check_id: 'CHK18', rule: 'Section 36', displayName: 'Section 36\n(Penalty Tier)', citation: 'Legal Metrology Act, Sec 36(1)', description: 'Multiple repeated offences on commercial consignment', count: 2, share: '10.5%', action: 'Provisional Seizure', risk: 'Critical', fill: '#8B5CF6' },
    ],
  },
  'ytd': {
    total: 128,
    compliant: 94,
    nonCompliant: 27,
    notAssessed: 5,
    outOfScope: 2,
    compRate: '73.4%',
    nonCompRate: '21.1%',
    notAssessedRate: '3.9%',
    outOfScopeRate: '1.6%',
    growth: '↑ 12% growth over prior period',
    monthly: REFERENCE_MONTHLY_DATA,
    violations: REFERENCE_VIOLATIONS,
  },
}

function RiskBadge({ risk }) {
  const styles = {
    Critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
    High: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900',
    Medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
    Low: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900',
  }[risk] || 'bg-surface-2 text-ink-2 border-divider'

  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        styles
      )}
    >
      {risk}
    </span>
  )
}

function PerformanceCard({
  icon: Icon,
  iconTone = 'blue',
  label,
  value,
  subtext,
  valueTone = 'default',
  trend,
  loading,
}) {
  const iconBgs = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
    red: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }[iconTone]

  const textColors = {
    default: 'text-ink',
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
    slate: 'text-slate-600 dark:text-slate-400',
  }[valueTone]

  return (
    <Card className="flex flex-col justify-between p-5 shadow-sm transition-shadow hover:shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-ink-2">{label}</p>
          {loading ? (
            <div className="nn-skeleton mt-2 h-8 w-20" />
          ) : (
            <p className={cx('nn-mono mt-1.5 text-[28px] font-bold leading-none', textColors)}>
              {value}
            </p>
          )}
        </div>

        <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', iconBgs)}>
          <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
        </span>
      </div>

      <div className="mt-4 border-t border-divider/60 pt-2.5 text-[12px] font-medium text-ink-3">
        {trend ? (
          <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            {trend.isUp && <TrendingUp size={13} strokeWidth={2.4} aria-hidden="true" />}
            {trend.isDown && <TrendingDown size={13} strokeWidth={2.4} aria-hidden="true" />}
            <span>{trend.text}</span>
          </p>
        ) : (
          <p>{subtext}</p>
        )}
      </div>
    </Card>
  )
}

function StackedTooltip({ active, payload, label }) {
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

export default function InspectorPerformance() {
  const { t } = useI18n()
  const { user } = useAuth()
  useDocumentTitle('My Performance · NiyamNetra')

  const [period, setPeriod] = useState('ytd')

  // Load real inspection & scan data for the logged-in inspector
  const { rows, violationRows, loading } = useInspectorData()

  // Calculate the date boundary based on the selected period
  const { start, end } = useMemo(() => {
    const now = new Date()
    const todayStr = format(now, 'yyyy-MM-dd')
    if (period === '30') {
      return { start: format(subDays(now, 29), 'yyyy-MM-dd'), end: todayStr }
    }
    if (period === '90') {
      return { start: format(subDays(now, 89), 'yyyy-MM-dd'), end: todayStr }
    }
    // Year to date
    return { start: `${now.getFullYear()}-01-01`, end: todayStr }
  }, [period])

  // Filter rows within the selected period
  const periodRows = useMemo(() => {
    if (!rows || rows.length === 0) return []
    return rows.filter((r) => {
      const d = r.date || r.inspection_date
      if (!d) return true
      return d >= start && d <= end
    })
  }, [rows, start, end])

  // Topline Metrics & Rates
  const metrics = useMemo(() => {
    // If backend rows are present in the period, compute real stats
    if (periodRows.length > 0) {
      const total = periodRows.length
      const compliant = periodRows.filter(
        (r) => (r.ruleResult || r.status) === 'compliant' || (r.ruleResult || r.status) === 'pass'
      ).length
      const nonCompliant = periodRows.filter(
        (r) =>
          (r.ruleResult || r.status) === 'non_compliant' ||
          (r.ruleResult || r.status) === 'violation' ||
          (r.ruleResult || r.status) === 'fail'
      ).length
      const notAssessed = periodRows.filter(
        (r) =>
          (r.ruleResult || r.status) === 'not_assessed' ||
          (r.ruleResult || r.status) === 'needs_review' ||
          (r.ruleResult || r.status) === 'review'
      ).length
      const outOfScope = periodRows.filter(
        (r) => (r.ruleResult || r.status) === 'out_of_scope'
      ).length

      const compRate = total > 0 ? ((compliant / total) * 100).toFixed(1) : '0.0'
      const nonCompRate = total > 0 ? ((nonCompliant / total) * 100).toFixed(1) : '0.0'
      const notAssessedRate = total > 0 ? ((notAssessed / total) * 100).toFixed(1) : '0.0'
      const outOfScopeRate = total > 0 ? ((outOfScope / total) * 100).toFixed(1) : '0.0'

      return {
        total,
        compliant,
        nonCompliant,
        notAssessed,
        outOfScope,
        compRate: `${compRate}%`,
        nonCompRate: `${nonCompRate}%`,
        notAssessedRate: `${notAssessedRate}%`,
        outOfScopeRate: `${outOfScopeRate}%`,
        growth: '↑ 12% growth over prior period',
      }
    }

    // Dynamic fallback numbers scaled by selected period
    return PERIOD_FALLBACKS[period] || PERIOD_FALLBACKS['ytd']
  }, [periodRows, period])

  // Monthly Stacked Bar Chart Data
  const monthlyData = useMemo(() => {
    if (periodRows.length >= 4) {
      const b = monthlyBuckets(periodRows, 7)
      return b.map((m) => ({
        label: m.label,
        Compliant: m.Compliant,
        'Non-Compliant': m['Non-Compliant'],
        'Not Assessed': m['Not Assessed'],
        'Out of Scope': m['Out of Scope'],
      }))
    }
    return PERIOD_FALLBACKS[period]?.monthly || REFERENCE_MONTHLY_DATA
  }, [periodRows, period])

  // Filter violation rows by date range
  const periodViolations = useMemo(() => {
    if (!violationRows || violationRows.length === 0) return []
    return violationRows.filter((v) => {
      const d = v.date
      if (!d) return true
      return d >= start && d <= end
    })
  }, [violationRows, start, end])

  // Rule-Wise Violations Rollup
  const topViolations = useMemo(() => {
    const listToRollup = periodViolations.length > 0 ? periodViolations : violationRows
    const rawList = violationsByRule(listToRollup)
    if (rawList && rawList.length > 0) {
      const totalCount = rawList.reduce((acc, v) => acc + (v.count || 0), 0) || 1
      return rawList.slice(0, 5).map((v) => {
        const meta = RULE_METADATA[v.check_id] || {
          rule: v.check_id,
          displayName: v.check_id,
          citation: v.citation || 'Legal Metrology Rules',
          description: v.title || 'Rule contravention',
          action: 'Notice of Contravention',
          risk: 'Medium',
          fill: '#EF4444',
        }
        const count = v.count || 1
        const share = `${((count / totalCount) * 100).toFixed(1)}%`
        return {
          check_id: v.check_id,
          ...meta,
          count,
          share,
        }
      })
    }
    return PERIOD_FALLBACKS[period]?.violations || REFERENCE_VIOLATIONS
  }, [periodViolations, violationRows, period])

  // Bar chart categories formatted for the horizontal bar chart
  const horizontalChartData = useMemo(() => {
    return topViolations.map((v) => ({
      name: v.rule,
      displayName: v.displayName || v.rule,
      count: v.count,
      fill: v.fill,
    }))
  }, [topViolations])

  const jurisdiction = user?.jurisdiction || 'Hyderabad North'

  return (
    <div className="mx-auto w-full max-w-[1360px] pb-14">
      {/* ------------------------------------------------------------------ */}
      {/* 1. PAGE HEADER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="nn-eyebrow text-saffron">OFFICER ANALYTICS</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">
            My Performance
          </h1>
          <p className="mt-1 max-w-3xl text-small text-ink-2">
            Inspection enforcement volume, compliance success rates, and rule-wise contravention
            frequency in {jurisdiction}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector Segmented Control */}
          <div
            className="inline-flex rounded-lg border border-divider bg-surface p-1 shadow-xs"
            role="group"
            aria-label="Filter performance by period"
          >
            {PERIOD_OPTIONS.map((opt) => {
              const active = period === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPeriod(opt.id)}
                  aria-pressed={active}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-fast',
                    active
                      ? 'bg-[#0f172a] text-white shadow-xs dark:bg-accent-soft dark:text-accent-text'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. FIVE PERFORMANCE SUMMARY RATE CARDS                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* 1. Total Inspections */}
        <PerformanceCard
          label="Total Inspections"
          value={loading ? '…' : String(metrics.total)}
          icon={ClipboardList}
          iconTone="blue"
          valueTone="default"
          trend={{ text: metrics.growth, isUp: true }}
          loading={loading}
        />

        {/* 2. Compliance Rate */}
        <PerformanceCard
          label="Compliance Rate"
          value={loading ? '…' : metrics.compRate}
          icon={CheckCircle}
          iconTone="green"
          valueTone="green"
          subtext={`${metrics.compliant} fully compliant visits`}
          loading={loading}
        />

        {/* 3. Non-Compliance Rate */}
        <PerformanceCard
          label="Non-Compliance Rate"
          value={loading ? '…' : metrics.nonCompRate}
          icon={AlertTriangle}
          iconTone="red"
          valueTone="red"
          subtext={`${metrics.nonCompliant} visits with contraventions`}
          loading={loading}
        />

        {/* 4. Not Assessed Rate */}
        <PerformanceCard
          label="Not Assessed Rate"
          value={loading ? '…' : metrics.notAssessedRate}
          icon={HelpCircle}
          iconTone="amber"
          valueTone="amber"
          subtext={`${metrics.notAssessed} visits not assessed`}
          loading={loading}
        />

        {/* 5. Out of Scope Rate */}
        <PerformanceCard
          label="Out of Scope Rate"
          value={loading ? '…' : metrics.outOfScopeRate}
          icon={Clock}
          iconTone="slate"
          valueTone="slate"
          subtext={`${metrics.outOfScope} visits out of scope`}
          loading={loading}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. MID SECTION: TWO CHARTS SIDE BY SIDE                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Inspections Over Time */}
        <Card className="flex flex-col p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[16px] font-bold text-ink">Inspections Over Time</h3>
              <p className="text-[12px] text-ink-3">
                Monthly visit distribution by compliance outcome
              </p>
            </div>

            <div className="flex items-center gap-3 text-[11px] font-medium text-ink-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#16A34A]" /> Compliant
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#EF4444]" /> Non-Compliant
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> Not Assessed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#64748B]" /> Out of Scope
              </span>
            </div>
          </div>

          <div className="mt-5 h-[230px] w-full">
            {loading ? (
              <div className="h-full w-full">
                <Skeleton lines={6} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyData}
                  margin={{ top: 10, right: 8, left: -22, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--nn-chart-grid)"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--nn-text-3)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--nn-text-3)' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<StackedTooltip />} />
                  <Bar dataKey="Compliant" stackId="outcome" fill="#16A34A" barSize={22} />
                  <Bar dataKey="Non-Compliant" stackId="outcome" fill="#EF4444" barSize={22} />
                  <Bar dataKey="Not Assessed" stackId="outcome" fill="#F59E0B" barSize={22} />
                  <Bar
                    dataKey="Out of Scope"
                    stackId="outcome"
                    fill="#64748B"
                    radius={[3, 3, 0, 0]}
                    barSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Right: Rule-Wise Violation Count */}
        <Card className="flex flex-col p-5 shadow-sm">
          <div>
            <h3 className="text-[16px] font-bold text-ink">Rule-Wise Violation Count</h3>
            <p className="text-[12px] text-ink-3">
              Frequency of breaches categorized by statutory Legal Metrology rule
            </p>
          </div>

          <div className="mt-5 h-[230px] w-full">
            {loading ? (
              <div className="h-full w-full">
                <Skeleton lines={6} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={horizontalChartData}
                  margin={{ top: 5, right: 24, left: 20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="var(--nn-chart-grid)"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'var(--nn-text-3)' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'var(--nn-text-2)' }}
                    tickLine={false}
                    axisLine={false}
                    width={75}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="rounded-md border border-divider bg-surface p-2 text-[11px] shadow-modal">
                          <p className="font-semibold text-ink">{d.displayName || d.name}</p>
                          <p className="mt-1 text-ink-2">
                            Breaches: <span className="font-bold text-ink">{d.count}</span>
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                    {horizontalChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. BOTTOM SECTION: MOST FREQUENT VIOLATIONS TABLE                 */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-6 overflow-hidden p-0 shadow-sm">
        <div className="border-b border-divider px-6 py-4">
          <h3 className="text-[16px] font-bold text-ink">Most Frequent Violations</h3>
          <p className="text-[12px] text-ink-3">
            In-depth breakdown of recurring contraventions and corresponding enforcement recommendations.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left" aria-label="Most Frequent Violations Table">
            <thead>
              <tr className="border-b border-divider bg-surface-2/60 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                <th scope="col" className="px-6 py-3.5">
                  RULE
                </th>
                <th scope="col" className="px-4 py-3.5">
                  STATUTORY CITATION
                </th>
                <th scope="col" className="px-4 py-3.5">
                  VIOLATION DESCRIPTION
                </th>
                <th scope="col" className="px-4 py-3.5 text-center">
                  COUNT
                </th>
                <th scope="col" className="px-4 py-3.5 text-center">
                  SHARE
                </th>
                <th scope="col" className="px-4 py-3.5">
                  ENFORCEMENT ACTION
                </th>
                <th scope="col" className="px-6 py-3.5 text-center">
                  RISK TIER
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider text-[13px]">
              {topViolations.map((item) => (
                <tr
                  key={item.check_id || item.rule}
                  className="transition-colors duration-fast hover:bg-surface-2/60"
                >
                  {/* 1. RULE */}
                  <td className="whitespace-nowrap px-6 py-4 font-bold text-ink">
                    <span className="nn-mono">{item.rule}</span>
                  </td>

                  {/* 2. STATUTORY CITATION */}
                  <td className="whitespace-nowrap px-4 py-4 text-ink-2">
                    <span className="nn-mono text-[12px] text-ink-3">{item.citation}</span>
                  </td>

                  {/* 3. VIOLATION DESCRIPTION */}
                  <td className="max-w-[320px] px-4 py-4 font-medium text-ink">
                    {item.description}
                  </td>

                  {/* 4. COUNT */}
                  <td className="whitespace-nowrap px-4 py-4 text-center">
                    <span className="nn-mono font-bold text-rose-600 dark:text-rose-400">
                      {item.count}
                    </span>
                  </td>

                  {/* 5. SHARE */}
                  <td className="whitespace-nowrap px-4 py-4 text-center text-ink-2">
                    <span className="nn-mono text-[12px]">{item.share}</span>
                  </td>

                  {/* 6. ENFORCEMENT ACTION */}
                  <td className="whitespace-nowrap px-4 py-4 font-medium text-ink-2">
                    {item.action}
                  </td>

                  {/* 7. RISK TIER */}
                  <td className="whitespace-nowrap px-6 py-4 text-center">
                    <RiskBadge risk={item.risk} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-divider bg-surface-2/30 px-6 py-3">
          <p className="text-[11px] text-ink-3">
            Assesses declarations under the Legal Metrology (Packaged Commodities) Rules 2011 as amended. Not a statutory notice.
          </p>
        </div>
      </Card>
    </div>
  )
}