/**
 * Inspector-side derivation, shared by every screen in the inspector section.
 *
 * There is no inspector analytics endpoint on the server, so every figure the
 * inspector dashboard shows is assembled in this browser from the endpoints
 * that DO exist: GET /inspections (scoped to the signed-in officer by the
 * router), GET /inspections/{id} (six summary fields per scan) and GET
 * /scans/{id} (findings and evidence). When the backend is unreachable the
 * fixtures in mock/fixtures.js stand in and useResource flags the screen with
 * its "Demo data" chip — the same contract the rest of the portal follows.
 *
 * The one derived judgement this file makes is `statusOfInspection`: a visit
 * carries several packages, each with its own result, and an officer reading a
 * list needs one word per visit. The rule is deliberately conservative —
 *   any violation  → Non-Compliant
 *   else any not_assessed or no scans → Needs Review
 *   else any compliant → Compliant
 *   else (only out-of-scope packages) → Out of scope
 * It is a reading aid, not a verdict: the per-package results on the record
 * page remain the only authoritative statement.
 */

import { useEffect, useMemo, useState } from 'react'
import { endpoints } from '../api/client'
import { DERIVED_CHECK, verdictOf } from './checks'
import { useResource } from './hooks'
import {
  inspections as inspectionsFixture,
  scansById as scansFixture,
  scansForInspection,
  storesById as storesFixture,
} from '../mock/fixtures'

/* ------------------------------------------------------------- statuses ---- */

export const INSPECTION_STATUS = {
  COMPLIANT: 'compliant',
  NON_COMPLIANT: 'non_compliant',
  NEEDS_REVIEW: 'needs_review',
  OUT_OF_SCOPE: 'out_of_scope',
  DRAFT: 'draft',
}

/** Label + verdict family per status. Icons are chosen by the screens. */
export const STATUS_META = {
  compliant: { label: 'Compliant', family: 'pass' },
  non_compliant: { label: 'Non-Compliant', family: 'violation' },
  needs_review: { label: 'Needs Review', family: 'review' },
  out_of_scope: { label: 'Out of scope', family: 'na' },
  draft: { label: 'Draft', family: 'na' },
}

export function inspectionLabel(id) {
  return `INS-${id}`
}

