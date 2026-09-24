/**
 * InspectorInspections — Official Statutory Inspection History.
 *
 * Provides the field officer's complete historical enforcement record:
 * 1. Page Header: Section label 'INSPECTIONS', 'Inspection History' heading,
 *    and supporting government scope description with action launcher.
 * 2. Search & Filter Bar:
 *    - Free-text search matching shop name, city, product, brand, or inspection ID.
 *    - Inspection Status filter: In Progress, Submitted.
 *    - Rule Result filter: Compliant, Violation, Not Assessed, Out of Scope.
 *    - Sync Status filter: Synced, Not Synced.
 *    - Rule Violated filter: Populated with statutory Legal Metrology rules.
 *    - Shop filter: Dynamically populated from actual inspected stores.
 *    - Product filter: Dynamically populated from inspected commodities/brands.
 *    - Date range with standard quick presets: Last 7 days, Last 30 days, Last 90 days, All dates.
 *    - Reset/Clear filters button.
 * 3. Result Counter: Dynamic 'Showing X of Y inspections' counter.
 * 4. Government Inspection Table:
 *    - INSPECTION ID, SHOP, PRODUCT, DATE, INSPECTION STATUS, RULE RESULT, SYNC STATUS, ACTION.
 *    - Direct 'View' action linking to statutory InspectionDetail.
 * 5. Empty, Loading, and Error states with retry capability.
 * 6. Responsive pagination.
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileCheck,
  HelpCircle,
  MapPin,
  Package,
  RotateCcw,
  Search,
  Store,
  X,
  XCircle,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDebounced, useDocumentTitle } from '../lib/hooks'
import { CHECKS } from '../lib/checks'
import { useInspectorData } from '../lib/inspector'
import {
  Button,
  Card,
  DemoChip,
  EmptyState,
  Field,
  Input,
  InspectionStatusBadge,
  Modal,
  Select,
  Skeleton,
  SyncBadge,
  cx,
  useToast,
} from '../ui'

const PAGE_SIZE = 10

const iso = (d) => format(d, 'yyyy-MM-dd')

const PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All dates', days: null },
]

function prettyDate(isoDate) {
  if (!isoDate) return '—'
  try {
    const d = parseISO(isoDate)
    const today = iso(new Date())
    const yesterday = iso(subDays(new Date(), 1))
    if (isoDate === today) return `Today · ${format(d, 'd MMM yyyy')}`
    if (isoDate === yesterday) return `Yesterday · ${format(d, 'd MMM yyyy')}`
    return format(d, 'd MMM yyyy')
  } catch {
    return String(isoDate)
  }
}

function StatusPill({ status }) {
  const norm = String(status || '').toLowerCase()
  if (norm === 'compliant' || norm === 'pass') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-pass-border bg-pass-fill px-2.5 py-0.5 text-[11px] font-semibold text-pass-text">
        <CheckCircle size={12} strokeWidth={2.4} aria-hidden="true" />
        Compliant
      </span>
    )
  }
  if (norm === 'non_compliant' || norm === 'violation' || norm === 'fail') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violation-border bg-violation-fill px-2.5 py-0.5 text-[11px] font-semibold text-violation-text">
        <XCircle size={12} strokeWidth={2.4} aria-hidden="true" />
        Violation
      </span>
    )
  }
  if (norm === 'not_assessed' || norm === 'needs_review' || norm === 'review') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-review-border bg-review-fill px-2.5 py-0.5 text-[11px] font-semibold text-review-text">
        <HelpCircle size={12} strokeWidth={2.4} aria-hidden="true" />
        Not Assessed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-ink-3">
      <Clock size={12} strokeWidth={2.4} aria-hidden="true" />
      Out of Scope
    </span>
  )
}

export default function InspectorInspections() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  useDocumentTitle('Inspection History · NiyamNetra')

  const today = iso(new Date())

  // Data fetching hook scoped to the authenticated officer
  const { rows, fullScans, loading, demo, reload } = useInspectorData()

  // Submission State for Action Column
  const [submittingInspection, setSubmittingInspection] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitNotes, setSubmitNotes] = useState('')

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (!submittingInspection) return
    setSubmitting(true)
    try {
      await endpoints.inspections.submit(submittingInspection.id, {
        signature_status: 'signed',
        notes: submitNotes.trim() || undefined,
      })

      // Dispatch notification detail for Admin Portal
      const notifDetail = {
        id: `notif-${Date.now()}`,
        title: 'New Inspection Submitted',
        message: `${user?.full_name || 'Inspector One'} submitted inspection INS-${submittingInspection.id} for ${submittingInspection.shopName || 'Registered Premise'}`,
        time: 'Just now',
        inspectionId: `INS-${submittingInspection.id}`,
        read: false,
      }

      try {
        const stored = JSON.parse(localStorage.getItem('niyamnetra_admin_notifications') || '[]')
        localStorage.setItem('niyamnetra_admin_notifications', JSON.stringify([notifDetail, ...stored]))
      } catch (err) {
        console.warn('Could not store notification in localStorage', err)
      }

      window.dispatchEvent(new CustomEvent('niyamnetra:inspection-submitted', { detail: notifDetail }))

      toast.push({
        family: 'pass',
        title: 'Inspection Submitted',
        body: `Inspection INS-${submittingInspection.id} has been submitted. The data has been forwarded to the Admin Portal and notified.`,
      })

      setSubmittingInspection(null)
      setSubmitNotes('')
      reload?.()
    } catch (err) {
      toast.push({
        family: 'violation',
        title: 'Submission Failed',
        body: err?.message || 'Could not submit inspection. Please try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Filter States
  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw.trim(), 250)
  const [inspectionStatus, setInspectionStatus] = useState('all')
  const [ruleResult, setRuleResult] = useState('all')
  const [syncStatus, setSyncStatus] = useState('all')
  const [rule, setRule] = useState('all')
  const [shop, setShop] = useState('all')
  const [product, setProduct] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)

  // Derive unique shops from inspection records
  const shopOptions = useMemo(() => {
    const set = new Set()
    for (const r of rows) {
      if (r.shopName) set.add(r.shopName)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  // Derive unique products from inspection records
  const productOptions = useMemo(() => {
    const set = new Set()
    for (const r of rows) {
      for (const p of r.products || []) {
        if (p) set.add(p)
      }
      if (r.productLabel) set.add(r.productLabel)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  // Available statutory rules from catalog
  const ruleOptions = useMemo(() => {
    return [
      { id: 'CHK01', label: 'Rule 6 — Mandatory Declarations' },
      { id: 'CHK04', label: 'Rule 26 — Maximum Retail Price (MRP)' },
      { id: 'CHK06', label: 'Rule 7 — Generic Commodity Name' },
      { id: 'CHK05', label: 'Rule 12/13 — Net Quantity & Units' },
      { id: 'CHK02', label: 'Rule 26(a) — Small Package Exemption' },
      { id: 'CHK03', label: 'Rule 3 — Applicability & Wholesale Ambit' },
      { id: 'CHK12', label: 'Rule 6(1)(aa) — Country of Origin' },
      { id: 'CHK13', label: 'Rule 6(1)(da) — Best-Before Date' },
      { id: 'CHK11', label: 'Rule 6(3) — Stickers & Corrections' },
      { id: 'CHK07', label: 'Rule 9 — Font & Readability' },
    ]
  }, [])

  // Presets handling
  function applyPreset(p) {
    setPage(0)
    if (p.days == null) {
      setFrom('')
      setTo('')
      return
    }
    setFrom(iso(subDays(new Date(), p.days - 1)))
    setTo(today)
  }

  function resetFilters() {
    setQRaw('')
    setInspectionStatus('all')
    setRuleResult('all')
    setSyncStatus('all')
    setRule('all')
    setShop('all')
    setProduct('all')
    setFrom('')
    setTo('')
    setPage(0)
  }

  const isFiltered = Boolean(
    q ||
    inspectionStatus !== 'all' ||
    ruleResult !== 'all' ||
    syncStatus !== 'all' ||
    rule !== 'all' ||
    shop !== 'all' ||
    product !== 'all' ||
    from !== '' ||
    to !== ''
  )

  // Comprehensive Filtering Logic
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // 1. Text Search (Matches Shop, City, Product, Brand, Inspection ID)
      if (q) {
        const query = q.toLowerCase()
        const matchId = `ins-${r.id}`.includes(query) || String(r.id).includes(query)
        const matchShop = String(r.shopName || '').toLowerCase().includes(query)
        const matchCity = String(r.shopCity || '').toLowerCase().includes(query)
        const matchProduct = String(r.productLabel || '').toLowerCase().includes(query)
        const matchAllProducts = (r.products || []).some((p) => String(p).toLowerCase().includes(query))
        if (!matchId && !matchShop && !matchCity && !matchProduct && !matchAllProducts) {
          return false
        }
      }

      // 2. Inspection Status Filter (In Progress / Submitted)
      if (inspectionStatus !== 'all') {
        const isSubmitted =
          r.inspectionStatus === 'submitted' ||
          r.status === 'submitted' ||
          r.status === 'Submitted' ||
          Boolean(r.submitted_at)
        if (inspectionStatus === 'submitted' && !isSubmitted) return false
        if (inspectionStatus === 'in_progress' && isSubmitted) return false
      }

      // 3. Rule Result Filter (Compliant / Violation / Not Assessed / Out of Scope)
      if (ruleResult !== 'all') {
        const norm = String(r.ruleResult || r.status || '').toLowerCase()
        if (ruleResult === 'compliant' && norm !== 'compliant' && norm !== 'pass') return false
        if (
          ruleResult === 'violation' &&
          norm !== 'violation' &&
          norm !== 'non_compliant' &&
          norm !== 'fail'
        ) {
          return false
        }
        if (
          ruleResult === 'not_assessed' &&
          norm !== 'not_assessed' &&
          norm !== 'needs_review' &&
          norm !== 'review'
        ) {
          return false
        }
        if (ruleResult === 'out_of_scope' && norm !== 'out_of_scope') return false
      }

      // 4. Sync Status Filter (Synced / Not Synced)
      if (syncStatus !== 'all') {
        const isSynced =
          r.syncStatus === 'synced' ||
          r.syncState === 'synced' ||
          Boolean(r.synced_at) ||
          r.synced === true
        if (syncStatus === 'synced' && !isSynced) return false
        if (syncStatus === 'not_synced' && isSynced) return false
      }

      // 5. Shop Filter
      if (shop !== 'all' && r.shopName !== shop) {
        return false
      }

      // 6. Product Filter
      if (product !== 'all') {
        const hasProd =
          r.productLabel === product || (r.products || []).some((p) => p === product)
        if (!hasProd) return false
      }

      // 7. Date Range Filter
      if (from && r.date) {
        if (r.date < from) return false
      }
      if (to && r.date) {
        if (r.date > to) return false
      }

      // 8. Rule Violated Filter
      if (rule !== 'all') {
        let hasRuleBreach = false
        for (const s of r.scans || []) {
          const detail = fullScans[s.id] || s
          const findings = detail.findings || []
          if (
            findings.some(
              (f) =>
                f.check_id === rule &&
                (f.effective_verdict === 'fail' || f.verdict === 'fail' || f.human_verdict === 'fail')
            )
          ) {
            hasRuleBreach = true
            break
          }
        }
        if (!hasRuleBreach) return false
      }

      return true
    })
  }, [rows, q, inspectionStatus, ruleResult, syncStatus, rule, shop, product, from, to, fullScans])

  // Pagination calculation
  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1
  const pagedRows = useMemo(() => {
    const start = page * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, page])

  const totalPackages = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (r.scans?.length || r.productCount || 1), 0)
  }, [filteredRows])

  return (
    <div className="mx-auto w-full max-w-[1360px] pb-14">
      {/* ------------------------------------------------------------------ */}
      {/* 1. PAGE HEADER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-4 border-b border-divider pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="nn-eyebrow text-saffron">INSPECTIONS</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">
            Inspection History
          </h1>
          <p className="mt-1 max-w-3xl text-small text-ink-2">
            Every inspection/visit recorded for the inspector should be searchable, filterable and
            accessible with its complete evidence and findings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {demo && <DemoChip />}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. SEARCH AND FILTER SECTION                                       */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-6 flex flex-col gap-4 p-5 shadow-sm">
        {/* Row 1: Search, Inspection Status, Rule Result, Sync Status */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Free-text Search */}
          <Field label="Search" hint="Shop, city, product or ID">
            {(props) => (
              <div className="relative">
                <Search
                  size={15}
                  strokeWidth={2}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                  aria-hidden="true"
                />
                <Input
                  {...props}
                  type="search"
                  value={qRaw}
                  onChange={(e) => {
                    setQRaw(e.target.value)
                    setPage(0)
                  }}
                  placeholder="Search shop, city, product or ID"
                  className="pl-9 pr-8"
                  autoComplete="off"
                  spellCheck={false}
                />
                {qRaw && (
                  <button
                    type="button"
                    onClick={() => {
                      setQRaw('')
                      setPage(0)
                    }}
                    aria-label="Clear search text"
                    className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-sm text-ink-3 hover:text-ink"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </Field>

          {/* Inspection Status Dropdown */}
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
                <option value="all">All statuses</option>
                <option value="in_progress">In Progress</option>
                <option value="submitted">Submitted</option>
              </Select>
            )}
          </Field>

          {/* Rule Result Dropdown */}
          <Field label="Rule Result">
            {(props) => (
              <Select
                {...props}
                value={ruleResult}
                onChange={(e) => {
                  setRuleResult(e.target.value)
                  setPage(0)
                }}
              >
                <option value="all">All results</option>
                <option value="compliant">Compliant</option>
                <option value="violation">Violation</option>
                <option value="not_assessed">Not Assessed</option>
                <option value="out_of_scope">Out of Scope</option>
              </Select>
            )}
          </Field>

          {/* Sync Status Dropdown */}
          <Field label="Sync Status">
            {(props) => (
              <Select
                {...props}
                value={syncStatus}
                onChange={(e) => {
                  setSyncStatus(e.target.value)
                  setPage(0)
                }}
              >
                <option value="all">All sync states</option>
                <option value="synced">Synced</option>
                <option value="not_synced">Not Synced</option>
              </Select>
            )}
          </Field>
        </div>

        {/* Row 2: Shop, Product, Date Range & Clear */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Shop Dropdown */}
          <Field label="Shop">
            {(props) => (
              <Select
                {...props}
                value={shop}
                onChange={(e) => {
                  setShop(e.target.value)
                  setPage(0)
                }}
              >
                <option value="all">All shops</option>
                {shopOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* Product Dropdown */}
          <Field label="Product">
            {(props) => (
              <Select
                {...props}
                value={product}
                onChange={(e) => {
                  setProduct(e.target.value)
                  setPage(0)
                }}
              >
                <option value="all">All products</option>
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* Date Range Inputs */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="From date">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={from}
                  max={to || today}
                  onChange={(e) => {
                    setFrom(e.target.value)
                    setPage(0)
                  }}
                />
              )}
            </Field>
            <Field label="To date">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={today}
                  onChange={(e) => {
                    setTo(e.target.value)
                    setPage(0)
                  }}
                />
              )}
            </Field>
          </div>

          {/* Actions: Presets & Reset */}
          <div className="flex flex-col justify-end gap-1.5">
            <span className="text-caption font-medium text-ink-3">Quick Presets</span>
            <div className="flex items-center gap-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {PRESETS.map((p) => {
                  const active =
                    p.days == null
                      ? from === '' && to === ''
                      : from === iso(subDays(new Date(), p.days - 1)) && to === today
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      aria-pressed={active}
                      className={cx(
                        'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                        active
                          ? 'bg-navy text-ink-inverse shadow-xs'
                          : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink'
                      )}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>

              {isFiltered && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={RotateCcw}
                  onClick={resetFilters}
                  className="ml-auto shrink-0 text-[11px]"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 3. RESULT COUNTER & SUMMARY                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <p className="text-small font-semibold text-ink">
            Showing{' '}
            <span className="nn-mono font-bold text-navy">
              {filteredRows.length === 0
                ? 0
                : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filteredRows.length)}`}
            </span>{' '}
            of <span className="nn-mono font-bold text-ink">{filteredRows.length}</span>{' '}
            {filteredRows.length === 1 ? 'inspection' : 'inspections'}
            {isFiltered && rows.length !== filteredRows.length && (
              <span className="font-normal text-ink-3"> (filtered from {rows.length} total)</span>
            )}
          </p>
          <span className="text-ink-3" aria-hidden="true">•</span>
          <span className="text-caption text-ink-2 font-medium">
            {totalPackages} {totalPackages === 1 ? 'package' : 'packages'} inspected
          </span>
        </div>

        {/* Active Filters Indicators */}
        {isFiltered && (
          <div className="flex items-center gap-1.5 text-caption text-ink-3">
            <span>Filters active</span>
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] font-semibold text-accent-text hover:underline"
            >
              Reset all
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. INSPECTION TABLE                                                */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-3 overflow-hidden p-0 shadow-sm">
        {loading ? (
          <div className="p-6">
            <Skeleton lines={8} />
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={Search}
            title={isFiltered ? 'No inspections match your search' : 'No inspection records found'}
            body={
              isFiltered
                ? 'Try broadening your search term or adjusting status, product, or date filters.'
                : 'No statutory inspection records found for your account.'
            }
            action={
              isFiltered ? (
                <Button variant="secondary" icon={RotateCcw} onClick={resetFilters}>
                  Clear all filters
                </Button>
              ) : (
                <Button variant="secondary" icon={RotateCcw} onClick={reload}>
                  Refresh
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left" aria-label="Inspection History Table">
              <thead>
                <tr className="border-b border-divider bg-surface-2/60 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                  <th scope="col" className="px-5 py-3.5">
                    INSPECTION ID
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    SHOP
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    PRODUCT
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    DATE
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    INSPECTION STATUS
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    RULE RESULT
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    SYNC STATUS
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider text-[13px]">
                {pagedRows.map((r) => {
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/inspector/inspections/${r.id}`)}
                      className="cursor-pointer transition-colors duration-fast hover:bg-surface-2/60"
                    >
                      {/* 1. INSPECTION ID */}
                      <td className="px-5 py-4">
                        <span className="nn-mono font-bold text-navy hover:underline">
                          INS-{r.id}
                        </span>
                      </td>

                      {/* 2. SHOP */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-ink">{r.shopName}</span>
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-3">
                            <MapPin size={11} className="text-saffron" aria-hidden="true" />
                            {r.shopCity || 'Registered Premise'}
                          </span>
                        </div>
                      </td>

                      {/* 3. PRODUCT */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-ink">
                            {r.productLabel || 'Commodity Package'}
                          </span>
                          {(r.products?.length || 0) > 1 && (
                            <span className="mt-0.5 text-[11px] text-ink-3">
                              +{r.products.length - 1} other package
                              {r.products.length - 1 > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. DATE */}
                      <td className="px-4 py-4 text-ink-2">
                        <span className="font-medium">{prettyDate(r.date)}</span>
                        {r.scanned_at && (
                          <span className="block text-[11px] text-ink-3">
                            {format(parseISO(r.scanned_at), 'HH:mm')}
                          </span>
                        )}
                      </td>

                      {/* 5. INSPECTION STATUS */}
                      <td className="px-4 py-4">
                        <InspectionStatusBadge
                          status={r.inspectionStatus || (r.submitted_at ? 'submitted' : 'in_progress')}
                        />
                      </td>

                      {/* 6. RULE RESULT */}
                      <td className="px-4 py-4">
                        <StatusPill status={r.ruleResult || r.status} />
                      </td>

                      {/* 7. SYNC STATUS */}
                      <td className="px-4 py-4">
                        <SyncBadge state={r.syncStatus || (r.synced ? 'synced' : 'not_synced')} />
                      </td>

                      {/* 8. ACTION */}
                      <td className="px-5 py-4 text-right">
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.inspectionStatus !== 'submitted' && !r.submitted_at && (
                            <Button
                              size="sm"
                              variant="primary"
                              icon={CheckCircle2}
                              onClick={() => {
                                setSubmittingInspection(r)
                                setSubmitNotes('')
                              }}
                              className="bg-navy hover:bg-[#1a3d61] text-white font-semibold text-[11px] px-2.5 py-1 shadow-xs"
                            >
                              Submit
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={Eye}
                            onClick={() => {
                              navigate(`/inspector/inspections/${r.id}`)
                            }}
                          >
                            View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 5. PAGINATION FOOTER                                               */}
        {/* ------------------------------------------------------------------ */}
        {filteredRows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-divider px-5 py-3.5 text-small">
            <span className="text-caption text-ink-3">
              Page <span className="font-semibold text-ink">{page + 1}</span> of{' '}
              <span className="font-semibold text-ink">{totalPages}</span>
            </span>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={ChevronLeft}
                disabled={page === 0}
                disabledReason="You are on the first page."
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                iconRight={ChevronRight}
                disabled={page >= totalPages - 1}
                disabledReason="You are on the last page."
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 6. SUBMIT INSPECTION CONFIRMATION MODAL                            */}
      {/* ------------------------------------------------------------------ */}
      {submittingInspection && (
        <Modal
          open={Boolean(submittingInspection)}
          onClose={() => !submitting && setSubmittingInspection(null)}
          title={`Submit Inspection INS-${submittingInspection.id}`}
          description={`Confirm official submission for ${submittingInspection.shopName || 'Registered Premise'}. The inspection record will be locked, synchronized with the database, and forwarded to the Admin Portal with an immediate notification.`}
          size="md"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSubmittingInspection(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                onClick={handleSubmit}
                loading={submitting}
                className="bg-navy hover:bg-[#1a3d61] text-white font-semibold"
              >
                Confirm &amp; Submit
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4 text-small">
            <div className="rounded-md border border-divider bg-surface-2 p-3 text-[12px] space-y-1">
              <p className="text-ink font-semibold">
                Store: <span className="font-normal text-ink-2">{submittingInspection.shopName}</span>
              </p>
              <p className="text-ink font-semibold">
                Location: <span className="font-normal text-ink-2">{submittingInspection.shopCity || 'Registered Premise'}</span>
              </p>
              <p className="text-ink font-semibold">
                Inspection Date: <span className="font-normal text-ink-2">{prettyDate(submittingInspection.date)}</span>
              </p>
              <p className="text-ink font-semibold">
                Rule Result:{' '}
                <span className="font-normal text-ink-2">
                  {submittingInspection.ruleResult || submittingInspection.status || 'Compliant'}
                </span>
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="inspector-submit-notes" className="text-caption font-semibold text-ink">
                Statutory Remarks / Submission Notes (Optional)
              </label>
              <textarea
                id="inspector-submit-notes"
                rows={3}
                value={submitNotes}
                onChange={(e) => setSubmitNotes(e.target.value)}
                placeholder="e.g. Verified compliance under Legal Metrology Rules, 2011. Forwarded to Admin Portal."
                disabled={submitting}
                className="rounded-md border border-control bg-surface px-3 py-2 text-small text-ink outline-none focus:border-navy focus:ring-1 focus:ring-navy"
              />
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-[12px] text-amber-900">
              <p className="font-semibold">Notice of Official Statutory Filing:</p>
              <p className="mt-0.5 text-amber-800">
                Submitting this inspection will mark it as Submitted, update the central database, record a SHA-256 audit entry, and immediately alert the Administrator.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
