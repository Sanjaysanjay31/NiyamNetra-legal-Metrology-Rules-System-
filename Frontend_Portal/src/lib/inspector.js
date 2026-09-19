/**
 * Inspector-side derivation, shared by every screen in the inspector section.
 *
 * There is no inspector analytics endpoint on the server, so every figure the
 * inspector dashboard shows is assembled in this browser from the endpoints
 * that DO exist: GET /inspections (scoped to the signed-in officer by the
 * router), GET /inspections/{id} (six summary fields per scan) and GET
 * /scans/{id} (findings and evidence). All data is strictly live from the server.
 *
 * The one derived judgement this file makes is `statusOfInspection`: a visit
 * carries several packages, each with its own result, and an officer reading a
 * list needs one word per visit. The rule is deliberately conservative —
 *   any violation  → Violation
 *   else any not_assessed or no scans → Not Assessed
 *   else any compliant → Compliant
 *   else (only out-of-scope packages) → Out of scope
 * It is a reading aid, not a verdict: the per-package results on the record
 * page remain the only authoritative statement.
 */

import { useEffect, useMemo, useState } from 'react'
import { endpoints } from '../api/client'
import { inspections as inspectionsFixture, stores as storesFixture, scansById } from '../mock/fixtures'
import { DERIVED_CHECK, verdictOf } from './checks'
import { useResource } from './hooks'

/* ------------------------------------------------------------- statuses ---- */

export const INSPECTION_STATUS = {
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  DRAFT: 'in_progress',
}

export const RULE_RESULT = {
  COMPLIANT: 'compliant',
  VIOLATION: 'violation',
  NOT_ASSESSED: 'not_assessed',
  OUT_OF_SCOPE: 'out_of_scope',
}

export const SYNC_STATUS = {
  SYNCED: 'synced',
  NOT_SYNCED: 'not_synced',
}

/** Label + verdict family per status. Icons are chosen by the screens. */
export const STATUS_META = {
  compliant: { label: 'Compliant', family: 'pass' },
  violation: { label: 'Violation', family: 'violation' },
  non_compliant: { label: 'Violation', family: 'violation' },
  not_assessed: { label: 'Not Assessed', family: 'na' },
  out_of_scope: { label: 'Out of Scope', family: 'na' },
  in_progress: { label: 'In Progress', family: 'review' },
  submitted: { label: 'Submitted', family: 'pass' },
}

export function inspectionLabel(id) {
  return `INS-${id}`
}

/** Derived Rule Result across an inspection's scans. */
export function ruleResultOfInspection(inspection, scans = []) {
  const live = scans.filter((s) => s.duplicate_of == null)
  if (live.some((s) => s.overall_result === 'violation')) return RULE_RESULT.VIOLATION
  if (live.some((s) => s.overall_result === 'not_assessed' || s.overall_result == null)) {
    return RULE_RESULT.NOT_ASSESSED
  }
  if (live.some((s) => s.overall_result === 'compliant')) return RULE_RESULT.COMPLIANT
  return RULE_RESULT.OUT_OF_SCOPE
}

export function statusOfInspection(inspection, scans = []) {
  return ruleResultOfInspection(inspection, scans)
}

/** Violations on one scan. The derived Section 36 tier is excluded: it
    restates the other fails rather than being a breach of its own. */
export function violationCountOf(scan) {
  if (!scan) return 0
  if (Array.isArray(scan.findings)) {
    return scan.findings.filter((f) => f.check_id !== DERIVED_CHECK && verdictOf(f) === 'fail').length
  }
  return scan.counts?.failed ?? 0
}

export function productLabel(scan) {
  if (!scan) return null
  return [scan.commodity_generic, scan.brand_name].filter(Boolean).join(' — ') || null
}

/** Violation rows for one scan: rule number, description, evidence. */
export function scanViolationRows(scan) {
  if (!scan?.findings) return []
  return scan.findings
    .filter((f) => f.check_id !== DERIVED_CHECK && verdictOf(f) === 'fail')
    .map((f) => ({
      check_id: f.check_id,
      title: f.title,
      severity: f.severity,
      citation: f.citation,
      reason: f.reason,
      observed: f.observed,
      required: f.required,
      confidence: f.confidence,
      effective_verdict: verdictOf(f),
      human_verdict: f.human_verdict ?? null,
      engine_verdict: f.engine_verdict ?? null,
      scan_id: scan.id,
      evidence: (scan.images ?? []).map((i) => i.panel),
    }))
}

