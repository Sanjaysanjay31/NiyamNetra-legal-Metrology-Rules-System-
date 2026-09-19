/**
 * Stores — Legal Metrology Enforcement Portal.
 *
 * Route: /admin/stores
 * Page Purpose:
 * Allow administrators to view registered stores, their inspection activity,
 * compliance status, and violation history.
 *
 * Features:
 * - Header with Title "Stores", Subtitle "Manage registered stores and their inspection activity.", Export button & CSV dropdown
 * - 4 Compact KPI cards: Total Stores (42), Inspected This Month (18), Compliant Stores (27), Stores With Violations (15)
 * - Filter row: Search ("Search store name, ID..."), Area (All Areas), Compliance (All Results), Last Inspection (Any Date), Apply & Clear buttons
 * - Main 8-column Table: Store ID, Store, Area, Last Inspection, Inspections, Result, Violations, Action ("View →")
 * - Navigation: "View →" navigates to /admin/stores/:storeId
 * - Result Badges: Compliant (green), Violation (red), Needs Review (amber), Not Inspected (neutral)
 * - Pagination: "Showing 1–10 of 42 stores", Previous, 1, 2, 3, 4, Next
 * - Empty state: "No stores found", "Try changing your search or filters."
 * - Loading state: Clean skeleton loading for cards and table.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Minus,
  Search,
  XCircle,
} from 'lucide-react'
import { useDocumentTitle, useResource } from '../lib/hooks'
import { STORE_KPIS, STORE_RECORDS } from '../mock/storesData'
import { endpoints, saveBlob } from '../api/client'
import {
  Button,
  Card,
  cx,
  Field,
  Input,
  Select,
  useToast,
} from '../ui'

const PAGE_SIZE = 10

/* ------------------------------------------------------------- KPI Card -- */

function SummaryCard({ label, value, accent = 'navy', loading = false }) {
  const accentBar = {
    navy: 'bg-navy',
    pass: 'bg-pass-graphic',
    violation: 'bg-violation-graphic',
    review: 'bg-review-graphic',
  }[accent]

  return (
    <Card className="flex items-stretch overflow-hidden p-0">
      <span className={cx('w-1 shrink-0', accentBar)} aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-0.5 px-4 py-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
          {label}
        </span>
        {loading ? (
          <div className="nn-skeleton mt-1 h-6 w-12 rounded" />
        ) : (
          <span className="nn-mono text-[22px] font-semibold leading-none text-ink">
            {value}
          </span>
        )}
      </div>
    </Card>
  )
}

/* --------------------------------------------------------- Breadcrumb -- */

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-ink-3">
      <Link
        to="/admin"
        className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
      >
        Home
      </Link>
      <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
      <span className="font-semibold text-ink">Stores</span>
    </nav>
  )
}

/* ------------------------------------------------------- Result Badges -- */

function StoreResultBadge({ result }) {
  const norm = String(result ?? '').trim().toLowerCase()

  if (norm === 'pass' || norm === 'compliant' || norm === 'success') {
    return (
      <span className="nn-badge border border-pass-border bg-pass-fill text-pass-text">
        <CheckCircle size={13} strokeWidth={2} aria-hidden="true" />
        {norm === 'pass' ? 'Pass' : 'Compliant'}
      </span>
    )
  }

  if (norm === 'violation' || norm === 'fail') {
    return (
      <span className="nn-badge border border-violation-border bg-violation-fill text-violation-text">
        <XCircle size={13} strokeWidth={2} aria-hidden="true" />
        Violation
      </span>
    )
  }

  if (norm === 'needs review' || norm === 'review') {
    return (
      <span className="nn-badge border border-review-border bg-review-fill text-review-text">
        <Clock size={13} strokeWidth={2} aria-hidden="true" />
        Needs Review
      </span>
    )
  }

  return (
    <span className="nn-badge border border-divider bg-surface-2 text-ink-3">
      <Minus size={13} strokeWidth={2} aria-hidden="true" />
      Not Inspected
    </span>
  )
}

/* --------------------------------------------------------- Export Menu -- */