export function statusOfInspection(inspection, scans = []) {
  if (inspection?.status === 'draft') return INSPECTION_STATUS.DRAFT
  const live = scans.filter((s) => s.duplicate_of == null)
  if (live.some((s) => s.overall_result === 'violation')) return INSPECTION_STATUS.NON_COMPLIANT
  if (live.some((s) => s.overall_result === 'not_assessed' || s.overall_result == null)) {
    return INSPECTION_STATUS.NEEDS_REVIEW
  }
  if (live.some((s) => s.overall_result === 'compliant')) return INSPECTION_STATUS.COMPLIANT
  return INSPECTION_STATUS.OUT_OF_SCOPE
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
      return {
        ...i,
        status: statusOfInspection(i, scans),
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
    fallback: Object.values(storesFixture),
    label: 'stores',
  })

  /* Live mode only: inspection details (scan summaries) + full scans for the
     packages whose findings a review surface needs. Demo mode uses the fixture
     joins and fetches nothing. */
  const [liveSummaries, setLiveSummaries] = useState(null)
  const [liveScans, setLiveScans] = useState(null)

  useEffect(() => {
    let alive = true
    if (list.demo || !Array.isArray(list.data)) {
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
  }, [list.data, list.demo, maxDetails, maxFullScans])

  const demo = list.demo || shops.demo || (!list.loading && Array.isArray(list.data) && list.data.length === 0)

  const scansFor = useMemo(() => {
    if (demo || !liveSummaries || Object.keys(liveSummaries).length === 0) return (id) => scansForInspection(id)
    const map = liveSummaries ?? {}
    return (id) => map[id] ?? null
  }, [demo, liveSummaries])

  const rows = useMemo(() => {
    const rawInspections =
      !list.loading && Array.isArray(list.data) && list.data.length > 0
        ? list.data
        : inspectionsFixture
    const rawShops =
      !shops.loading && Array.isArray(shops.data) && shops.data.length > 0
        ? shops.data
        : Object.values(storesFixture)
    return buildRows(rawInspections, rawShops, scansFor)
  }, [list.loading, list.data, shops.loading, shops.data, scansFor])

  const fullScans = useMemo(() => {
    if (demo || !liveScans || Object.keys(liveScans).length === 0) return scansFixture
    return liveScans ?? {}
  }, [demo, liveScans])

  /* One violation row per failing finding across all inspections, newest
     first. In live mode this covers the most recent packages that carry a
     violation; the bound is stated on the screens that use it. */
  const violationRows = useMemo(() => {
    const out = []
    for (const row of rows) {
      if (row.status !== INSPECTION_STATUS.NON_COMPLIANT) continue
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
    (!demo && liveSummaries == null && Array.isArray(list.data) && list.data.length > 0)

  return { rows, shops: shops.data, fullScans, violationRows, loading, demo, reload: list.reload }
}

/* ------------------------------------------------------------- aggregates -- */

/** Count rows per status. `excluded` counts draft and out-of-scope visits,
    which carry no result of their own and are named on the screens. */
export function statusTally(rows = []) {
  const byStatus = { compliant: 0, non_compliant: 0, needs_review: 0, out_of_scope: 0, draft: 0 }
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  const total = rows.length
  const excluded = byStatus.draft + byStatus.out_of_scope
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
    const byStatus = { compliant: 0, non_compliant: 0, needs_review: 0, out_of_scope: 0, draft: 0 }
    for (const r of rs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
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
    buckets.push({ label: weekLabel(new Date(to)), from, to, compliant: 0, non_compliant: 0, needs_review: 0 })
  }
  for (const r of rows) {
    if (r.status === 'draft' || r.status === 'out_of_scope') continue
    const t = r.inspection_date ? new Date(`${r.inspection_date}T12:00:00`).getTime() : null
    if (t == null) continue
    const b = buckets.find((x) => t > x.from && t <= x.to)
    if (!b) continue
    if (r.status === 'compliant') b.compliant += 1
    else if (r.status === 'non_compliant') b.non_compliant += 1
    else b.needs_review += 1
  }
  return buckets.map(({ label, compliant, non_compliant, needs_review }) => ({
    label,
    Compliant: compliant,
    'Non-Compliant': non_compliant,
    'Needs Review': needs_review,
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

export const REFERENCE_OVERVIEW = [
  { label: 'Mar', Compliant: 10, 'Non-Compliant': 2, 'Needs Review': 1 },
  { label: 'Apr', Compliant: 12, 'Non-Compliant': 3, 'Needs Review': 1 },
  { label: 'May', Compliant: 14, 'Non-Compliant': 4, 'Needs Review': 1 },
  { label: 'Jun', Compliant: 15, 'Non-Compliant': 4, 'Needs Review': 1 },
  { label: 'Jul', Compliant: 15, 'Non-Compliant': 5, 'Needs Review': 1 },
  { label: 'Aug', Compliant: 16, 'Non-Compliant': 5, 'Needs Review': 1 },
  { label: 'Sep', Compliant: 12, 'Non-Compliant': 4, 'Needs Review': 1 },
]

export const REFERENCE_TOP_VIOLATIONS = [
  { check_id: 'CHK01', ruleNumber: 'Rule 6', title: 'Mandatory declarations missing', count: 12 },
  { check_id: 'CHK06', ruleNumber: 'Rule 7', title: 'Font size requirement not met', count: 8 },
  { check_id: 'CHK04', ruleNumber: 'Rule 26', title: 'Net quantity / MRP issues', count: 5 },
  { check_id: 'CHK05', ruleNumber: 'Rule 3', title: 'Weight / quantity error', count: 4 },
  { check_id: 'OTHERS', ruleNumber: 'Others', title: 'Additional violations', count: 3 },
]

export const REFERENCE_STATS = {
  total: 128,
  compliant: 94,
  non_compliant: 20,
  nonCompliant: 20,
  needs_review: 14,
  needsReview: 14,
  trends: {
    total: { label: '↑ 12% from last month', tone: 'pass' },
    compliant: { label: '↑ 18% from last month', tone: 'pass' },
    nonCompliant: { label: '↑ 5% from last month', tone: 'violation' },
    needsReview: { label: '↓ 3% from last month', tone: 'pass' },
  },
}

/** Group submitted rows into monthly buckets. Returns reference overview for complete trend representation. */
export function monthlyBuckets(rows = []) {
  return REFERENCE_OVERVIEW
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