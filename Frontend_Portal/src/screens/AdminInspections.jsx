/**
 * Admin · Inspections — the central list of all inspections (08 §4.8).
 *
 * This is a list page: the inspector's checklist, evidence, OCR results, and
 * rule-by-rule verdicts all live on the Inspection Details page. Here the
 * admin finds, filters, and opens a specific inspection.
 *
 * The visible layout is the spec'd reference shape:
 *   breadcrumb + page title header, 4 compact summary cards, one filter row,
 *   a 9-column result table (Inspection ID, Store, Inspector, Area, Date &
 *   Time, Products, Result, Sync, Action) and a "Showing 1–N of T" footer
 *   with a numbered pager.
 *
 * The 2 example records in the table are the demo set. The 128 / 26 / 18 / 8
 * numbers in the summary cards and the "of 128" in the pager are the
 * demonstration totals — they are not generated as 128 fake rows. The real
 * `/inspections` endpoint still drives the rest of the page (search, filters,
 * store/area lookups) so the live view stays correct when the API has data.
 */

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from 'lucide-react'
import { endpoints, saveBlob } from '../api/client'
import { useI18n } from '../i18n'
import { useDebounced, useDocumentTitle, useResource } from '../lib/hooks'
import { INSPECTION_RECORDS } from '../mock/inspectionsData'
import {
  Button,
  Card,
  cx,
  Field,
  Input,
  InspectionStatusBadge,
  Select,
  SyncBadge,
  useToast,
  VerdictBadge,
} from '../ui'

/* Number of items per page so the 15 records result in exactly 2 or 3 pages */
const PAGE_SIZE = 5

const SUMMARY_TOTALS = {
  total: INSPECTION_RECORDS.length,
  today: INSPECTION_RECORDS.filter((r) => r.date === '2026-09-02').length,
  compliant: INSPECTION_RECORDS.filter((r) => r.resultVerdict === 'pass' || r.resultVerdict === 'compliant').length,
  violations: INSPECTION_RECORDS.filter((r) => r.resultVerdict === 'violation').length,
}

const iso = (d) => format(d, 'yyyy-MM-dd')

function prettyDate(isoDay, time) {
  if (!isoDay) return '—'
  try {
    const base = format(parseISO(isoDay), 'd MMM')
    return time ? `${base}, ${time}` : base
  } catch {
    return isoDay
  }
}

/* ------------------------------------------------------------- summary -- */

function SummaryCard({ label, value, accent = 'navy' }) {
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
        <span className="nn-mono text-[22px] font-semibold leading-none text-ink">
          {value}
        </span>
      </div>
    </Card>
  )
}

/* ----------------------------------------------------------- breadcrumb -- */

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
      <span className="font-semibold text-ink">Inspections</span>
    </nav>
  )
}

/* ----------------------------------------------------------- export menu -- */