function toCsv(header, rows) {
  const escape = (val) => {
    const s = String(val ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n')
}

function ExportMenu({ rows = STORE_RECORDS }) {
  const [format, setFormat] = useState('csv')
  const [busy, setBusy] = useState(false)
  const { push: toast } = useToast()
  const today = '2026-09-02'

  async function handleExport() {
    setBusy(true)
    try {
      const targetRows = rows.length > 0 ? rows : STORE_RECORDS

      if (format === 'csv') {
        const header = [
          'Store ID',
          'Store',
          'Area',
          'Last Inspection',
          'Inspections',
          'Result',
          'Violations',
        ]
        const dataRows = targetRows.map((s) => [
          s.id,
          s.name,
          s.area,
          s.lastInspection || '—',
          s.inspections,
          s.result,
          s.violations,
        ])
        const csv = toCsv(header, dataRows)
        saveBlob(
          new Blob([csv], { type: 'text/csv;charset=utf-8' }),
          `niyamnetra-stores-${today}.csv`
        )
        toast({
          family: 'pass',
          title: 'CSV exported',
          body: `Exported ${targetRows.length} stores to CSV.`,
        })
      } else if (format === 'word') {
        const htmlDoc = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>NiyamNetra Stores Report</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #111827; margin: 24px; }
    h1 { color: #0f2a44; font-size: 18pt; margin-bottom: 4px; }
    p.meta { color: #52637a; font-size: 10pt; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; font-size: 10pt; }
    th, td { border: 1px solid #d8e1ec; padding: 8px 10px; text-align: left; }
    th { background-color: #0f2a44; color: #ffffff; font-weight: bold; }
    tr:nth-child(even) { background-color: #f8fafc; }
  </style>
</head>
<body>
  <h1>NiyamNetra — Stores Compliance Register</h1>
  <p class="meta">Export Date: ${today} · Total Records: ${targetRows.length}</p>
  <table>
    <thead>
      <tr>
        <th>Store ID</th>
        <th>Store</th>
        <th>Area</th>
        <th>Last Inspection</th>
        <th style="text-align: right;">Inspections</th>
        <th>Result</th>
        <th style="text-align: right;">Violations</th>
      </tr>
    </thead>
    <tbody>
      ${targetRows
        .map(
          (s) => `
        <tr>
          <td><strong>${s.id}</strong></td>
          <td>${s.name}</td>
          <td>${s.area}</td>
          <td>${s.lastInspection || '—'}</td>
          <td style="text-align: right;">${s.inspections}</td>
          <td>${s.result}</td>
          <td style="text-align: right;">${s.violations}</td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`
        saveBlob(
          new Blob([htmlDoc], { type: 'application/msword;charset=utf-8' }),
          `niyamnetra-stores-${today}.doc`
        )
        toast({
          family: 'pass',
          title: 'Word document exported',
          body: `Exported ${targetRows.length} stores to Word.`,
        })
      } else if (format === 'pdf') {
        const printWin = window.open('', '_blank')
        if (printWin) {
          printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>NiyamNetra Stores Report - ${today}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 28px; color: #0d1f33; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px 0; color: #0f2a44; }
    p { font-size: 12px; color: #52637a; margin: 0 0 16px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d8e1ec; padding: 8px 12px; text-align: left; }
    th { background-color: #f1f5f9; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
    tr:nth-child(even) { background-color: #fbfcfe; }
  </style>
</head>
<body>
  <h1>NiyamNetra — Stores Register</h1>
  <p>Export Date: ${today} · Total Records: ${targetRows.length}</p>
  <table>
    <thead>
      <tr>
        <th>Store ID</th>
        <th>Store</th>
        <th>Area</th>
        <th>Last Inspection</th>
        <th>Inspections</th>
        <th>Result</th>
        <th>Violations</th>
      </tr>
    </thead>
    <tbody>
      ${targetRows
        .map(
          (s) => `
        <tr>
          <td><strong>${s.id}</strong></td>
          <td>${s.name}</td>
          <td>${s.area}</td>
          <td>${s.lastInspection || '—'}</td>
          <td>${s.inspections}</td>
          <td>${s.result}</td>
          <td>${s.violations}</td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`)
          printWin.document.close()
        }
        toast({
          family: 'pass',
          title: 'PDF ready',
          body: `Prepared print preview for ${targetRows.length} stores.`,
        })
      }
    } catch (err) {
      toast({
        family: 'violation',
        title: 'Export failed',
        body: err?.message ?? 'An error occurred during export.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        icon={Download}
        loading={busy}
        onClick={handleExport}
        className="min-w-[130px] justify-center px-4 font-semibold"
      >
        Export
      </Button>
      <div className="w-28 sm:w-32">
        <Select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          aria-label="Select export format"
          className="cursor-pointer text-small font-medium"
        >
          <option value="csv">CSV</option>
          <option value="word">Word</option>
          <option value="pdf">PDF</option>
        </Select>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- Cells -- */

function ThC({ children, align = 'left', className }) {
  return (
    <th
      className={cx(
        'border-b border-divider bg-surface-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </th>
  )
}

function TdC({ children, align = 'left', className }) {
  return (
    <td
      className={cx(
        'border-b border-divider px-4 py-3 align-middle text-[12px]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  )
}

/* ------------------------------------------------------- Main Screen -- */

export default function AdminStores() {
  useDocumentTitle('Stores')

  const storesResource = useResource(() => endpoints.inspections.stores(), {
    fallback: null,
    label: 'admin-stores',
  })

  // Loading state
  const loading = storesResource.loading

  // Unified store records from backend or fallback fixture
  const allRecords = useMemo(() => {
    if (Array.isArray(storesResource.data) && storesResource.data.length > 0) {
      return storesResource.data.map((s) => {
        const matchingMock = STORE_RECORDS.find(
          (m) => m.id === `ST-${String(s.id).padStart(3, '0')}` || m.name === s.name
        )
        return {
          id: `ST-${String(s.id).padStart(3, '0')}`,
          rawId: s.id,
          name: s.name,
          type: s.store_type || matchingMock?.type || 'Retail Kirana',
          address: s.address || matchingMock?.address || 'Main Road',
          area: s.city || s.district || matchingMock?.area || 'Hyderabad',
          inspections: matchingMock?.inspections || 1,
          result: matchingMock?.result || 'Compliant',
          violations: matchingMock?.violations || 0,
          lastInspection: matchingMock?.lastInspection || 'Recent',
          rawDate: matchingMock?.rawDate || '2026-09-02',
        }
      })
    }
    return STORE_RECORDS
  }, [storesResource.data])

  const kpis = useMemo(() => {
    if (Array.isArray(storesResource.data) && storesResource.data.length > 0) {
      return {
        total: allRecords.length,
        inspectedThisMonth: allRecords.filter((s) => s.inspections > 0).length,
        compliant: allRecords.filter((s) => String(s.result).toLowerCase() === 'compliant').length,
        violations: allRecords.filter((s) => s.violations > 0).length,
      }
    }
    return STORE_KPIS
  }, [storesResource.data, allRecords])

  // Draft filter inputs
  const [qInput, setQInput] = useState('')
  const [areaInput, setAreaInput] = useState('all')
  const [complianceInput, setComplianceInput] = useState('all')
  const [dateInput, setDateInput] = useState('all')

  // Applied filters (updated on "Apply" or "Clear")
  const [filters, setFilters] = useState({
    q: '',
    area: 'all',
    compliance: 'all',
    date: 'all',
  })

  // Pagination state (1-indexed)
  const [page, setPage] = useState(1)

  // Extract unique areas from records
  const areaOptions = useMemo(() => {
    const set = new Set()
    allRecords.forEach((s) => {
      if (s.area) set.add(s.area)
    })
    return Array.from(set).sort()
  }, [allRecords])

  // Filtered store records
  const filteredStores = useMemo(() => {
    const needle = filters.q.trim().toLowerCase()

    return allRecords.filter((s) => {
      // Area filter
      if (filters.area !== 'all' && s.area !== filters.area) {
        return false
      }

      // Compliance filter
      if (filters.compliance !== 'all') {
        const normResult = String(s.result ?? '').toLowerCase()
        if (filters.compliance === 'compliant' && !(normResult === 'compliant' || normResult === 'pass')) {
          return false
        }
        if (filters.compliance === 'violation' && normResult !== 'violation') {
          return false
        }
        if (filters.compliance === 'review' && !(normResult === 'needs review' || normResult === 'review')) {
          return false
        }
        if (filters.compliance === 'not_inspected' && normResult !== 'not inspected') {
          return false
        }
      }

      // Last Inspection filter
      if (filters.date !== 'all') {
        if (filters.date === 'today' && s.rawDate !== '2026-09-02') {
          return false
        }
        if (filters.date === 'month' && !String(s.rawDate).startsWith('2026-09')) {
          return false
        }
        if (filters.date === 'past30' && !String(s.rawDate).startsWith('2026-08') && !String(s.rawDate).startsWith('2026-09')) {
          return false
        }
        if (filters.date === 'not_inspected' && s.inspections > 0) {
          return false
        }
      }

      // Search query (Store name, ID, Area, Owner)
      if (needle) {
        const matchesName = s.name.toLowerCase().includes(needle)
        const matchesId = s.id.toLowerCase().includes(needle)
        const matchesArea = (s.area || '').toLowerCase().includes(needle)
        const matchesOwner = (s.owner || '').toLowerCase().includes(needle)
        if (!matchesName && !matchesId && !matchesArea && !matchesOwner) {
          return false
        }
      }

      return true
    })
  }, [filters])

  // Pagination calculations
  const totalStores = filteredStores.length
  const totalPages = Math.max(1, Math.ceil(totalStores / PAGE_SIZE))
  const currentPage = Math.min(Math.max(1, page), totalPages)

  const startIdx = totalStores === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(totalStores, currentPage * PAGE_SIZE)

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredStores.slice(start, start + PAGE_SIZE)
  }, [filteredStores, currentPage])

  // Filter actions
  function handleApplyFilters(e) {
    e?.preventDefault?.()
    setFilters({
      q: qInput,
      area: areaInput,
      compliance: complianceInput,
      date: dateInput,
    })
    setPage(1)
  }

  function handleClearFilters() {
    setQInput('')
    setAreaInput('all')
    setComplianceInput('all')
    setDateInput('all')
    setFilters({
      q: '',
      area: 'all',
      compliance: 'all',
      date: 'all',
    })
    setPage(1)
  }

  // Pager buttons array (e.g. 1, 2, 3, 4, 5)
  const pageNumbers = useMemo(() => {
    const pages = []
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i)
    }
    return pages
  }, [totalPages])

  return (
    <div className="nn-admin-page nn-admin-list-page nn-stores-page flex flex-col gap-5">
      {/* ---- Page header ---- */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Breadcrumb />
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Stores</h1>
          <p className="text-[13px] text-ink-2">
            Manage registered stores and their inspection activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu rows={filteredStores} />
        </div>
      </header>

      {/* ---- 4 compact KPI cards ---- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Total Stores"
          value={kpis.total}
          accent="navy"
          loading={loading}
        />
        <SummaryCard
          label="Inspected This Month"
          value={kpis.inspectedThisMonth}
          accent="navy"
          loading={loading}
        />
        <SummaryCard
          label="Compliant Stores"
          value={kpis.compliant}
          accent="pass"
          loading={loading}
        />
        <SummaryCard
          label="Stores With Violations"
          value={kpis.violations}
          accent="violation"
          loading={loading}
        />
      </section>

      {/* ---- Filter bar ---- */}
      <Card className="p-4">
        <form
          onSubmit={handleApplyFilters}
          className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_180px_180px_180px_auto]"
        >
          {/* Search */}
          <Field label="Search">
            {(props) => (
              <div className="relative">
                <Search
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"
                />
                <Input
                  {...props}
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Search store name, ID..."
                  className="pl-8"
                />
              </div>
            )}
          </Field>

          {/* Area */}
          <Field label="Area">
            {(props) => (
              <Select
                {...props}
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
              >
                <option value="all">All Areas</option>
                {areaOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* Compliance */}
          <Field label="Compliance">
            {(props) => (
              <Select
                {...props}
                value={complianceInput}
                onChange={(e) => setComplianceInput(e.target.value)}
              >
                <option value="all">All Results</option>
                <option value="compliant">Compliant</option>
                <option value="violation">Violation</option>
                <option value="review">Needs Review</option>
                <option value="not_inspected">Not Inspected</option>
              </Select>
            )}
          </Field>

          {/* Last Inspection */}
          <Field label="Last Inspection">
            {(props) => (
              <Select
                {...props}
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
              >
                <option value="all">Any Date</option>
                <option value="today">Today (02 Sep 2026)</option>
                <option value="month">This Month (Sep 2026)</option>
                <option value="past30">Past 30 Days</option>
                <option value="not_inspected">Never Inspected</option>
              </Select>
            )}
          </Field>

          {/* Buttons: Apply & Clear */}
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary">
              Apply
            </Button>
            <Button type="button" variant="ghost" onClick={handleClearFilters}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {/* ---- Main Result Table ---- */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <ThC>Store ID</ThC>
                <ThC>Store</ThC>
                <ThC>Area</ThC>
                <ThC>Last Inspection</ThC>
                <ThC align="right">Inspections</ThC>
                <ThC>Result</ThC>
                <ThC align="right">Violations</ThC>
                <ThC align="right">Action</ThC>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Skeleton loading state
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <TdC><div className="nn-skeleton h-4 w-16" /></TdC>
                    <TdC><div className="nn-skeleton h-4 w-36" /></TdC>
                    <TdC><div className="nn-skeleton h-4 w-24" /></TdC>
                    <TdC><div className="nn-skeleton h-4 w-24" /></TdC>
                    <TdC align="right"><div className="nn-skeleton ml-auto h-4 w-8" /></TdC>
                    <TdC><div className="nn-skeleton h-5 w-20 rounded" /></TdC>
                    <TdC align="right"><div className="nn-skeleton ml-auto h-4 w-8" /></TdC>
                    <TdC align="right"><div className="nn-skeleton ml-auto h-4 w-12" /></TdC>
                  </tr>
                ))
              ) : pagedRows.length === 0 ? (
                // Empty state
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <p className="text-[14px] font-semibold text-ink">No stores found</p>
                      <p className="text-[12px] text-ink-3">Try changing your search or filters.</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearFilters}
                        className="mt-2 text-[12px]"
                      >
                        Reset filters
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                // Table rows
                pagedRows.map((s) => (
                  <tr
                    key={s.id}
                    className="transition-colors duration-fast ease-settle hover:bg-surface-2"
                  >
                    <TdC>
                      <span className="nn-mono font-semibold text-ink">{s.id}</span>
                    </TdC>
                    <TdC>
                      <span className="font-medium text-ink">{s.name}</span>
                    </TdC>
                    <TdC>
                      <span className="text-ink-2">{s.area}</span>
                    </TdC>
                    <TdC>
                      <span className="text-ink-2">{s.lastInspection || '—'}</span>
                    </TdC>
                    <TdC align="right">
                      <span className="nn-mono font-semibold text-ink">{s.inspections}</span>
                    </TdC>
                    <TdC>
                      <StoreResultBadge result={s.result} />
                    </TdC>
                    <TdC align="right">
                      <span
                        className={cx(
                          'nn-mono font-semibold',
                          s.violations > 0 ? 'text-violation-text font-bold' : 'text-ink-3'
                        )}
                      >
                        {s.violations}
                      </span>
                    </TdC>
                    <TdC align="right">
                      <Link
                        to={`/admin/stores/${s.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
                        aria-label={`View store ${s.name}`}
                      >
                        View <span aria-hidden="true">→</span>
                      </Link>
                    </TdC>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ---- Bottom Pagination ---- */}
        <nav
          aria-label="Stores pagination"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-4 py-3"
        >
          <p className="text-[11px] text-ink-3">
            Showing{' '}
            <span className="nn-mono font-semibold text-ink">{startIdx}</span>–
            <span className="nn-mono font-semibold text-ink">{endIdx}</span> of{' '}
            <span className="nn-mono font-semibold text-ink">{totalStores}</span> stores
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="grid h-7 min-w-[64px] place-items-center rounded-sm px-2 text-[12px] font-medium text-ink-2 transition-colors duration-fast ease-settle hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
              <span className="ml-1">Previous</span>
            </button>

            {pageNumbers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === currentPage ? 'page' : undefined}
                className={cx(
                  'grid h-7 min-w-[28px] place-items-center rounded-sm px-1.5 text-[12px] font-medium transition-colors duration-fast ease-settle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45',
                  p === currentPage
                    ? 'bg-accent font-bold text-ink-inverse'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                )}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="grid h-7 min-w-[58px] place-items-center rounded-sm px-2 text-[12px] font-medium text-ink-2 transition-colors duration-fast ease-settle hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:opacity-40"
              aria-label="Next page"
            >
              <span className="mr-1">Next</span>
              <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </nav>
      </Card>
    </div>
  )
}