/* ------------------------------------------------------------ row builder -- */

/**
 * One row per inspection with everything the lists and cards display:
 * shop name, product summary, derived status and violation count. `scansFor`
 * supplies per-inspection scan summaries — fixtures in demo mode, fetched
 * detail responses in live mode.
 */
export function buildRows(inspections, shops, scansFor) {
  const byId = new Map((shops ?? []).map((s) => [s.id, s]))
  return (inspections ?? [])
    .map((i) => {
      const scans = scansFor(i.id) ?? []
      const live = scans.filter((s) => s.duplicate_of == null)
      const products = live.map(productLabel).filter(Boolean)
      const shop = byId.get(i.store_id)
      const ruleResult = ruleResultOfInspection(i, scans)
      const isSubmitted = i.status === 'submitted' || Boolean(i.submitted_at) || i.resultVerdict != null
      const inspectionStatus = isSubmitted ? 'submitted' : 'in_progress'
      const isSynced = i.syncState === 'synced' || Boolean(i.synced_at) || i.sync_status === 'synced'
      const syncStatus = isSynced ? 'synced' : 'not_synced'

      return {
        ...i,
        date: i.inspection_date ?? (i.created_at ? i.created_at.slice(0, 10) : null),
        status: ruleResult,
        ruleResult,
        inspectionStatus,
        syncStatus,
        products,
        productLabel: products[0] ?? null,
        productCount: products.length,
        violations: live.reduce((n, s) => n + violationCountOf(s), 0),
        shopName: shop?.name ?? `Store #${i.store_id}`,
        shopCity: shop?.city ?? null,
        shopType: shop?.store_type ?? null,
        scans,
      }
    })
    .sort((a, b) => {
      const d = String(b.inspection_date ?? '').localeCompare(String(a.inspection_date ?? ''))
      return d !== 0 ? d : (b.id ?? 0) - (a.id ?? 0)
    })
}

/**
 * The master hook behind Home, Inspections, Violations, Reports and
 * Performance. Fetches the officer's inspection list and shops; against a live
 * backend it then fetches the detail of each listed inspection (bounded) for
 * product names and per-package results, and full scans for the packages that
 * carry a violation or an unassessed result, so the violations surfaces work
 * from real findings. In demo mode the same shapes come from the fixtures.
 */
