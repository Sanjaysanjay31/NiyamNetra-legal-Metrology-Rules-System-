/**
 * My performance — the inspector's own dashboard.
 *
 * There is no inspector analytics endpoint on the server, and this screen does
 * not pretend otherwise: every chart here aggregates GET /inspections, which is
 * scoped to the signed-in officer by construction. So every figure is the
 * officer's own work — visits, packages, shops — and none of it is a verdict
 * tally, because the list carries no per-visit results. That boundary is stated
 * on the screen rather than smoothed over.
 */

import { useMemo, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { Activity, CalendarDays, ClipboardList, Clock, Store, Target } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDocumentTitle, useLocalPref, useReducedMotion, useResource } from '../lib/hooks'
import { inspections as inspectionsFixture, storesById } from '../mock/fixtures'
import { Card, DemoChip, PageHeader, SectionTitle, Skeleton, StatCard, Tabs } from '../ui'

const AXIS = { fontSize: 11, fill: 'var(--nn-text-3)' }

const PERIODS = [
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
  { id: 180, label: '6 months' },
]

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const iso = (d) => format(d, 'yyyy-MM-dd')

function ChartFrame({ title, caption, records, children }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-h2 text-ink">{title}</h3>
        {records != null && <span className="nn-mono text-caption text-ink-3">{records}</span>}
      </div>
      <p className="mt-1 max-w-prose text-caption text-ink-2">{caption}</p>
      <div className="mt-4 h-64">{children}</div>
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

export default function InspectorPerformance() {
  const { t } = useI18n()
  useDocumentTitle(t('nav.performance'))
  const reduced = useReducedMotion()
  const [days, setDays] = useLocalPref('perf.days', 30)

  const end = iso(new Date())
  const start = iso(subDays(new Date(), days - 1))
  const rangeLabel = `${start} → ${end}`

  const list = useResource(() => endpoints.inspections.list({ date_from: start, date_to: end }), {
    deps: [start, end],
    fallback: inspectionsFixture,
    label: 'inspections',
  })
  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: 'stores',
  })

  /* ---- Rows with shop names joined. ---- */
  const rows = useMemo(() => {
    const shopById = new Map((shops.data ?? []).map((s) => [s.id, s]))
    return (list.data ?? []).map((i) => ({
      id: i.id,
      date: i.inspection_date ?? null,
      shopName: shopById.get(i.store_id)?.name ?? `Shop #${i.store_id}`,
      status: i.status ?? null,
      scans: i.scan_count ?? 0,
    }))
  }, [list.data, shops.data])

  /* ---- Packages and visits per day. ---- */
  const byDay = useMemo(() => {
    const acc = new Map()
    for (const r of rows) {
      if (!r.date) continue
      const row = acc.get(r.date) ?? { day: r.date, visits: 0, packages: 0 }
      row.visits += 1
      row.packages += r.scans
      acc.set(r.date, row)
    }
    return [...acc.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((r) => ({
        ...r,
        label: (() => {
          try {
            return format(parseISO(r.day), 'd MMM')
          } catch {
            return r.day
          }
        })(),
      }))
  }, [rows])

  /* ---- Top shops by packages. ---- */
  const byShop = useMemo(() => {
    const acc = new Map()
    for (const r of rows) {
      const row = acc.get(r.shopName) ?? { name: r.shopName, visits: 0, packages: 0 }
      row.visits += 1
      row.packages += r.scans
      acc.set(r.shopName, row)
    }
    return [...acc.values()].sort((a, b) => b.packages - a.packages).slice(0, 8)
  }, [rows])

  /* ---- Workload by weekday, Mon..Sun. ---- */
  const byWeekday = useMemo(() => {
    const acc = WEEKDAYS.map((label) => ({ label, visits: 0, packages: 0 }))
    for (const r of rows) {
      if (!r.date) continue
      try {
        // getDay(): 0=Sun..6=Sat → index into the Mon-first array.
        const idx = (parseISO(r.date).getDay() + 6) % 7
        acc[idx].visits += 1
        acc[idx].packages += r.scans
      } catch {
        /* an unparseable date is skipped rather than plotted under a guess */
      }
    }
    return acc
  }, [rows])

  const visits = rows.length
  const packages = rows.reduce((n, r) => n + r.scans, 0)
  const drafts = rows.filter((r) => r.status === 'draft').length
  const shopsVisited = new Set(rows.map((r) => r.shopName)).size
  const demo = list.demo || shops.demo

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        eyebrow={t('nav.home')}
        title={t('nav.performance')}
        subtitle="Your own work over the chosen window, aggregated in this browser from your inspection list. Every figure is yours — the server scopes this data to your account."
        actions={demo ? <DemoChip /> : undefined}
        meta={<Tabs tabs={PERIODS} value={days} onChange={setDays} />}
      />

      {/* ---- Period tiles. ---- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('nav.inspections')} value={list.loading ? '' : String(visits)} loading={list.loading} icon={ClipboardList} />
        <StatCard label={t('inspection.packages')} value={list.loading ? '' : String(packages)} loading={list.loading} icon={Target} />
        <StatCard label="Shops visited" value={list.loading ? '' : String(shopsVisited)} loading={list.loading} icon={Store} />
        <StatCard
          label={t('inspection.draft')}
          value={list.loading ? '' : String(drafts)}
          loading={list.loading}
          family="na"
          icon={Clock}
        />
      </section>

      {/* ---- Charts. ---- */}
      <section className="mt-8 grid gap-5">
        <ChartFrame
          title="Packages per day"
          caption="Packages recorded each day in the window. Quiet days are gaps, not zeros pretending to be effort."
          records={`${byDay.length} active days · ${rangeLabel}`}
        >
          {list.loading ? (
            <Skeleton className="h-full w-full" />
          ) : byDay.length === 0 ? (
            <div className="grid h-full place-items-center text-small text-ink-2">
              No visits were recorded in this window.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} margin={{ top: 16, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} minTickGap={16} />
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
          title="Visits per day"
          caption="Shops visited each day. A visit with zero packages still counts — it is work, and it is recorded."
          records={`${visits} visits`}
        >
          {list.loading ? (
            <Skeleton className="h-full w-full" />
          ) : byDay.length === 0 ? (
            <div className="grid h-full place-items-center text-small text-ink-2">
              No visits were recorded in this window.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={byDay} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} minTickGap={16} />
                <YAxis tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} allowDecimals={false} />
                <Tooltip content={<TipBox />} />
                <Area
                  type="monotone"
                  dataKey="visits"
                  name={t('nav.inspections')}
                  stroke="var(--nn-chart-2)"
                  strokeWidth={1.75}
                  fill="var(--nn-chart-2)"
                  fillOpacity={0.2}
                  isAnimationActive={!reduced}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        <ChartFrame
          title="Your most-visited shops"
          caption="The eight shops with the most packages recorded. Coverage, not compliance — this says where you worked, not what you found."
          records={`${byShop.length} shops`}
        >
          {list.loading || shops.loading ? (
            <Skeleton className="h-full w-full" />
          ) : byShop.length === 0 ? (
            <div className="grid h-full place-items-center text-small text-ink-2">
              No visits were recorded in this window.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byShop} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} width={140} />
                <Tooltip content={<TipBox />} cursor={{ fill: 'var(--nn-surface-2)' }} />
                <Bar
                  dataKey="packages"
                  name={t('inspection.packages')}
                  fill="var(--nn-chart-3)"
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={!reduced}
                >
                  <LabelList dataKey="packages" position="right" style={AXIS} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        <ChartFrame
          title="Workload by weekday"
          caption="Where your week actually goes. Useful for planning — and honest about the quiet days."
          records={`${visits} visits · ${packages} packages`}
        >
          {list.loading ? (
            <Skeleton className="h-full w-full" />
          ) : visits === 0 ? (
            <div className="grid h-full place-items-center text-small text-ink-2">
              No visits were recorded in this window.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byWeekday} margin={{ top: 16, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="var(--nn-chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} />
                <YAxis tick={AXIS} stroke="var(--nn-chart-grid)" tickLine={false} allowDecimals={false} />
                <Tooltip content={<TipBox />} cursor={{ fill: 'var(--nn-surface-2)' }} />
                <Bar
                  dataKey="visits"
                  name={t('nav.inspections')}
                  fill="var(--nn-chart-4)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={!reduced}
                >
                  <LabelList dataKey="visits" position="top" style={AXIS} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </section>

      <Card className="mt-6 p-5">
        <SectionTitle caption="The honest boundary of this screen.">What this dashboard is not</SectionTitle>
        <ul className="mt-3 space-y-2 text-small text-ink-2">
          <li className="flex gap-2">
            <Activity size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            There is no inspector analytics endpoint, so every chart aggregates your own inspection
            list in this browser. Nothing here is a jurisdiction total.
          </li>
          <li className="flex gap-2">
            <CalendarDays size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            These are workload figures. The list carries no per-visit results, so no chart here is a
            compliance score — verdicts live on the findings pages, package by package.
          </li>
        </ul>
      </Card>
    </div>
  )
}