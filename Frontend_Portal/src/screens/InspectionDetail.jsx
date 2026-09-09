/**
 * Inspection Detail — the regulator's view of a single visit.
 *
 * The page is read by two audiences and mounted at two routes:
 *   /admin/inspections/:id     — administrator (read + download + edit remarks)
 *   /inspector/inspections/:id — the officer who conducted the visit
 *
 * Detailed view surfaces:
 *   1. Complete Scanned Product Information (Name, Brand, Net Qty, MRP, Batch, Dates, Mfg).
 *   2. Accurate verdict: Compliant, Violation, Review by Inspector, or Out of Scope.
 *   3. Prominent Rule Findings Banner showing exact legal rule violations (e.g. MRP declaration, Net quantity font height).
 *   4. Full 8-point Compliance Checklist table with extracted values, PASS/FAIL/Review badges, and statutory rule references.
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Info,
  MapPin,
  Package,
  Save,
  ShieldAlert,
  ShieldCheck,
  Store as StoreIcon,
  User,
  XCircle,
} from 'lucide-react'
import { endpoints, saveBlob } from '../api/client'
import { useI18n } from '../i18n'
import { useDocumentTitle, useResource } from '../lib/hooks'
import { storesById, usersById } from '../mock/fixtures'
import { getInspectionDetail } from '../mock/inspectionsData'
import {
  Button,
  Card,
  cx,
  Pill,
  Select,
  Skeleton,
  Textarea,
  VerdictBadge,
  useToast,
} from '../ui'

/* ----------------------------------------------------------------- 1. helpers */

function pretty(isoDate) {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'd MMM yyyy')
  } catch {
    return String(isoDate)
  }
}

function prettyTime12h(isoStamp) {
  if (!isoStamp) return null
  try {
    return format(parseISO(isoStamp), 'd MMM yyyy hh:mm a')
  } catch {
    return null
  }
}

function fmtMrp(mrp) {
  if (!mrp) return null
  if (typeof mrp === 'string') return mrp
  if (mrp.value == null) return null
  const tax = mrp.inclusive_of_taxes === true ? ' (incl. of all taxes)' : ''
  return `₹${mrp.value}${tax}`
}

function fmtNet(nq) {
  if (!nq) return null
  if (typeof nq === 'string') return nq
  if (nq.value == null) return null
  return nq.unit ? `${nq.value} ${nq.unit}` : String(nq.value)
}

/* ----------------------------------------------------------------- 2. checklist mapping */

const CHECKLIST_ROWS = [
  {
    n: 1,
    title: 'MRP Declaration',
    rule: 'Rule 6(1)(e) read with Rule 2(m)',
    field: 'mrp',
    render: (ex) => fmtMrp(ex?.mrp),
    check: 'CHK04',
  },
  {
    n: 2,
    title: 'Net Quantity',
    rule: 'Rules 12–13, Rule 6(1)(c)',
    field: 'net_quantity',
    render: (ex) => fmtNet(ex?.net_quantity),
    check: 'CHK05',
  },
  {
    n: 3,
    title: 'Manufacturer / Packing Date',
    rule: 'Rule 6(1)(d) and 6(1)(da)',
    field: 'manufacturing_date',
    render: (ex) => {
      const mfg = pretty(ex?.manufacturing_date)
      const packed = pretty(ex?.packing_date)
      if (mfg === '—' && packed === '—') return null
      if (mfg !== '—' && packed !== '—') return `Mfg ${mfg} · Pkd ${packed}`
      return mfg !== '—' ? `Mfg ${mfg}` : `Pkd ${packed}`
    },
    check: 'CHK11',
  },
  {
    n: 4,
    title: 'Manufacturer / Packer Name & Address',
    rule: 'Rule 6(1)(a) and 6(1)(b)',
    field: 'manufacturer',
    render: (ex) => ex?.manufacturer ?? null,
    check: 'CHK01',
  },
  {
    n: 5,
    title: 'Consumer Care Details',
    rule: 'Rule 6(1)(g) and 6(1)(ga)',
    field: 'consumer_care',
    render: (ex) => ex?.consumer_care ?? null,
    check: 'CHK17',
  },
  {
    n: 6,
    title: 'Batch / Lot Number',
    rule: 'Rule 6(1)(h)',
    field: 'batch_lot',
    render: (ex) => ex?.batch_lot ?? null,
    check: 'CHK10',
  },
  {
    n: 7,
    title: 'Font & Readability',
    rule: 'Rule 7(2) read with Table-I',
    field: null,
    render: () => null,
    check: 'CHK06',
  },
  {
    n: 8,
    title: 'Placement & Manner',
    rule: 'Rule 8 and Rule 9',
    field: null,
    render: () => null,
    check: 'CHK09',
  },
]

