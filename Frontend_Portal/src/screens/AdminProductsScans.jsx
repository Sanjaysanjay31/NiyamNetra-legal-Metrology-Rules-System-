/**
 * Products / Scans — Legal Metrology Enforcement Portal.
 *
 * Route: /admin/products-scans
 * Purpose:
 * Allow administrators to review individual products that were scanned during
 * inspections and quickly understand their OCR status, compliance result, and number of findings.
 *
 * Information Hierarchy:
 * Inspection → Product Scan → Captured Evidence → OCR Extraction → 19 Rule Checks → Finding / Result → Audit Integrity
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Minus,
  Package,
  Search,
  XCircle,
} from 'lucide-react'
import { saveBlob } from '../api/client'
import { useDocumentTitle } from '../lib/hooks'
import { SCAN_KPIS, SCAN_RECORDS } from '../mock/productsScansData'
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

/* ----------------------------------------------------------- Summary Card -- */

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

/* ------------------------------------------------------------- Breadcrumb -- */

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
      <span className="font-semibold text-ink">Products / Scans</span>
    </nav>
  )
}

/* ---------------------------------------------------------- Status Badges -- */

function ResultBadge({ result }) {
  const norm = String(result ?? '').trim().toLowerCase()

  if (norm === 'pass' || norm === 'compliant') {
    return (
      <span className="nn-badge border border-pass-border bg-pass-fill text-pass-text">
        <CheckCircle size={13} strokeWidth={2} aria-hidden="true" />
        Pass
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

  if (norm === 'review' || norm === 'needs review') {
    return (
      <span className="nn-badge border border-review-border bg-review-fill text-review-text">
        <Clock size={13} strokeWidth={2} aria-hidden="true" />
        Review
      </span>
    )
  }

  return (
    <span className="nn-badge border border-divider bg-surface-2 text-ink-3">
      <Minus size={13} strokeWidth={2} aria-hidden="true" />
      Not Assessed
    </span>
  )
}

function OcrBadge({ status }) {
  const norm = String(status ?? '').trim().toLowerCase()

  if (norm === 'processed') {
    return (
      <span className="nn-badge border border-pass-border bg-pass-fill text-pass-text">
        <CheckCircle size={13} strokeWidth={2} aria-hidden="true" />
        Processed
      </span>
    )
  }

  if (norm === 'failed') {
    return (
      <span className="nn-badge border border-violation-border bg-violation-fill text-violation-text">
        <XCircle size={13} strokeWidth={2} aria-hidden="true" />
        Failed
      </span>
    )
  }

  return (
    <span className="nn-badge border border-review-border bg-review-fill text-review-text">
      <Clock size={13} strokeWidth={2} aria-hidden="true" />
      Pending
    </span>
  )
}

/* ------------------------------------------------------------ Export Menu -- */

function toCsv(header, rows) {
  const escape = (val) => {
    const s = String(val ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n')
}

function ExportMenu({ rows = SCAN_RECORDS }) {
  const [format, setFormat] = useState('csv')
  const [busy, setBusy] = useState(false)
  const { push: toast } = useToast()
  const today = '2026-09-02'

  async function handleExport() {
    setBusy(true)
    try {
      const targetRows = rows.length > 0 ? rows : SCAN_RECORDS

      if (format === 'csv') {
        const header = [
          'Scan ID',
          'Product',
          'Store',
          'Inspection',
          'OCR Status',
          'Result',
          'Findings',
          'Date',
        ]
        const dataRows = targetRows.map((s) => [
          s.id,
          s.product,
          s.store,
          s.inspection,
          s.ocrStatus,
          s.result,
          s.findings,
          s.date,
        ])
        const csv = toCsv(header, dataRows)
        saveBlob(
          new Blob([csv], { type: 'text/csv;charset=utf-8' }),
          `niyamnetra-scans-${today}.csv`
        )
        toast({
          family: 'pass',
          title: 'CSV exported',
          body: `Exported ${targetRows.length} scans to CSV.`,
        })
      } else if (format === 'word') {
        const htmlDoc = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>NiyamNetra Products / Scans Report</title>
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
  <h1>NiyamNetra — Products / Scans Register</h1>
  <p class="meta">Export Date: ${today} · Total Records: ${targetRows.length}</p>
  <table>
    <thead>
      <tr>
        <th>Scan ID</th>
        <th>Product</th>
        <th>Store</th>
        <th>Inspection</th>
        <th>OCR</th>
        <th>Result</th>
        <th style="text-align: right;">Findings</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      ${targetRows
        .map(
          (s) => `
        <tr>
          <td><strong>${s.id}</strong></td>
          <td>${s.product}</td>
          <td>${s.store}</td>
          <td>${s.inspection}</td>
          <td>${s.ocrStatus}</td>
          <td>${s.result}</td>
          <td style="text-align: right;">${s.findings}</td>
          <td>${s.date}</td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`
        saveBlob(
          new Blob([htmlDoc], { type: 'application/msword;charset=utf-8' }),
          `niyamnetra-scans-${today}.doc`
        )
        toast({
          family: 'pass',
          title: 'Word document exported',
          body: `Exported ${targetRows.length} scans to Word.`,
        })
      } else if (format === 'pdf') {
        const printWin = window.open('', '_blank')
        if (printWin) {
          printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>NiyamNetra Scans Report - ${today}</title>
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
  <h1>NiyamNetra — Products / Scans Audit Summary</h1>
  <p>Export Date: ${today} · Total Records: ${targetRows.length}</p>
  <table>
    <thead>
      <tr>
        <th>Scan ID</th>
        <th>Product</th>
        <th>Store</th>
        <th>Inspection</th>
        <th>OCR</th>
        <th>Result</th>
        <th>Findings</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      ${targetRows
        .map(
          (s) => `
        <tr>
          <td><strong>${s.id}</strong></td>
          <td>${s.product}</td>
          <td>${s.store}</td>
          <td>${s.inspection}</td>
          <td>${s.ocrStatus}</td>
          <td>${s.result}</td>
          <td>${s.findings}</td>
          <td>${s.date}</td>
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
          body: `Prepared print preview for ${targetRows.length} scans.`,
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

export default function AdminProductsScans() {
  useDocumentTitle('Products / Scans')

  const [loading] = useState(false)

  // Draft filter values
  const [qInput, setQInput] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [areaInput, setAreaInput] = useState('all')
  const [resultInput, setResultInput] = useState('all')
  const [ocrInput, setOcrInput] = useState('all')

  // Applied filters
  const [filters, setFilters] = useState({
    q: '',
    date: '',
    area: 'all',
    result: 'all',
    ocr: 'all',
  })

  // Pagination state (1-indexed)
  const [page, setPage] = useState(1)

  // Unique areas
  const areaOptions = useMemo(() => {
    const set = new Set()
    SCAN_RECORDS.forEach((s) => {
      if (s.area) set.add(s.area)
    })
    return Array.from(set).sort()
  }, [])

  // Filtered scans
  const filteredScans = useMemo(() => {
    const needle = filters.q.trim().toLowerCase()

    return SCAN_RECORDS.filter((s) => {
      // Date filter
      if (filters.date && s.rawDate !== filters.date) {
        return false
      }

      // Area filter
      if (filters.area !== 'all' && s.area !== filters.area) {
        return false
      }

      // Result filter
      if (filters.result !== 'all') {
        const normResult = s.result.toLowerCase()
        if (filters.result === 'pass' && normResult !== 'pass' && normResult !== 'compliant') {
          return false
        }
        if (filters.result === 'violation' && normResult !== 'violation') {
          return false
        }
        if (filters.result === 'review' && normResult !== 'review' && normResult !== 'needs review') {
          return false
        }
        if (filters.result === 'not_assessed' && normResult !== 'not assessed') {
          return false
        }
      }

      // OCR Status filter
      if (filters.ocr !== 'all') {
        const normOcr = s.ocrStatus.toLowerCase()
        if (filters.ocr === 'processed' && normOcr !== 'processed') {
          return false
        }
        if (filters.ocr === 'failed' && normOcr !== 'failed') {
          return false
        }
        if (filters.ocr === 'pending' && normOcr !== 'pending' && normOcr !== 'review') {
          return false
        }
      }

      // Search query (Product, Scan ID, Store, Inspection)
      if (needle) {
        const matchProduct = s.product.toLowerCase().includes(needle)
        const matchId = s.id.toLowerCase().includes(needle)
        const matchStore = s.store.toLowerCase().includes(needle)
        const matchInsp = s.inspection.toLowerCase().includes(needle)
        if (!matchProduct && !matchId && !matchStore && !matchInsp) {
          return false
        }
      }

      return true
    })
  }, [filters])

  // Pagination calculations
  const totalScans = filteredScans.length
  const totalPages = Math.max(1, Math.ceil(totalScans / PAGE_SIZE))
  const currentPage = Math.min(Math.max(1, page), totalPages)

  const startIdx = totalScans === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(totalScans, currentPage * PAGE_SIZE)

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredScans.slice(start, start + PAGE_SIZE)
  }, [filteredScans, currentPage])

  // Filter actions
  function handleApplyFilters(e) {
    e?.preventDefault?.()
    setFilters({
      q: qInput,
      date: dateInput,
      area: areaInput,
      result: resultInput,
      ocr: ocrInput,
    })
    setPage(1)
  }

  function handleClearFilters() {
    setQInput('')
    setDateInput('')
    setAreaInput('all')
    setResultInput('all')
    setOcrInput('all')
    setFilters({
      q: '',
      date: '',
      area: 'all',
      result: 'all',
      ocr: 'all',
    })
    setPage(1)
  }

  const pageNumbers = useMemo(() => {
    const pages = []
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i)
    }
    return pages
  }, [totalPages])

  return (
    <div className="nn-admin-page nn-admin-list-page nn-products-scans-page flex flex-col gap-5">
      {/* ---- Page header ---- */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Breadcrumb />
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Products / Scans</h1>
          <p className="text-[13px] text-ink-2">
            Review scanned products, extracted information, and compliance results.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu rows={filteredScans} />
        </div>
      </header>

      {/* ---- 4 compact KPI cards ---- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Total Scans"
          value={SCAN_KPIS.total}
          accent="navy"
          loading={loading}
        />
        <SummaryCard
          label="Passed"
          value={SCAN_KPIS.passed}
          accent="pass"
          loading={loading}
        />
        <SummaryCard
          label="Violations"
          value={SCAN_KPIS.violations}
          accent="violation"
          loading={loading}
        />
        <SummaryCard
          label="Needs Review"
          value={SCAN_KPIS.needsReview}
          accent="review"
          loading={loading}
        />
      </section>

      {/* ---- Filter bar ---- */}
      <Card className="p-4">
        <form
          onSubmit={handleApplyFilters}
          className="grid grid-cols-1 items-end gap-3 md:grid-cols-3 lg:grid-cols-[minmax(0,1.4fr)_150px_150px_160px_160px_auto]"
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
                  placeholder="Search product, scan ID, store..."
                  className="pl-8"
                />
              </div>
            )}
          </Field>

          {/* Date */}
          <Field label="Date">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                max="2026-12-31"
              />
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

          {/* Result */}
          <Field label="Result">
            {(props) => (
              <Select
                {...props}
                value={resultInput}
                onChange={(e) => setResultInput(e.target.value)}
              >
                <option value="all">All Results</option>
                <option value="pass">Pass / Compliant</option>
                <option value="violation">Violation</option>
                <option value="review">Needs Review</option>
                <option value="not_assessed">Not Assessed</option>
              </Select>
            )}
          </Field>

          {/* OCR Status */}
          <Field label="OCR Status">
            {(props) => (
              <Select
                {...props}
                value={ocrInput}
                onChange={(e) => setOcrInput(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="processed">Processed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </Select>
            )}
          </Field>

          {/* Actions */}
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
        <div className="border-b border-divider px-4 py-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Products / Scans</h2>
          <span className="text-[12px] text-ink-3">
            {totalScans} scanned package{totalScans === 1 ? '' : 's'} on record
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <ThC>Scan ID</ThC>
                <ThC>Product</ThC>
                <ThC>Store</ThC>
                <ThC>Inspection</ThC>
                <ThC>OCR</ThC>
                <ThC>Result</ThC>
                <ThC align="right">Findings</ThC>
                <ThC>Date</ThC>
                <ThC align="right">Action</ThC>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <TdC><div className="nn-skeleton h-4 w-16" /></TdC>
                    <TdC><div className="nn-skeleton h-4 w-36" /></TdC>
                    <TdC><div className="nn-skeleton h-4 w-28" /></TdC>
                    <TdC><div className="nn-skeleton h-4 w-20" /></TdC>
                    <TdC><div className="nn-skeleton h-5 w-20 rounded" /></TdC>
                    <TdC><div className="nn-skeleton h-5 w-20 rounded" /></TdC>
                    <TdC align="right"><div className="nn-skeleton ml-auto h-4 w-6" /></TdC>
                    <TdC><div className="nn-skeleton h-4 w-24" /></TdC>
                    <TdC align="right"><div className="nn-skeleton ml-auto h-4 w-12" /></TdC>
                  </tr>
                ))
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <p className="text-[14px] font-semibold text-ink">No scans found</p>
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
                pagedRows.map((s) => (
                  <tr
                    key={s.id}
                    className="transition-colors duration-fast ease-settle hover:bg-surface-2"
                  >
                    <TdC>
                      <span className="nn-mono font-semibold text-ink">{s.id}</span>
                    </TdC>
                    <TdC>
                      <span className="font-medium text-ink">{s.product}</span>
                    </TdC>
                    <TdC>
                      <span className="text-ink-2">{s.store}</span>
                    </TdC>
                    <TdC>
                      <span className="nn-mono font-medium text-ink-2">{s.inspection}</span>
                    </TdC>
                    <TdC>
                      <OcrBadge status={s.ocrStatus} />
                    </TdC>
                    <TdC>
                      <ResultBadge result={s.result} />
                    </TdC>
                    <TdC align="right">
                      <span
                        className={cx(
                          'nn-mono font-semibold',
                          s.findings > 0 ? 'font-bold text-violation-text' : 'text-ink-3'
                        )}
                      >
                        {s.findings}
                      </span>
                    </TdC>
                    <TdC>
                      <span className="text-ink-2">{s.date}</span>
                    </TdC>
                    <TdC align="right">
                      <Link
                        to={`/admin/products-scans/${s.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
                        aria-label={`View scan ${s.id}`}
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
          aria-label="Products / Scans pagination"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-4 py-3"
        >
          <p className="text-[11px] text-ink-3">
            Showing{' '}
            <span className="nn-mono font-semibold text-ink">{startIdx}</span>–
            <span className="nn-mono font-semibold text-ink">{endIdx}</span> of{' '}
            <span className="nn-mono font-semibold text-ink">{totalScans}</span> scans
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
