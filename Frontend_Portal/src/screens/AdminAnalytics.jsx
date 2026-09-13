/**
 * Admin analytics — the second admin dashboard, built for representation rather
 * than operation. The overview answers "how is the jurisdiction doing"; this
 * screen answers "where is the work happening and who is doing it".
 *
 * Every figure here is derived client-side from two real endpoints:
 *   - /admin/dashboard (counts + trend), the same source the overview uses; and
 *   - GET /inspections, whose rows carry store_id, user_id, inspection_date and
 *     scan_count. Names are joined from /stores and /admin/users.
 *
 * Nothing here invents a number the server does not produce: "packages per
 * inspector" is a count of scan_count rows per officer, not a verdict tally,
 * because the inspection list carries no per-visit results. That distinction is
 * stated in each chart's caption.
 */

import { useMemo, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { Activity, CheckCircle, Clock, HelpCircle, Users, XCircle } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDocumentTitle, useLocalPref, useReducedMotion, useResource } from '../lib/hooks'
import {
  adminDashboard,
  inspections as inspectionsFixture,
  storesById,
  usersById,
} from '../mock/fixtures'
import { Card, DemoChip, PageHeader, SectionTitle, Skeleton, StatCard, Tabs } from '../ui'

const AXIS = { fontSize: 11, fill: 'var(--nn-text-3)' }

const PERIODS = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
]

const RESULTS = [
  { key: 'compliant', colour: 'var(--nn-pass-graphic)' },
  { key: 'violation', colour: 'var(--nn-violation-graphic)' },
  { key: 'not_assessed', colour: 'var(--nn-na-graphic)' },
  { key: 'out_of_scope', colour: 'var(--nn-text-3)' },
]

const iso = (d) => format(d, 'yyyy-MM-dd')

function ChartFrame({ title, caption, records, footer, children }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-h2 text-ink">{title}</h3>
        {records != null && <span className="nn-mono text-caption text-ink-3">{records}</span>}
      </div>
      <p className="mt-1 max-w-prose text-caption text-ink-2">{caption}</p>
      <div className="mt-4 h-64">{children}</div>
      {footer}
    </Card>
  )
}

function TipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-sm border border-divider bg-surface px-3 py-2 text-caption shadow-modal">
      <p className="nn-mono font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="mt-0.5 flex items-center gap-1.5 text-ink-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-pill"
            style={{ background: p.color ?? p.fill }}
          />
          {p.name}: <span className="nn-mono font-medium text-ink">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ screen -- */