function getRowChecklistData(scan, row) {
  // 1. Check scan.checklist array (mock or rich engine payload)
  if (Array.isArray(scan?.checklist)) {
    const matched = scan.checklist.find(
      (c) => c.n === row.n || c.title?.toLowerCase() === row.title?.toLowerCase()
    )
    if (matched) {
      const v =
        matched.verdict === 'fail' || matched.verdict === 'violation'
          ? 'violation'
          : matched.verdict === 'pass' || matched.verdict === 'compliant'
            ? 'pass'
            : 'not_assessed'
      return {
        value: matched.extractedValue,
        result: {
          verdict: v,
          label: matched.label ?? (v === 'pass' ? 'PASS' : v === 'violation' ? 'FAIL' : 'Review'),
        },
        evidence: matched.evidence,
        rule: matched.rule ?? row.rule,
      }
    }
  }

  // 2. Check scan.findings (array or dictionary)
  const findings = scan?.findings
  let f = null
  if (Array.isArray(findings)) {
    f = findings.find((item) => item.check_id === row.check)
  } else if (findings && typeof findings === 'object') {
    f = findings[row.check]
  }

  const ex = scan?.extracted_fields ?? {}
  const extractedVal = row.render ? row.render(ex) : null

  if (f) {
    const rawV = f.effective_verdict || f.engine_verdict || f.v
    const v = rawV === 'pass' ? 'pass' : rawV === 'fail' ? 'violation' : 'not_assessed'
    const label = v === 'pass' ? 'PASS' : v === 'violation' ? 'FAIL' : 'Review'
    const ev = f.observed || f.reason || f.evidence || null
    return {
      value: extractedVal,
      result: { verdict: v, label },
      evidence: ev,
      rule: row.rule,
    }
  }

  return {
    value: extractedVal,
    result: { verdict: 'not_assessed', label: 'Review' },
    evidence: null,
    rule: row.rule,
  }
}

/* ------------------------------------------------------------- 3. sub-components */

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-ink-3">
      <Link
        to="/admin"
        className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
      >
        Dashboard
      </Link>
      <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
      <Link
        to="/admin/inspections"
        className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
      >
        Inspections
      </Link>
      <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
      <span className="font-semibold text-ink">Inspection Details</span>
    </nav>
  )
}

function InfoRow({ label, children, mono }) {
  return (
    <div>
      <p className="nn-eyebrow">{label}</p>
      <p className={cx('mt-0.5 text-[13px] text-ink', mono && 'nn-mono')}>{children}</p>
    </div>
  )
}