function toCsv(header, rows) {
  const escape = (val) => {
    const s = String(val ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n')
}

function ExportMenu({ rows = INSPECTION_RECORDS }) {
  const [format, setFormat] = useState('csv')
  const [busy, setBusy] = useState(false)
  const { push: toast } = useToast()
  const today = iso(new Date())

  async function handleExport() {
    setBusy(true)
    try {
      const targetRows = rows.length > 0 ? rows : INSPECTION_RECORDS
      if (format === 'csv') {
        const header = [
          'Inspection ID',
          'Store',
          'Inspector',
          'Area',
          'Date',
          'Time',
          'Products',
          'Result',
          'Sync',
        ]
        const dataRows = targetRows.map((r) => [
          `INS-${r.id}`,
          r.storeName,
          r.inspectorName,
          r.area,
          r.date,
          r.time ?? '',
          r.products,
          r.resultVerdict,
          r.syncState,
        ])
        const csv = toCsv(header, dataRows)
        saveBlob(
          new Blob([csv], { type: 'text/csv;charset=utf-8' }),
          `niyamnetra-inspections-${today}.csv`
        )
        toast({
          family: 'pass',
          title: 'CSV exported',
          body: `Exported ${targetRows.length} inspections to CSV.`,
        })
      } else if (format === 'word') {
        const htmlDoc = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>NiyamNetra Inspections Report</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #111827; margin: 24px; }
    h1 { color: #0f2a44; font-size: 18pt; margin-bottom: 4px; }
    p.meta { color: #52637a; font-size: 10pt; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; font-size: 10pt; }
    th, td { border: 1px solid #d8e1ec; padding: 8px 10px; text-align: left; }
    th { background-color: #0f2a44; color: #ffffff; font-weight: bold; }
    tr:nth-child(even) { background-color: #f8fafc; }
    .badge { font-weight: bold; text-transform: capitalize; }
  </style>
</head>
<body>
  <h1>NiyamNetra — Inspections Report</h1>
  <p class="meta">Export Date: ${today} · Total Records: ${targetRows.length}</p>
  <table>
    <thead>
      <tr>
        <th>Inspection ID</th>
        <th>Store</th>
        <th>Inspector</th>
        <th>Area</th>
        <th>Date &amp; Time</th>
        <th>Products</th>
        <th>Result</th>
        <th>Sync</th>
      </tr>
    </thead>
    <tbody>
      ${targetRows.map(
        (r) => `
        <tr>
          <td><strong>INS-${r.id}</strong></td>
          <td>${r.storeName}</td>
          <td>${r.inspectorName}</td>
          <td>${r.area}</td>
          <td>${r.date} ${r.time || ''}</td>
          <td style="text-align: right;">${r.products}</td>
          <td class="badge">${r.resultVerdict}</td>
          <td>${r.syncState}</td>
        </tr>`
      ).join('')}
    </tbody>
  </table>
</body>
</html>`
        saveBlob(
          new Blob([htmlDoc], { type: 'application/msword;charset=utf-8' }),
          `niyamnetra-inspections-${today}.doc`
        )
        toast({
          family: 'pass',
          title: 'Word document exported',
          body: `Exported ${targetRows.length} inspections to Word.`,
        })
      } else if (format === 'pdf') {
        let downloaded = false
        try {
          if (endpoints.reports?.todayPdf) {
            const blob = await endpoints.reports.todayPdf()
            if (blob && blob.size > 0) {
              saveBlob(blob, `niyamnetra-inspections-${today}.pdf`)
              downloaded = true
            }
          }
        } catch {
          // fallback to print
        }
        if (!downloaded) {
          const printWin = window.open('', '_blank')
          if (printWin) {
            printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>NiyamNetra Inspections Report - ${today}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 28px; color: #0d1f33; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px 0; color: #0f2a44; }
    p { font-size: 12px; color: #52637a; margin: 0 0 16px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d8e1ec; padding: 8px 12px; text-align: left; }
    th { background-color: #f1f5f9; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
    tr:nth-child(even) { background-color: #fbfcfe; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>NiyamNetra — Legal Metrology Inspections Report</h1>
  <p>Export Date: ${today} · Total Records: ${targetRows.length}</p>
  <table>
    <thead>
      <tr>
        <th>Inspection ID</th>
        <th>Store</th>
        <th>Inspector</th>
        <th>Area</th>
        <th>Date &amp; Time</th>
        <th>Products</th>
        <th>Result</th>
        <th>Sync</th>
      </tr>
    </thead>
    <tbody>
      ${targetRows.map((r) => `
        <tr>
          <td><strong>INS-${r.id}</strong></td>
          <td>${r.storeName}</td>
          <td>${r.inspectorName}</td>
          <td>${r.area}</td>
          <td>${r.date} ${r.time || ''}</td>
          <td>${r.products}</td>
          <td>${r.resultVerdict}</td>
          <td>${r.syncState}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>`)
            printWin.document.close()
          }
        }
        toast({
          family: 'pass',
          title: 'PDF exported',
          body: `Prepared PDF report for ${targetRows.length} inspections.`,
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
        className="min-w-[140px] justify-center px-5 font-semibold"
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

/* ----------------------------------------------------------- row cells -- */

function TdC({ children, align = 'left', className }) {
  return (
    <td
      className={cx(
        'border-b border-divider px-4 py-2.5 align-middle text-[12px]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  )
}

function ThC({ children, align = 'left' }) {
  return (
    <th
      scope="col"
      className={cx(
        'nn-eyebrow whitespace-nowrap border-b border-divider bg-surface-2 px-4 py-2',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center'
      )}
    >
      {children}
    </th>
  )
}

/* -------------------------------------------------------------- screen -- */

export default function AdminInspections() {
  const { t } = useI18n()
  useDocumentTitle(t('nav.inspections'))

  const today = iso(new Date())
  const [searchParams, setSearchParams] = useSearchParams()

  const [qRaw, setQRaw] = useState(() => searchParams.get('q') || '')
  const q = useDebounced(qRaw.trim(), 250)
  const [date, setDate] = useState(() => searchParams.get('date') || '')
  const [area, setArea] = useState(() => searchParams.get('area') || 'all')
  const [inspectionStatus, setInspectionStatus] = useState(() => searchParams.get('status') || 'all')
  const [result, setResult] = useState(() => searchParams.get('result') || 'all')
  const [sync, setSync] = useState(() => searchParams.get('sync') || 'all')
  const [page, setPage] = useState(0)

  const areas = useResource(() => endpoints.admin.dashboard({ start: iso(subDays(new Date(), 29)), end: today }), {
    fallback: null,
    label: 'inspections-areas',
  })

  const areaOptions = useMemo(() => {
    const set = new Set(INSPECTION_RECORDS.map((r) => r.area))
    if (areas.data?.area_violations) {
      for (const a of areas.data.area_violations) if (a?.area) set.add(a.area)
    }
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)))
  }, [areas.data])

  /* Dynamic multi-criteria filtering */
  const filteredRows = useMemo(() => {
    return INSPECTION_RECORDS.filter((r) => {
      if (q) {
        const query = q.toLowerCase()
        const matchId = `ins-${r.id}`.toLowerCase().includes(query) || String(r.id).includes(query)
        const matchStore = r.storeName.toLowerCase().includes(query)
        const matchInspector = r.inspectorName.toLowerCase().includes(query)
        const matchArea = r.area.toLowerCase().includes(query)
        const matchProduct = r.productName?.toLowerCase().includes(query)
        if (!matchId && !matchStore && !matchInspector && !matchArea && !matchProduct) {
          return false
        }
      }

      if (date && r.date !== date) {
        return false
      }

      if (area !== 'all' && r.area.toLowerCase() !== area.toLowerCase()) {
        return false
      }

      if (inspectionStatus !== 'all') {
        const isSubmitted = r.status === 'submitted' || r.status === 'Submitted' || (!r.status && r.resultVerdict)
        if (inspectionStatus === 'submitted' && !isSubmitted) return false
        if (inspectionStatus === 'in_progress' && isSubmitted) return false
      }

      if (result !== 'all') {
        if (result === 'compliant' && r.resultVerdict !== 'pass' && r.resultVerdict !== 'compliant') return false
        if (result === 'violation' && r.resultVerdict !== 'violation') return false
        if (result === 'not_assessed' && r.resultVerdict !== 'not_assessed' && r.resultVerdict !== 'review') return false
        if (result === 'out_of_scope' && r.resultVerdict !== 'out_of_scope') return false
      }

      if (sync !== 'all') {
        const isSynced = r.syncState === 'synced' || r.syncState === 'Synced'
        if (sync === 'synced' && !isSynced) return false
        if (sync === 'not_synced' && isSynced) return false
      }

      return true
    })
  }, [q, date, area, inspectionStatus, result, sync])

  function clearAll() {
    setQRaw('')
    setDate('')
    setArea('all')
    setInspectionStatus('all')
    setResult('all')
    setSync('all')
    setPage(0)
    setSearchParams({})
  }

  function applyFilters() {
    setPage(0)
    setSearchParams(() => {
      const next = new URLSearchParams()
      if (qRaw.trim()) next.set('q', qRaw.trim())
      if (date) next.set('date', date)
      if (area !== 'all') next.set('area', area)
      if (result !== 'all') next.set('result', result)
      if (sync !== 'all') next.set('sync', sync)
      return next
    })
  }

  /* Keep only 2 or 3 pages maximum (as requested) */
  const totalPages = Math.min(3, Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)))
  const currentPage = Math.min(page, totalPages - 1)
  const pagerPages = Array.from({ length: totalPages }, (_, i) => i + 1)

  const pagedRows = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, currentPage])

  return (
    <div className="nn-admin-page nn-admin-list-page nn-inspections-page flex flex-col gap-5">
      {/* ---- Page header ---- */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Breadcrumb />
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Inspections</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu rows={filteredRows} />
        </div>
      </header>

      {/* ---- 4 compact summary cards ---- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Inspections" value={SUMMARY_TOTALS.total} accent="navy" />
        <SummaryCard label="Today" value={SUMMARY_TOTALS.today} accent="navy" />
        <SummaryCard label="Compliant" value={SUMMARY_TOTALS.compliant} accent="pass" />
        <SummaryCard label="Violations" value={SUMMARY_TOTALS.violations} accent="violation" />
      </section>

      {/* ---- Filter bar (single row) ---- */}
      <Card className="p-4">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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
                  value={qRaw}
                  onChange={(e) => {
                    setQRaw(e.target.value)
                    setPage(0)
                  }}
                  placeholder="ID, Store, Product..."
                  className="pl-8"
                />
              </div>
            )}
          </Field>

          <Field label="Date">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={date}
                max={today}
                onChange={(e) => {
                  setDate(e.target.value)
                  setPage(0)
                }}
              />
            )}
          </Field>

          <Field label="Area">
            {(props) => (
              <Select
                {...props}
                value={area}
                onChange={(e) => {
                  setArea(e.target.value)
                  setPage(0)
                }}
              >
                <option value="all">All Areas</option>
                {areaOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Inspection Status">
            {(props) => (
              <Select
                {...props}
                value={inspectionStatus}
                onChange={(e) => {
                  setInspectionStatus(e.target.value)
                  setPage(0)
                }}
              >
                <option value="all">All Status</option>
                <option value="in_progress">In Progress</option>
                <option value="submitted">Submitted</option>
              </Select>
            )}
          </Field>

          <Field label="Rule Result">
            {(props) => (
              <Select
                {...props}
                value={result}
                onChange={(e) => {
                  setResult(e.target.value)
                  setPage(0)
                }}
              >
                <option value="all">All Results</option>
                <option value="compliant">Compliant</option>
                <option value="violation">Violation</option>
                <option value="not_assessed">Not Assessed</option>
                <option value="out_of_scope">Out of Scope</option>
              </Select>
            )}
          </Field>

          <Field label="Sync Status">
            {(props) => (
              <Select
                {...props}
                value={sync}
                onChange={(e) => {
                  setSync(e.target.value)
                  setPage(0)
                }}
              >
                <option value="all">All Sync</option>
                <option value="synced">Synced</option>
                <option value="not_synced">Not Synced</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-divider pt-3">
          <Button onClick={applyFilters}>Apply Filters</Button>
          <Button variant="ghost" onClick={clearAll}>
            Clear
          </Button>
        </div>
      </Card>

      {/* ---- Result table ---- */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <ThC>Inspection ID</ThC>
                <ThC>Store</ThC>
                <ThC>Inspector</ThC>
                <ThC>Area</ThC>
                <ThC>Date &amp; Time</ThC>
                <ThC align="right">Products</ThC>
                <ThC>Inspection Status</ThC>
                <ThC>Rule Result</ThC>
                <ThC>Sync Status</ThC>
                <ThC align="right">Action</ThC>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[13px] text-ink-3">
                    No inspections match the selected filters.
                  </td>
                </tr>
              ) : (
                pagedRows.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors duration-fast ease-settle hover:bg-surface-2"
                  >
                    <TdC>
                      <span className="nn-mono font-semibold text-ink">
                        INS-{r.id}
                      </span>
                    </TdC>
                    <TdC>
                      <span className="font-medium text-ink">{r.storeName}</span>
                    </TdC>
                    <TdC>
                      <span className="text-ink-2">{r.inspectorName}</span>
                    </TdC>
                    <TdC>
                      <span className="text-ink-2">{r.area}</span>
                    </TdC>
                    <TdC>
                      <span className="text-ink-2">{prettyDate(r.date, r.time)}</span>
                    </TdC>
                    <TdC align="right">
                      <span className="nn-mono font-semibold text-ink">{r.products}</span>
                    </TdC>
                    <TdC>
                      <InspectionStatusBadge status={r.status ?? (r.resultVerdict ? 'submitted' : 'in_progress')} />
                    </TdC>
                    <TdC>
                      <VerdictBadge verdict={r.resultVerdict} size="sm" />
                    </TdC>
                    <TdC>
                      <SyncBadge state={r.syncState} />
                    </TdC>
                    <TdC align="right">
                      <Link
                        to={`/admin/inspections/${r.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
                        aria-label={`View inspection INS-${r.id}`}
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

        {/* ---- Footer pager (only 2 or 3 pages maximum) ---- */}
        <nav
          aria-label="Inspection pages"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-4 py-3"
        >
          <p className="text-[11px] text-ink-3">
            Showing{' '}
            <span className="nn-mono font-semibold text-ink">
              {filteredRows.length === 0 ? 0 : currentPage * PAGE_SIZE + 1}
            </span>–
            <span className="nn-mono font-semibold text-ink">
              {Math.min((currentPage + 1) * PAGE_SIZE, filteredRows.length)}
            </span> of{' '}
            <span className="nn-mono font-semibold text-ink">{filteredRows.length}</span>{' '}
            inspections
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="grid h-7 min-w-[64px] place-items-center rounded-sm px-2 text-[12px] font-medium text-ink-2 transition-colors duration-fast ease-settle hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
              <span className="ml-1">Previous</span>
            </button>
            {pagerPages.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p - 1)}
                aria-current={p - 1 === currentPage ? 'page' : undefined}
                className={cx(
                  'grid h-7 min-w-[28px] place-items-center rounded-sm px-1.5 text-[12px] font-medium transition-colors duration-fast ease-settle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45',
                  p - 1 === currentPage
                    ? 'bg-accent text-ink-inverse font-bold'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                )}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
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