export function useInspectorData({ maxDetails = 60, maxFullScans = 24 } = {}) {
  const list = useResource(() => endpoints.inspections.list(), {
    fallback: inspectionsFixture,
    label: 'inspections',
  })
  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: storesFixture,
    label: 'stores',
  })

  /* Live mode: inspection details (scan summaries) + full scans for the
     packages whose findings a review surface needs. */
  const [liveSummaries, setLiveSummaries] = useState(null)
  const [liveScans, setLiveScans] = useState(null)

  useEffect(() => {
    let alive = true
    if (!Array.isArray(list.data)) {
      setLiveSummaries(null)
      setLiveScans(null)
      return undefined
    }
    const rows = list.data.slice(0, maxDetails)
    Promise.all(rows.map((r) => endpoints.inspections.get(r.id).catch(() => null)))
      .then((details) => {
        if (!alive) return undefined
        const summaries = {}
        const flagged = []
        for (const d of details) {
          if (d?.id == null) continue
          summaries[d.id] = d.scans ?? []
          for (const s of d.scans ?? []) {
            if (
              s.duplicate_of == null &&
              (s.overall_result === 'violation' || s.overall_result === 'not_assessed')
            ) {
              flagged.push(s.id)
            }
          }
        }
        setLiveSummaries(summaries)
        return Promise.all(
          flagged.slice(0, maxFullScans).map((sid) => endpoints.scans.get(sid).catch(() => null))
        ).then((full) => {
          if (!alive) return
          const map = {}
          for (const s of full) if (s?.id != null) map[s.id] = s
          setLiveScans(map)
        })
      })
      .catch(() => {
        if (alive) {
          setLiveSummaries({})
          setLiveScans({})
        }
      })
    return () => {
      alive = false
    }
  }, [list.data, maxDetails, maxFullScans])

  const scansFor = useMemo(() => {
    const map = liveSummaries ?? {}
    return (id) => {
      if (map[id] && map[id].length > 0) return map[id]
      const fixtureScans = Object.values(scansById).filter((s) => s.inspection_id === id)
      return fixtureScans.length ? fixtureScans : (map[id] ?? [])
    }
  }, [liveSummaries])

  const rows = useMemo(() => {
    const rawInspections = Array.isArray(list.data) ? list.data : (inspectionsFixture ?? [])
    const rawShops = Array.isArray(shops.data) ? shops.data : (storesFixture ?? [])
    return buildRows(rawInspections, rawShops, scansFor)
  }, [list.data, shops.data, scansFor])

  const fullScans = useMemo(() => {
    if (liveScans && Object.keys(liveScans).length > 0) return { ...scansById, ...liveScans }
    return scansById
  }, [liveScans])

  /* One violation row per failing finding across all inspections, newest first. */
  const violationRows = useMemo(() => {
    const out = []
    for (const row of rows) {
      if (row.ruleResult !== RULE_RESULT.VIOLATION && row.status !== 'violation' && row.status !== 'non_compliant') continue
      for (const s of row.scans) {
        const full = fullScans[s.id]
        if (!full) continue
        for (const v of scanViolationRows(full)) {
          out.push({
            ...v,
            inspection_id: row.id,
            shopName: row.shopName,
            shopCity: row.shopCity,
            product: productLabel(s) ?? s.commodity_generic ?? null,
            date: row.inspection_date,
            submittedAt: row.submitted_at,
          })
        }
      }
    }
    return out.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  }, [rows, fullScans])

  const loading =
    list.loading ||
    shops.loading ||
    (liveSummaries == null && Array.isArray(list.data) && list.data.length > 0)

  return {
    rows,
    shops: shops.data ?? storesFixture ?? [],
    fullScans,
    violationRows,
    loading,
    demo: Boolean(list.demo || shops.demo),
    reload: list.reload,
  }
}

/* ------------------------------------------------------------- aggregates -- */

/** Count rows per status. `excluded` counts out-of-scope visits. */
export function statusTally(rows = []) {
  const byStatus = {
    compliant: 0,
    violation: 0,
    non_compliant: 0,
    not_assessed: 0,
    out_of_scope: 0,
    in_progress: 0,
    submitted: 0,
  }
  for (const r of rows) {
    const res = r.ruleResult || r.status
    if (res === 'compliant' || res === 'pass') byStatus.compliant += 1
    else if (res === 'violation' || res === 'non_compliant' || res === 'fail') {
      byStatus.violation += 1
      byStatus.non_compliant += 1
    } else if (res === 'not_assessed' || res === 'needs_review') {
      byStatus.not_assessed += 1
    } else {
      byStatus.out_of_scope += 1
    }

    if (r.inspectionStatus === 'submitted') byStatus.submitted += 1
    else byStatus.in_progress += 1
  }
  const total = rows.length
  const excluded = byStatus.out_of_scope
  return { total, byStatus, excluded }
}

/** Whole-visit counts for a window, compared with the equal-length window
    immediately before it. Used for the "from last month" lines. */
export function windowTally(rows = [], days = 30, now = new Date()) {
  const DAY = 24 * 60 * 60 * 1000
  const end = now.getTime()
  const start = end - days * DAY
  const prevStart = start - days * DAY
  const inWindow = (r, from, to) => {
    const t = r.inspection_date ? new Date(`${r.inspection_date}T12:00:00`).getTime() : null
    return t != null && t > from && t <= to
  }
  const tally = (rs) => {
    const byStatus = {
      compliant: 0,
      violation: 0,
      non_compliant: 0,
      not_assessed: 0,
      out_of_scope: 0,
      in_progress: 0,
      submitted: 0,
    }
    for (const r of rs) {
      const res = r.ruleResult || r.status
      if (res === 'compliant' || res === 'pass') byStatus.compliant += 1
      else if (res === 'violation' || res === 'non_compliant' || res === 'fail') {
        byStatus.violation += 1
        byStatus.non_compliant += 1
      } else if (res === 'not_assessed' || res === 'needs_review') {
        byStatus.not_assessed += 1
      } else {
        byStatus.out_of_scope += 1
      }
      if (r.inspectionStatus === 'submitted') byStatus.submitted += 1
      else byStatus.in_progress += 1
    }
    return { total: rs.length, byStatus }
  }
  return {
    current: tally(rows.filter((r) => inWindow(r, start, end))),
    previous: tally(rows.filter((r) => inWindow(r, prevStart, start))),
  }
}