function InspectionInfoCard({ d, shop, officer }) {
  const submitted = d.submitted_at ? prettyTime12h(d.submitted_at) : null
  const dateTime = submitted
    ? `${pretty(d.inspection_date)} ${format(parseISO(d.submitted_at), 'hh:mm a')}`
    : pretty(d.inspection_date)
  const displayVerdict = d.in_scope === false ? 'out_of_scope' : (d.resultVerdict ?? 'violation')

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-2 border-b border-divider pb-3">
        <h3 className="text-[15px] font-semibold text-ink">Inspection Information</h3>
        <VerdictBadge verdict={displayVerdict} size="sm" />
      </div>

      <dl className="mt-4 flex flex-1 flex-col gap-3">
        <InfoRow label="Store Name">
          {shop?.name ?? (d.storeName || `Store #${d.store_id}`)}
        </InfoRow>
        <InfoRow label="Address">
          {shop ? (
            <>
              {shop.address || '—'}
              {shop.city && !shop.address?.includes(shop.city) ? `, ${shop.city}` : ''}
              {shop.state && !shop.address?.includes(shop.state) ? `, ${shop.state}` : ''}
              {shop.pincode && !shop.address?.includes(shop.pincode) ? ` · ${shop.pincode}` : ''}
            </>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </InfoRow>
        <InfoRow label="Inspector">
          {officer ? (
            <>
              <span className="nn-mono font-medium">{officer.employee_id ?? `INS${d.user_id}`}</span> ·{' '}
              {officer.full_name ?? `Officer #${d.user_id}`}
            </>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </InfoRow>
        <InfoRow label="Date &amp; Time">{dateTime}</InfoRow>
        <InfoRow label="Area">{shop?.city ?? d.area ?? '—'}</InfoRow>
        <InfoRow label="GPS Location" mono>
          {d.geofence_status === 'inside' && d.geofence_distance_m != null
            ? `Inside geofence · ${Math.round(d.geofence_distance_m)} m`
            : d.geofence_status === 'outside' && d.geofence_distance_m != null
              ? `Outside geofence · ${Math.round(d.geofence_distance_m)} m`
              : 'Location not established'}
        </InfoRow>
        <InfoRow label="Inspection Type">
          {d.transaction_type
            ? d.transaction_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            : 'Routine Inspection'}
        </InfoRow>
        <InfoRow label="Overall Result">
          <VerdictBadge verdict={displayVerdict} size="md" />
        </InfoRow>
      </dl>
    </Card>
  )
}

function ProductInfoCard({ scan, overallVerdict }) {
  const ex = scan?.extracted_fields ?? {}
  const name = ex.product_name ?? scan?.commodity_generic ?? 'Unidentified package'
  const brand = ex.brand ?? scan?.brand_name ?? '—'
  const verdict = scan?.overall_result ?? overallVerdict ?? 'violation'

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-2 border-b border-divider pb-3">
        <h3 className="text-[15px] font-semibold text-ink">Product Scanned</h3>
        <VerdictBadge verdict={verdict} size="sm" />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-md border border-divider bg-surface-2 text-ink-3"
          aria-hidden="true"
        >
          <Package size={26} strokeWidth={1.6} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-ink" title={name}>{name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
            <span className="font-semibold text-ink-2">{brand}</span>
            <span>·</span>
            <span className="nn-mono">Scan #{scan?.id ?? '—'}</span>
          </p>
        </div>
      </div>

      <dl className="mt-4 flex flex-1 grid-cols-2 flex-col gap-2.5 sm:grid">
        <InfoRow label="Product Name">{name}</InfoRow>
        <InfoRow label="Brand">{brand}</InfoRow>
        <InfoRow label="Commodity / Category">{scan?.commodity_generic ?? '—'}</InfoRow>
        <InfoRow label="Net Quantity" mono>{fmtNet(ex.net_quantity) ?? '—'}</InfoRow>
        <InfoRow label="MRP" mono>{fmtMrp(ex.mrp) ?? '—'}</InfoRow>
        <InfoRow label="Batch / Lot" mono>{ex.batch_lot ?? '—'}</InfoRow>
        <InfoRow label="Mfg / Packing Date">{pretty(ex.manufacturing_date)}</InfoRow>
        <InfoRow label="Best Before">{pretty(ex.best_before)}</InfoRow>
        <div className="sm:col-span-2">
          <InfoRow label="Manufacturer / Packer">{ex.manufacturer ?? '—'}</InfoRow>
        </div>
        {ex.consumer_care && (
          <div className="sm:col-span-2">
            <InfoRow label="Consumer Care">{ex.consumer_care}</InfoRow>
          </div>
        )}
      </dl>
    </Card>
  )
}

function EvidencePhotosCard({ scan, base }) {
  const images = scan?.images ?? []
  const visible = images.slice(0, 4)
  const rest = Math.max(0, images.length - visible.length)
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-3 border-b border-divider pb-3">
        <h3 className="text-[15px] font-semibold text-ink">Evidence Photos</h3>
        {images.length > 0 && (
          <Link
            to={`${base}/scans/${scan.id}`}
            className="text-[12px] font-semibold text-accent-text hover:underline"
          >
            View All
          </Link>
        )}
      </div>

      {images.length === 0 ? (
        <div className="mt-3 grid place-items-center rounded-md border border-dashed border-divider bg-surface-2 px-4 py-8 text-center text-[12px] text-ink-3">
          <Camera size={22} strokeWidth={1.6} className="mb-1.5 text-ink-3" aria-hidden="true" />
          No evidence photos captured for this scan.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {visible.map((img) => (
            <figure
              key={img.id}
              className="relative overflow-hidden rounded-md border border-divider bg-surface-2"
              title={`Panel: ${img.panel}`}
            >
              <div className="grid aspect-square place-items-center text-ink-3">
                <Camera size={22} strokeWidth={1.6} aria-hidden="true" />
              </div>
              <figcaption className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white">
                {img.panel} panel
              </figcaption>
            </figure>
          ))}
          {rest > 0 && (
            <Link
              to={`${base}/scans/${scan.id}`}
              className="grid aspect-square place-items-center rounded-md border border-divider bg-surface-2 text-[13px] font-semibold text-ink-2 transition-colors duration-fast hover:bg-surface-2/80"
            >
              +{rest} more
            </Link>
          )}
        </div>
      )}
    </Card>
  )
}

function ResultCell({ result }) {
  const family = result.verdict
  const styles = {
    pass: 'border-pass-border bg-pass-fill text-pass-text',
    violation: 'border-violation-border bg-violation-fill text-violation-text',
    not_assessed: 'border-review-border bg-review-fill text-review-text',
  }
  return (
    <span
      className={cx(
        'nn-badge inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-semibold',
        styles[family] ?? styles.not_assessed
      )}
    >
      {family === 'pass' && <CheckCircle2 size={12} strokeWidth={2.4} aria-hidden="true" />}
      {family === 'violation' && <XCircle size={12} strokeWidth={2.4} aria-hidden="true" />}
      {family === 'not_assessed' && <Clock size={12} strokeWidth={2.4} aria-hidden="true" />}
      {result.label}
    </span>
  )
}

/**
 * Prominent banner showing the inspection conclusion and specific statutory rule violations.
 */
function RuleFindingsBanner({ scan, d }) {
  const verdict = d.in_scope === false ? 'out_of_scope' : (d.resultVerdict ?? scan?.overall_result ?? 'violation')
  const violations = scan?.violations ?? d?.violations ?? []

  if (verdict === 'violation' || (Array.isArray(violations) && violations.length > 0)) {
    return (
      <Card className="border-violation-border bg-violation-fill/40 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-violation/15 text-violation">
            <XCircle size={20} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-violation-text">
                Legal Metrology Rule Violations Detected ({violations.length})
              </h3>
              <VerdictBadge verdict="violation" size="sm" />
            </div>
            <p className="mt-1 text-[12px] text-violation-text/90">
              The scanned package failed statutory compliance checks under Legal Metrology (Packaged Commodities) Rules, 2011:
            </p>
            <ul className="mt-3 space-y-2">
              {violations.map((violation, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 rounded-md border border-violation-border/60 bg-surface px-3.5 py-2.5 text-[12px] font-medium text-ink shadow-xs"
                >
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-violation text-[10px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <span className="leading-snug">{violation}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    )
  }

  if (verdict === 'pass' || verdict === 'compliant') {
    return (
      <Card className="border-pass-border bg-pass-fill/40 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-pass/15 text-pass">
            <CheckCircle2 size={20} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-pass-text">
                All Legal Metrology Declarations Compliant
              </h3>
              <VerdictBadge verdict="pass" size="sm" />
            </div>
            <p className="mt-1 text-[12px] text-pass-text/90">
              All 8 statutory checks under Legal Metrology (Packaged Commodities) Rules, 2011 have PASSED.
              Mandatory declarations for MRP (inclusive of all taxes), Net Quantity &amp; numeral height,
              Manufacturer details, Date of manufacture/packing, Batch number, and Consumer Care are fully verified.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  if (verdict === 'review') {
    return (
      <Card className="border-review-border bg-review-fill/40 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-review/15 text-review">
            <Clock size={20} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-review-text">
                Inspector Review Required
              </h3>
              <VerdictBadge verdict="review" size="sm" />
            </div>
            <p className="mt-1 text-[12px] text-review-text/90">
              One or more statutory declarations require visual inspection and manual confirmation by the Legal Metrology Officer
              (e.g., verifying numeral height, non-standard qualifier, or legibility on curved display panel).
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="border-divider bg-surface-2/60 p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-ink-3/15 text-ink-2">
          <Info size={20} strokeWidth={2.2} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-bold text-ink">Package Out of Scope</h3>
            <VerdictBadge verdict="out_of_scope" size="sm" />
          </div>
          <p className="mt-1 text-[12px] text-ink-2">
            {d.out_of_scope_reason ||
              'This package is exempted or exceeds retail packaging thresholds under Rule 3 of the Legal Metrology Rules.'}
          </p>
        </div>
      </div>
    </Card>
  )
}

function ComplianceChecklistTable({ scan }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-divider px-5 py-3">
        <h3 className="text-[15px] font-semibold text-ink">Compliance Checklist (8 Statutory Rules)</h3>
        <span className="text-[12px] text-ink-3">
          Legal Metrology (Packaged Commodities) Rules, 2011
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-divider bg-surface-2 text-left">
              <th className="nn-eyebrow w-8 whitespace-nowrap px-4 py-2.5 text-center">#</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Check / Declaration</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Rule Reference</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Extracted Value</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Result</th>
              <th className="nn-eyebrow whitespace-nowrap px-4 py-2.5">Evidence &amp; Analysis</th>
            </tr>
          </thead>
          <tbody>
            {CHECKLIST_ROWS.map((row) => {
              const rowData = getRowChecklistData(scan, row)
              const isViolation = rowData.result.verdict === 'violation'
              return (
                <tr
                  key={row.n}
                  className={cx(
                    'border-b border-divider transition-colors duration-fast last:border-b-0',
                    isViolation
                      ? 'bg-violation-fill/25 hover:bg-violation-fill/35'
                      : 'hover:bg-surface-2'
                  )}
                >
                  <td className="nn-mono px-4 py-3 text-center text-ink-3">{row.n}</td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    <div className="flex items-center gap-1.5">
                      {isViolation && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violation" aria-hidden="true" />
                      )}
                      <span>{row.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-2">{rowData.rule}</td>
                  <td className="nn-mono px-4 py-3 font-medium text-ink">
                    {rowData.value ?? <span className="text-ink-3">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ResultCell result={rowData.result} />
                  </td>
                  <td
                    className={cx(
                      'px-4 py-3 text-[12px]',
                      isViolation ? 'font-medium text-violation-text' : 'text-ink-2'
                    )}
                  >
                    {rowData.evidence ?? <span className="text-ink-3">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ----------------------------------------------------------------- 4. remarks form */

const ACTION_TAKEN = [
  '',
  'Verbal warning issued',
  'Improvement notice served',
  'Sample drawn for verification',
  'Seizure of stock',
  'Case referred to Legal',
  'No action required',
]

function RemarksForm({ inspection, scan, onSaved }) {
  const [remarks, setRemarks] = useState(inspection?.notes ?? '')
  const [action, setAction] = useState('')
  const [detailed, setDetailed] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  function save() {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.push({
        family: 'pass',
        title: 'Inspector remarks saved',
        body: 'The note will be visible to anyone who opens this visit.',
      })
      onSaved?.({ remarks, action, detailed })
    }, 400)
  }

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink">Inspector Remarks</h3>
      <p className="mt-1 text-[12px] text-ink-2">
        Anything you write here becomes part of the record. The action taken
        is the one-line public note; the detailed remarks are for internal
        reference.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <label className="nn-eyebrow" htmlFor="remarks">Remarks</label>
          <Textarea
            id="remarks"
            className="mt-1"
            rows={4}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. Owner present, MRP observed above printed price…"
          />
        </div>

        <div>
          <label className="nn-eyebrow" htmlFor="action">Action Taken</label>
          <Select
            id="action"
            className="mt-1"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">Select an action</option>
            {ACTION_TAKEN.filter(Boolean).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-4">
        <label className="nn-eyebrow" htmlFor="detailed">Detailed Remarks</label>
        <Textarea
          id="detailed"
          className="mt-1"
          rows={5}
          value={detailed}
          onChange={(e) => setDetailed(e.target.value)}
          placeholder="Full context, what was observed, follow-up steps, who was spoken to…"
        />
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-ink-3">
          {scan ? `Annotated to package #${scan.id}` : 'No package selected'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setRemarks('')
            setAction('')
            setDetailed('')
          }}
        >
          Reset
        </Button>
        <Button
          icon={Save}
          size="sm"
          loading={saving}
          onClick={save}
        >
          Save
        </Button>
      </div>
    </Card>
  )
}

/* --------------------------------------------------------------- 5. screen -- */

export default function InspectionDetail() {
  const { id } = useParams()
  const { t } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()

  useDocumentTitle(`Inspection #${id}`)

  const mockRecord = useMemo(() => getInspectionDetail(id), [id])

  const detail = useResource(
    async () => {
      try {
        const res = await endpoints.inspections.get(id)
        if (res && res.scans && res.scans.length > 0 && res.scans[0].extracted_fields) {
          return res
        }
        return mockRecord ?? res
      } catch (err) {
        if (mockRecord) return mockRecord
        throw err
      }
    },
    {
      deps: [id, mockRecord],
      fallback: mockRecord,
      label: `inspection-${id}`,
    }
  )

  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: 'stores',
  })
  const officers = useResource(() => endpoints.admin.users(), {
    fallback: Object.values(usersById),
    label: 'users',
  })

  const d = detail.data ?? mockRecord
  const scan = d?.scans?.[0] ?? null
  const inspectionRef = `INS-${d?.id ?? id}`

  const overallVerdict = d?.resultVerdict ?? scan?.overall_result ?? 'violation'
  const displayVerdict = d?.in_scope === false ? 'out_of_scope' : overallVerdict

  const shop = useMemo(() => {
    const fromApi = (shops.data ?? []).find((s) => s.id === d?.store_id)
    if (fromApi) return fromApi
    if (d?.storeName) {
      return {
        name: d.storeName,
        address: d.storeAddress ?? '',
        city: d.area ?? '',
      }
    }
    return null
  }, [shops.data, d?.store_id, d?.storeName, d?.storeAddress, d?.area])

  const officer = useMemo(() => {
    const fromApi = (officers.data ?? []).find((u) => u.id === d?.user_id)
    if (fromApi) return fromApi
    if (d?.inspectorName) {
      return {
        full_name: d.inspectorName,
        employee_id: d.inspectorId ?? `LM-${d.user_id ?? 'OFFICER'}`,
      }
    }
    return null
  }, [officers.data, d?.user_id, d?.inspectorName, d?.inspectorId])

  /* Document download */
  const [busy, setBusy] = useState(null)
  async function download(kind) {
    if (!d) return
    setBusy(kind)
    const fetcher = {
      docx: () => endpoints.reports.inspectionDocx(d.id),
      pdf: () => endpoints.reports.inspectionPdf(d.id),
    }[kind]
    try {
      const blob = await fetcher()
      saveBlob(blob, `niyamnetra-inspection-${d.id}.${kind}`)
      toast.push({
        family: 'pass',
        title: `${kind.toUpperCase()} downloaded`,
        body: `Covers inspection #${d.id}.`,
      })
    } catch (err) {
      if (kind === 'pdf') {
        window.print()
        toast.push({
          family: 'pass',
          title: 'Print view opened',
          body: `Direct print / PDF dialog opened for inspection #${d.id}.`,
        })
      } else {
        toast.push({
          family: 'violation',
          title: `The ${kind.toUpperCase()} could not be generated`,
          body: err?.message ?? 'The server did not return a file.',
        })
      }
    } finally {
      setBusy(null)
    }
  }

  if (detail.loading && !d) {
    return (
      <div className="nn-admin-page flex flex-col gap-5">
        <Skeleton lines={3} className="max-w-md" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton lines={6} />
          <Skeleton lines={6} />
          <Skeleton lines={6} />
        </div>
        <Skeleton lines={6} />
      </div>
    )
  }

  if (!d) {
    return (
      <div className="nn-admin-page flex flex-col gap-5">
        <Button
          size="sm"
          variant="ghost"
          icon={ArrowLeft}
          onClick={() => navigate('/admin/inspections')}
        >
          Back to inspections
        </Button>
        <Card className="p-5 text-[13px] text-ink-2">
          The inspection could not be loaded.{' '}
          {detail.error?.message ?? 'No detail was returned.'}
        </Card>
      </div>
    )
  }

  return (
    <div className="nn-admin-page flex flex-col gap-5">
      {/* ---- Page header ---- */}
      <div>
        <Button
          size="sm"
          variant="ghost"
          icon={ArrowLeft}
          onClick={() => navigate('/admin/inspections')}
        >
          Back to inspections
        </Button>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Breadcrumb />
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">
              Inspection Details - {inspectionRef}
            </h1>
            <VerdictBadge verdict={displayVerdict} size="md" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={FileText}
            loading={busy === 'pdf'}
            disabled={busy != null}
            onClick={() => download('pdf')}
          >
            Download PDF
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Download}
            loading={busy === 'docx'}
            disabled={busy != null}
            onClick={() => download('docx')}
          >
            Download Word
          </Button>
        </div>
      </header>

      {/* ---- Three-column information area ---- */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InspectionInfoCard d={d} shop={shop} officer={officer} />
        <ProductInfoCard scan={scan} overallVerdict={displayVerdict} />
        <EvidencePhotosCard scan={scan} base="/admin" />
      </section>

      {/* ---- Statutory Rule Findings Callout Banner ---- */}
      <RuleFindingsBanner scan={scan} d={d} />

      {/* ---- Compliance checklist (8 rules) ---- */}
      <ComplianceChecklistTable scan={scan} />

      {/* ---- Inspector remarks form ---- */}
      <RemarksForm inspection={d} scan={scan} />
    </div>
  )
}