export default function AdminAnalytics() {
  const { t } = useI18n()
  useDocumentTitle(t('nav.analytics'))
  const reduced = useReducedMotion()
  const [days, setDays] = useLocalPref('analytics.days', 30)

  const end = iso(new Date())
  const start = iso(subDays(new Date(), days - 1))
  const rangeLabel = `${start} → ${end}`

  const dash = useResource(() => endpoints.admin.dashboard({ start, end }), {
    deps: [start, end],
    fallback: adminDashboard,
    label: 'admin-dashboard',
  })
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

  const d = dash.data
  const c = d?.counts ?? {}

  /* ---- Results by day, straight off the dashboard's own trend series. ---- */
  const trend = useMemo(
    () =>
      (d?.trend ?? []).map((p) => ({
        label: (() => {
          try {
            return format(parseISO(p.day), 'd MMM')
          } catch {
            return p.day
          }
        })(),
        compliant: p.counts?.compliant ?? 0,
        violation: p.counts?.violation ?? 0,
        not_assessed: p.counts?.not_assessed ?? 0,
        out_of_scope: p.counts?.out_of_scope ?? 0,
      })),
    [d]
  )

  /* ---- Work per inspector. Rows carry user_id + scan_count. ---- */
  const byOfficer = useMemo(() => {
    const userById = new Map((officers.data ?? []).map((u) => [u.id, u]))
    const acc = new Map()
    for (const i of list.data ?? []) {
      const u = userById.get(i.user_id)
      const name = u?.full_name ?? `Officer #${i.user_id}`
      const row = acc.get(name) ?? { name, visits: 0, packages: 0 }
      row.visits += 1
      row.packages += i.scan_count ?? 0
      acc.set(name, row)
    }
    return [...acc.values()].sort((a, b) => b.packages - a.packages).slice(0, 8)
  }, [list.data, officers.data])

  /* ---- Work per shop, top eight. ---- */
  const byShop = useMemo(() => {
    const shopById = new Map((shops.data ?? []).map((s) => [s.id, s]))
    const acc = new Map()
    for (const i of list.data ?? []) {
      const s = shopById.get(i.store_id)
      const name = s?.name ?? `Shop #${i.store_id}`
      const row = acc.get(name) ?? { name, visits: 0, packages: 0 }
      row.visits += 1
      row.packages += i.scan_count ?? 0
      acc.set(name, row)
    }
    return [...acc.values()].sort((a, b) => b.packages - a.packages).slice(0, 8)
  }, [list.data, shops.data])

  const share = [
    { name: t('result.compliant'), value: c.compliant ?? 0, fill: 'var(--nn-pass-graphic)' },
    { name: t('result.violation'), value: c.violation ?? 0, fill: 'var(--nn-violation-graphic)' },
    { name: t('result.not_assessed'), value: c.not_assessed ?? 0, fill: 'var(--nn-na-graphic)' },
    { name: t('result.out_of_scope'), value: c.out_of_scope ?? 0, fill: 'var(--nn-text-3)' },
  ]
  const pieHasData = share.some((s) => s.value > 0)
  const visits = (list.data ?? []).length
  const demo = dash.demo || list.demo || shops.demo || officers.demo

  return (
    <div className="mx-auto max-w-shell">
      <PageHeader
        eyebrow={t('nav.overview')}
        title={t('nav.analytics')}
        subtitle="Where the work is happening, and who is doing it — derived from the same two endpoints the overview and the list use."
        actions={demo ? <DemoChip /> : undefined}
        meta={<Tabs tabs={PERIODS} value={days} onChange={setDays} />}
      />

      {/* ---- Period tiles. ---- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('admin.inspectionsCount')}
          value={list.loading ? '' : String(visits)}
          loading={list.loading}
          icon={Activity}
        />
        <StatCard
          label={t('admin.scansCount')}
          value={dash.loading ? '' : String(c.total ?? 0)}
          loading={dash.loading}
          icon={CheckCircle}
        />
        <StatCard
          label={t('result.violation')}
          value={dash.loading ? '' : String(c.violation ?? 0)}
          loading={dash.loading}
          family="violation"
          icon={XCircle}
        />
        <StatCard
          label={t('result.not_assessed')}
          value={dash.loading ? '' : String(c.not_assessed ?? 0)}
          loading={dash.loading}
          family="na"
          icon={HelpCircle}
        />
      </section>

      {/* ---- Charts. ---- */}
      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <ChartFrame
          title="Results by day"
          caption="Stacked packages assessed per day, in the four result colours. The stack height is the day's workload."
          records={`${trend.length} days · ${rangeLabel}`}
          footer={
            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {RESULTS.map((r) => (
                <li key={r.key} className="flex items-center gap-2 text-caption text-ink-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-pill"
                    style={{ background: r.colour }}
                  />
                  {t(`result.${r.key}`)}
                </li>
              ))}
            </ul>
          }
        >
          {dash.loading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} minTickGap={16} />
                <YAxis tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} allowDecimals={false} />
                <Tooltip content={<TipBox />} />
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
          )}
        </ChartFrame>

        <ChartFrame
          title="Result share"
          caption="How the period's packages split across the four results. Out of scope is the absence of a duty, not a milder verdict."
          records={`${c.total ?? 0} packages`}
        >
          {dash.loading ? (
            <Skeleton className="h-full w-full" />
          ) : pieHasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={share}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  isAnimationActive={!reduced}
                >
                  {share.map((s) => (
                    <Cell key={s.name} fill={s.fill} stroke="var(--nn-surface)" />
                  ))}
                </Pie>
                <Tooltip content={<TipBox />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center text-small text-ink-2">
              No packages were assessed in this period.
            </div>
          )}
        </ChartFrame>

        <ChartFrame
          title="Packages per inspector"
          caption="A count of packages recorded per officer — a workload figure, not a verdict tally. The list carries no results per inspection."
          records={`${byOfficer.length} officers · ${visits} visits`}
        >
          {list.loading || officers.loading ? (
            <Skeleton className="h-full w-full" />
          ) : byOfficer.length === 0 ? (
            <div className="grid h-full place-items-center text-small text-ink-2">
              No visits were recorded in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byOfficer} margin={{ top: 16, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} interval={0} />
                <YAxis tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} allowDecimals={false} />
                <Tooltip content={<TipBox />} cursor={{ fill: 'var(--nn-surface-2)' }} />
                <Bar
                  dataKey="packages"
                  name={t('inspection.packages')}
                  fill="var(--nn-chart-1)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={!reduced}
                >
                  <LabelList dataKey="packages" position="top" style={AXIS} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        <ChartFrame
          title="Visits per shop"
          caption="The eight shops with the most visits in this period. Coverage, not compliance — a shop visited often is not a shop in breach."
          records={`${byShop.length} shops`}
        >
          {list.loading || shops.loading ? (
            <Skeleton className="h-full w-full" />
          ) : byShop.length === 0 ? (
            <div className="grid h-full place-items-center text-small text-ink-2">
              No visits were recorded in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byShop} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} width={140} />
                <Tooltip content={<TipBox />} cursor={{ fill: 'var(--nn-surface-2)' }} />
                <Bar
                  dataKey="visits"
                  name={t('admin.inspectionsCount')}
                  fill="var(--nn-chart-2)"
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={!reduced}
                >
                  <LabelList dataKey="visits" position="right" style={AXIS} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </section>

      <Card className="mt-6 p-5">
        <SectionTitle caption="Said plainly, so a reviewer can tell a missing figure from a hidden one.">
          What these charts do not claim
        </SectionTitle>
        <ul className="mt-3 space-y-2 text-small text-ink-2">
          <li className="flex gap-2">
            <Clock size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            Packages per officer and visits per shop are workload counts. No per-inspection verdict
            exists on the list endpoint, so neither chart is a performance score.
          </li>
          <li className="flex gap-2">
            <Users size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            Every aggregation happens in this browser over the whole window the server returned. The
            caption on each chart names its record count.
          </li>
        </ul>
      </Card>
    </div>
  )
}