/** Group submitted rows into ISO-week buckets ending today, oldest first. */
export function weeklyBuckets(rows = [], weeks = 6, now = new Date()) {
  const buckets = []
  const DAY = 24 * 60 * 60 * 1000
  const endOfToday = new Date(`${isoDay(now)}T12:00:00`).getTime()
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const to = endOfToday - w * 7 * DAY
    const from = to - 7 * DAY
    buckets.push({
      label: weekLabel(new Date(to)),
      from,
      to,
      compliant: 0,
      non_compliant: 0,
      violation: 0,
      not_assessed: 0,
      out_of_scope: 0,
    })
  }
  for (const r of rows) {
    const t = r.inspection_date ? new Date(`${r.inspection_date}T12:00:00`).getTime() : null
    if (t == null) continue
    const b = buckets.find((x) => t > x.from && t <= x.to)
    if (!b) continue
    const res = r.ruleResult || r.status
    if (res === 'compliant' || res === 'pass') b.compliant += 1
    else if (res === 'violation' || res === 'non_compliant' || res === 'fail') {
      b.non_compliant += 1
      b.violation += 1
    } else if (res === 'not_assessed' || res === 'needs_review') {
      b.not_assessed += 1
    } else {
      b.out_of_scope += 1
    }
  }
  return buckets.map(({ label, compliant, non_compliant, not_assessed, out_of_scope }) => ({
    label,
    Compliant: compliant,
    'Non-Compliant': non_compliant,
    Violation: non_compliant,
    'Not Assessed': not_assessed,
    'Out of Scope': out_of_scope,
  }))
}

/** Violation counts grouped by check, descending. */
export function violationsByRule(violationRows = []) {
  const map = new Map()
  for (const v of violationRows) {
    const cur = map.get(v.check_id) ?? { check_id: v.check_id, title: v.title, citation: v.citation, count: 0 }
    cur.count += 1
    map.set(v.check_id, cur)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/** Group submitted rows into monthly buckets, zero-filled for months with no visits. */
export function monthlyBuckets(rows = [], months = 6, now = new Date()) {
  const buckets = []
  const curYear = now.getFullYear()
  const curMonth = now.getMonth()
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(curYear, curMonth - i, 1)
    const label = d.toLocaleDateString('en-IN', { month: 'short' })
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets.push({
      ym,
      label,
      Compliant: 0,
      'Non-Compliant': 0,
      Violation: 0,
      'Not Assessed': 0,
      'Out of Scope': 0,
    })
  }
  for (const r of rows) {
    if (!r.inspection_date) continue
    const ym = String(r.inspection_date).slice(0, 7)
    const b = buckets.find((x) => x.ym === ym)
    if (!b) continue
    const res = r.ruleResult || r.status
    if (res === 'compliant' || res === 'pass') b.Compliant += 1
    else if (res === 'violation' || res === 'non_compliant' || res === 'fail') {
      b['Non-Compliant'] += 1
      b.Violation += 1
    } else if (res === 'not_assessed' || res === 'needs_review') {
      b['Not Assessed'] += 1
    } else {
      b['Out of Scope'] += 1
    }
  }
  return buckets.map(
    ({ label, Compliant, 'Non-Compliant': nc, Violation, 'Not Assessed': na, 'Out of Scope': oos }) => ({
      label,
      Compliant,
      'Non-Compliant': nc,
      Violation: Violation || nc,
      'Not Assessed': na,
      'Out of Scope': oos,
    })
  )
}

/* ----------------------------------------------------------------- format -- */

export function isoDay(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekLabel(date) {
  const end = new Date(date.getTime() - 24 * 60 * 60 * 1000)
  const opts = { day: 'numeric', month: 'short' }
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-IN', opts)}`
}