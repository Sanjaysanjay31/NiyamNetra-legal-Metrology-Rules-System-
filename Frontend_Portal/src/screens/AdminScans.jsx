/**
 * Products / Scans — every package the engine has assessed.
 *
 * Each row is one package scanned during an inspection: the brand, commodity,
 * shop it came from and the verdict. The full evidence and finding rows live
 * on the scan detail page; this list is the index that lets an officer move
 * from "what is the system seeing" to "what was the package".
 *
 * The row data is the same shape the prior version showed, joined from the
 * inspections / stores / users endpoints, then enriched per scan with MRP,
 * net quantity and a flag for whether at least one evidence image is
 * attached. The filter bar keeps the same vocabulary as Inspections so an
 * admin who has just drilled down from there can keep their context.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ChevronRight,
  Eye,
  FileImage,
  Filter,
  MoreVertical,
  Search,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useDocumentTitle, useDebounced, useResource } from '../lib/hooks'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '../ui'

const PAGE_SIZE = 7

const AREA_FALLBACK = []

const RESULT_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'compliant', label: 'Compliant' },
  { value: 'violation', label: 'Violation' },
  { value: 'review', label: 'Review' },
  { value: 'not_assessed', label: 'Not assessed' },
]

const VERDICT_LABEL = {
  compliant: 'Compliant',
  violation: 'Violation',
  not_assessed: 'Review',
  out_of_scope: 'Out of scope',
}

const VERDICT_FAMILY = {
  compliant: 'pass',
  violation: 'violation',
  not_assessed: 'review',
  out_of_scope: 'na',
}

function prettyDateTime(iso) {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'd MMM yyyy · HH:mm')
  } catch {
    return String(iso)
  }
}

function prettyDate(iso) {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'd MMM yyyy')
  } catch {
    return String(iso)
  }
}

function mrpLabel(mrp) {
  if (mrp == null) return '—'
  if (typeof mrp === 'number') {
    return `₹${mrp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }
  if (typeof mrp === 'object') {
    const v = mrp.value ?? mrp.amount
    const cur = mrp.currency ?? 'INR'
    if (v == null) return '—'
    return `${cur === 'INR' ? '₹' : ''}${v}`
  }
  return String(mrp)
}

function netLabel(nq, unit) {
  if (nq == null) return '—'
  if (typeof nq === 'number') return unit ? `${nq} ${unit}` : String(nq)
  if (typeof nq === 'object') {
    const v = nq.value
    const u = nq.unit || unit
    if (v == null) return '—'
    return u ? `${v} ${u}` : String(v)
  }
  return unit ? `${nq} ${unit}` : String(nq)
}

function hasEvidence(scan) {
  if (Array.isArray(scan?.images) && scan.images.length > 0) return true
  if (Array.isArray(scan?.evidence)) return scan.evidence.length > 0
  if (typeof scan?.evidence_count === 'number') return scan.evidence_count > 0
  if (typeof scan?.image_count === 'number') return scan.image_count > 0
  return false
}

function ResultBadge({ verdict }) {
  const family = VERDICT_FAMILY[verdict] ?? 'na'
  const label = VERDICT_LABEL[verdict] ?? '—'
  return <StatusBadge family={family} label={label} />
}

function EvidenceIcon({ scan }) {
  if (!hasEvidence(scan)) {
    return <span className="text-caption text-ink-3">—</span>
  }
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-pill bg-info-fill text-info-text ring-1 ring-inset ring-info-border"
      title="Evidence attached"
      aria-label="Evidence attached"
    >
      <FileImage className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  )
}

export default function AdminScans() {
  useDocumentTitle('Products / Scans')

  const scansRes = useResource(() => endpoints.scans.list(), {
    label: 'scans-list',
  })
  const stores = useResource(() => endpoints.inspections.stores(), {
    label: 'stores',
  })

  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw, 200)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [area, setArea] = useState('all')
  const [result, setResult] = useState('all')
  const [page, setPage] = useState(1)
  const [menuFor, setMenuFor] = useState(null)

  const rawScans = useMemo(() => {
    const list = scansRes.data
    return Array.isArray(list) ? list : (list?.items ?? [])
  }, [scansRes.data])

  const displayRows = useMemo(() => {
    return rawScans.map((s) => ({
      id: s.id,
      inspection_id: s.inspection_id,
      created: s.created_at,
      product: s.brand_name
        ? `${s.brand_name} · ${s.commodity_generic ?? '—'}`
        : s.commodity_generic ?? '—',
      shop: s.store_name ?? '—',
      shopArea: s.store_city ?? null,
      inspector: s.inspector_name ?? '—',
      mrp: s.mrp,
      net: s.net_quantity_value,
      netUnit: s.net_quantity_unit,
      verdict: s.overall_result ?? 'not_assessed',
      evidence: s,
    }))
  }, [rawScans])

  const areas = useMemo(() => {
    const set = new Set(AREA_FALLBACK)
    ;(stores.data ?? []).forEach((s) => {
      if (s.city) set.add(s.city)
      else if (s.district) set.add(s.district)
      else if (s.area) set.add(s.area)
    })
    return Array.from(set).sort()
  }, [stores.data])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return displayRows.filter((r) => {
      const day = r.created ? r.created.slice(0, 10) : null
      if (dateFrom && day && day < dateFrom) return false
      if (dateTo && day && day > dateTo) return false
      if (area !== 'all' && r.shopArea !== area) return false
      if (result !== 'all' && r.verdict !== result) return false
      if (!needle) return true
      return [r.product, r.shop, r.inspector, `Scan #${r.id}`]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    })
  }, [displayRows, q, dateFrom, dateTo, area, result])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const startIdx = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(filtered.length, page * PAGE_SIZE)

  function applyFilters(e) {
    e?.preventDefault?.()
    setPage(1)
  }

  function resetFilters() {
    setQRaw('')
    setDateFrom('')
    setDateTo('')
    setArea('all')
    setResult('all')
    setPage(1)
  }

  return (
    <div className="nn-admin-page mx-auto max-w-[1200px]">
      {/* Breadcrumb + title */}
      <nav className="mb-2 flex items-center gap-1 text-caption text-ink-3" aria-label="Breadcrumb">
        <Link to="/admin" className="hover:text-ink-2">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium text-ink-2">Products / Scans</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">Products / Scans</h1>
          <p className="mt-1 text-small text-ink-2">
            Every package the engine has assessed, with its verdict, the shop it came from and the officer who scanned it.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="mt-5 p-4 sm:p-5">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 items-end gap-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,auto)_180px_180px_auto]"
        >
          <Field label="Search Product / Scan ID">
            {(props) => (
              <Input
                {...props}
                icon={Search}
                value={qRaw}
                onChange={(e) => setQRaw(e.target.value)}
                placeholder="e.g. Tastemaker or 9041"
              />
            )}
          </Field>
          <Field label="Date Range">
            {(props) => (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-[125px]">
                  <input
                    {...props}
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    aria-label="From date"
                    className="nn-input w-full text-[12px]"
                  />
                </div>
                <span className="shrink-0 text-ink-3 font-semibold" aria-hidden="true">–</span>
                <div className="flex-1 min-w-[125px]">
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    aria-label="To date"
                    className="nn-input w-full text-[12px]"
                  />
                </div>
              </div>
            )}
          </Field>
          <Field label="Area">
            {(props) => (
              <select {...props} value={area} onChange={(e) => setArea(e.target.value)} className="nn-select">
                <option value="all">All Areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Result">
            {(props) => (
              <select {...props} value={result} onChange={(e) => setResult(e.target.value)} className="nn-select">
                {RESULT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" icon={Filter}>
              Apply
            </Button>
            <Button type="button" variant="ghost" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </form>
      </Card>

      {/* Table */}
      <Card className="mt-5 p-0">
        <div className="overflow-x-auto">
          <Table
            className="min-w-[1040px]"
            caption={`${filtered.length} scan${filtered.length === 1 ? '' : 's'}.`}
          >
            <thead>
              <tr>
                <Th>Scan ID</Th>
                <Th>Product</Th>
                <Th>Store</Th>
                <Th>Inspector</Th>
                <Th>Date &amp; Time</Th>
                <Th align="right">MRP</Th>
                <Th align="right">Net Quantity</Th>
                <Th>Result</Th>
                <Th>Evidence</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      title="No scans match these filters"
                      body="Adjust the search, area, date range or result to see packages in the list."
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <Tr key={r.id} className="text-small">
                    <Td>
                      <span className="nn-mono text-ink">#{r.id}</span>
                    </Td>
                    <Td>
                      <span className="block font-medium text-ink">{r.product}</span>
                    </Td>
                    <Td>
                      <span className="block text-ink-2">{r.shop}</span>
                      {r.shopArea && (
                        <span className="block text-caption text-ink-3">{r.shopArea}</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-ink-2">{r.inspector}</span>
                    </Td>
                    <Td>
                      <span className="text-ink-2">{prettyDateTime(r.created)}</span>
                    </Td>
                    <Td align="right">
                      <span className="nn-mono tabular-nums text-ink">{mrpLabel(r.mrp)}</span>
                    </Td>
                    <Td align="right">
                      <span className="nn-mono tabular-nums text-ink">{netLabel(r.net, r.netUnit)}</span>
                    </Td>
                    <Td>
                      <ResultBadge verdict={r.verdict} />
                    </Td>
                    <Td>
                      <EvidenceIcon scan={r.evidence} />
                    </Td>
                    <Td align="right">
                      <RowMenu
                        scan={r}
                        open={menuFor === r.id}
                        onOpenChange={(open) => setMenuFor(open ? r.id : null)}
                      />
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        <div className="flex flex-col items-start justify-between gap-2 border-t border-divider px-4 py-3 text-caption text-ink-2 sm:flex-row sm:items-center">
          <p>
            Showing <span className="font-medium text-ink">{startIdx}</span>–
            <span className="font-medium text-ink">{endIdx}</span> of{' '}
            <span className="font-medium text-ink">{filtered.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              disabledReason="You are on the first page."
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-caption text-ink-2 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              disabledReason="You are on the last page."
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

/** Three-dot menu anchored to a button; closes on outside click or Escape. */
function RowMenu({ scan, open, onOpenChange }) {
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onOpenChange(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for scan ${scan.id}`}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-pill text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-40 origin-top-right rounded-card border border-divider bg-surface shadow-card"
        >
          <Link
            to={`/admin/scans/${scan.id}`}
            role="menuitem"
            onClick={() => onOpenChange(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-small text-ink hover:bg-surface-2"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            View
          </Link>
        </div>
      )}
    </div>
  )
}
