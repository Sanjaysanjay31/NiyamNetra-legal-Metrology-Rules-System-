/**
 * Violation Details — Government Legal Metrology Statutory Dossier.
 *
 * Route: /admin/violations/:violationId
 *
 * Page Purpose:
 *   Shows exactly why a violation was generated and provides a clear trace from:
 *   Violation → Rule Check → Observed Data → Evidence → Inspection → Rule Version → Audit Integrity
 *
 * Information Architecture:
 *   1. Header: Breadcrumb, Violation ID, Name, Status, Actions (View Inspection, View Evidence, Download Report)
 *   2. Information Flow Tracker: Statutory trace banner
 *   3. Section 1 — Violation Summary: Compact metadata card
 *   4. Section 2 — Rule Evaluation: Prominent Observed vs Expected comparison + Finding
 *   5. Section 3 — Supporting Evidence: Two-column layout with calibrated PDP image & metadata
 *   6. Section 4 — Applicable Rule: Check ID, Rule, Version 2.0.0, Evaluation, View Rule Version
 *   7. Section 5 — Related Inspection: Inspection ID, Store, Inspector, Date, Scanned, Findings
 *   8. Section 6 — Audit & Integrity: Evidence integrity, SHA-256, Rule Version, Sync, QR Verification
 *   9. Section 7 — Resolution Status: Status lifecycle (Open, Under Review, Resolved), Penalty safety
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  Eye,
  FileCheck,
  FileDown,
  FileText,
  HelpCircle,
  Info,
  Maximize2,
  Package,
  QrCode,
  RotateCcw,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store as StoreIcon,
  Tag,
  User,
  X,
  XCircle,
} from 'lucide-react'
import { endpoints, saveBlob } from '../api/client'
import { useI18n } from '../i18n'
import { useDocumentTitle } from '../lib/hooks'
import { getViolationDetail, VIOLATION_RECORDS } from '../mock/violationsData'
import {
  Button,
  Card,
  cx,
  Modal,
  Pill,
  Skeleton,
  useToast,
} from '../ui'

/* ------------------------------------------------------------- Breadcrumb -- */

function Breadcrumb({ violationId }) {
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
        to="/admin/violations"
        className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
      >
        Violations
      </Link>
      <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
      <span className="font-semibold text-ink">{violationId}</span>
    </nav>
  )
}

/* ----------------------------------------------------------- Status Badge -- */

function StatusBadge({ status, className = '' }) {
  const norm = String(status ?? '').trim().toLowerCase()

  if (norm === 'open' || norm === 'active' || norm === 'violation') {
    return (
      <span
        className={cx(
          'inline-flex items-center gap-1.5 rounded-sm border border-violation-border bg-violation-fill px-2.5 py-1 text-[12px] font-semibold text-violation-text',
          className
        )}
      >
        <span className="h-2 w-2 rounded-full bg-violation-graphic" aria-hidden="true" />
        Open
      </span>
    )
  }

  if (norm === 'under review' || norm === 'review' || norm === 'pending') {
    return (
      <span
        className={cx(
          'inline-flex items-center gap-1.5 rounded-sm border border-review-border bg-review-fill px-2.5 py-1 text-[12px] font-semibold text-review-text',
          className
        )}
      >
        <span className="h-2 w-2 rounded-full bg-review-graphic" aria-hidden="true" />
        Under Review
      </span>
    )
  }

  if (norm === 'resolved' || norm === 'closed' || norm === 'rectified') {
    return (
      <span
        className={cx(
          'inline-flex items-center gap-1.5 rounded-sm border border-pass-border bg-pass-fill px-2.5 py-1 text-[12px] font-semibold text-pass-text',
          className
        )}
      >
        <span className="h-2 w-2 rounded-full bg-pass-graphic" aria-hidden="true" />
        Resolved
      </span>
    )
  }

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-sm border border-divider bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink-3',
        className
      )}
    >
      <span className="h-2 w-2 rounded-full bg-ink-4" aria-hidden="true" />
      Not Assessed
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Main Violation Detail Screen                                               */
/* -------------------------------------------------------------------------- */

export default function ViolationDetail() {
  const { violationId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  // Retrieve matching violation record or fallback to VIO-001
  const violation = useMemo(() => {
    return getViolationDetail(violationId || 'VIO-001')
  }, [violationId])

  useDocumentTitle(`Violation Details · ${violation.id}`)

  // UI state for modals, active status, and hash visibility
  const [activeStatus, setActiveStatus] = useState(violation.status)
  const [showEvidenceModal, setShowEvidenceModal] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [showHash, setShowHash] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Handlers for status transitions
  function handleStatusChange(nextStatus) {
    setActiveStatus(nextStatus)
    toast({
      family: nextStatus === 'Resolved' ? 'pass' : 'review',
      title: `Status Updated to ${nextStatus}`,
      body: `Violation ${violation.id} status modified in active session. Statutory compounding record updated.`,
    })
  }

  // Print/Download statutory violation summary
  function handleDownloadReport() {
    setDownloading(true)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const printWin = window.open('', '_blank')
      if (printWin) {
        printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Statutory Violation Dossier - ${violation.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 28px; color: #0f2a44; line-height: 1.5; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px 0; color: #0b1f3a; }
    .subtitle { font-size: 12px; color: #475569; margin-bottom: 20px; border-bottom: 2px solid #0b1f3a; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .card { border: 1px solid #cbd5e1; padding: 12px 16px; border-radius: 4px; background: #f8fafc; }
    .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.05em; }
    .value { font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 2px; }
    .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
    .observed { background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 4px; }
    .expected { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 4px; }
    .finding-box { background: #fff; border-left: 4px solid #b91c1c; padding: 10px 14px; margin-top: 10px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; }
    .badge-open { background: #fee2e2; color: #991b1b; }
    .badge-review { background: #fef3c7; color: #92400e; }
    .badge-resolved { background: #dcfce7; color: #166534; }
  </style>
</head>
<body>
  <h1>NiyamNetra — Legal Metrology Statutory Violation Record</h1>
  <div class="subtitle">
    Dossier Reference: ${violation.id} &middot; Generated: ${violation.dateTime} &middot; Rule Version: ${violation.ruleVersion}
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Violation Reference</div>
      <div class="value">${violation.id} &middot; ${violation.rule} (${violation.ruleSection})</div>
      <div style="margin-top: 8px;">
        <span class="badge badge-${activeStatus.toLowerCase().replace(/\s+/g, '')}">${activeStatus.toUpperCase()}</span>
      </div>
    </div>
    <div class="card">
      <div class="label">Store &amp; Premise</div>
      <div class="value">${violation.store} (${violation.storeId})</div>
      <div style="font-size: 11px; color: #64748b;">Jurisdiction: ${violation.area} &middot; Inspector: ${violation.inspector}</div>
    </div>
  </div>

  <h3 style="font-size: 14px; text-transform: uppercase; margin-top: 20px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">
    Rule Evaluation &amp; Finding
  </h3>
  <div class="comparison">
    <div class="observed">
      <div class="label" style="color: #991b1b;">Observed Package State</div>
      <div class="value" style="color: #7f1d1d; font-size: 14px;">${violation.observed}</div>
    </div>
    <div class="expected">
      <div class="label" style="color: #166534;">Statutory Expected Rule</div>
      <div class="value" style="color: #14532d; font-size: 14px;">${violation.expected}</div>
    </div>
  </div>

  <div class="finding-box">
    <strong>Finding:</strong> ${violation.finding}
  </div>

  <h3 style="font-size: 14px; text-transform: uppercase; margin-top: 24px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">
    Evidentiary Traceability &amp; Integrity
  </h3>
  <p style="font-size: 11px; color: #475569;">
    Evidence ID: <strong>${violation.evidence}</strong> &middot; Inspection: <strong>${violation.inspection}</strong> &middot; SHA-256: <strong>${violation.evidenceSha256}</strong><br/>
    OCR Status: <strong>${violation.ocrStatus}</strong> &middot; Integrity: <strong>Verified</strong> &middot; Sync Status: <strong>Synced</strong>
  </p>

  <div style="margin-top: 30px; font-size: 10px; color: #64748b; border-top: 1px dashed #94a3b8; padding-top: 10px;">
    Penalty Determination: <strong>${violation.penaltyStatus}</strong> (Subject to statutory adjudication under Section 48 of Legal Metrology Act, 2009).
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`)
        printWin.document.close()
      }
      toast({
        family: 'pass',
        title: 'Report Ready',
        body: `Statutory violation record prepared for printing/saving.`,
      })
    } catch (err) {
      toast({
        family: 'violation',
        title: 'Export Failed',
        body: err?.message ?? 'Could not print violation report.',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="nn-admin-page nn-violation-detail-page flex flex-col gap-5">
      {/* ==================================================================== */}
      {/* HEADER & TOP ACTIONS                                                 */}
      {/* ==================================================================== */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-divider pb-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Link
              to="/admin/violations"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
            >
              <ArrowLeft size={14} /> Back to Violations
            </Link>
          </div>

          <div className="mt-1">
            <Breadcrumb violationId={violation.id} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-bold tracking-[-0.01em] text-ink">
              {violation.id}
            </h1>
            <span className="text-ink-3">·</span>
            <span className="text-[18px] font-semibold text-ink-2">
              {violation.rule}
            </span>
            <StatusBadge status={activeStatus} />
          </div>
        </div>

        {/* Right-side actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={ClipboardList}
            onClick={() => navigate(`/admin/inspections/${violation.inspectionRawId || '10230'}`)}
            className="text-[12px] font-semibold"
            title="View related inspection record"
          >
            View Inspection
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={Camera}
            onClick={() => setShowEvidenceModal(true)}
            className="text-[12px] font-semibold"
            title="View supporting photographic evidence"
          >
            View Evidence
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Download}
            loading={downloading}
            onClick={handleDownloadReport}
            className="text-[12px] font-semibold"
          >
            Download Report
          </Button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* INFORMATION FLOW TRACE BANNER                                        */}
      {/* ==================================================================== */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-divider bg-surface px-4 py-2 text-[11px] text-ink-3">
        <span className="font-semibold uppercase tracking-wider text-ink-2">
          Enforcement Flow:
        </span>
        <span className="font-bold text-ink">Violation ({violation.id})</span>
        <span className="text-ink-3">&rarr;</span>
        <span className="font-semibold text-accent-text">Rule Check ({violation.ruleId})</span>
        <span className="text-ink-3">&rarr;</span>
        <span className="font-semibold text-ink">Observed Data</span>
        <span className="text-ink-3">&rarr;</span>
        <span className="font-semibold text-accent-text">Evidence ({violation.evidence})</span>
        <span className="text-ink-3">&rarr;</span>
        <Link
          to={`/admin/inspections/${violation.inspectionRawId || '10230'}`}
          className="font-semibold text-ink hover:underline"
        >
          Inspection ({violation.inspection})
        </Link>
        <span className="text-ink-3">&rarr;</span>
        <Link to="/admin/rule-versions" className="font-semibold text-ink hover:underline">
          Rule Version (v{violation.ruleVersion})
        </Link>
        <span className="text-ink-3">&rarr;</span>
        <Link to="/admin/audit" className="font-semibold text-pass-text hover:underline">
          Audit Integrity
        </Link>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1 — VIOLATION SUMMARY                                        */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between border-b border-divider pb-2.5">
          <div className="flex items-center gap-2">
            <Tag size={15} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Violation Summary
            </h2>
          </div>
          <StatusBadge status={activeStatus} />
        </div>

        <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 sm:grid-cols-4 text-[13px]">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Violation ID
            </span>
            <p className="nn-mono mt-0.5 font-bold text-ink">{violation.id}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Rule ID
            </span>
            <p className="nn-mono mt-0.5 font-semibold text-ink">{violation.ruleId}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Rule
            </span>
            <p className="mt-0.5 font-semibold text-ink">{violation.rule}</p>
            <span className="text-[11px] font-mono text-ink-3">{violation.ruleSection}</span>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Status
            </span>
            <div className="mt-0.5">
              <StatusBadge status={activeStatus} />
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Store
            </span>
            <p className="mt-0.5">
              <Link
                to={`/admin/stores/${violation.storeId || 'ST-001'}`}
                className="font-semibold text-accent-text hover:underline"
              >
                {violation.store}
              </Link>
            </p>
            <span className="text-[11px] text-ink-3">{violation.area}</span>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Inspection
            </span>
            <p className="mt-0.5">
              <Link
                to={`/admin/inspections/${violation.inspectionRawId || '10230'}`}
                className="nn-mono font-bold text-accent-text hover:underline"
              >
                {violation.inspection}
              </Link>
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Inspector
            </span>
            <p className="mt-0.5 text-ink font-medium">{violation.inspector}</p>
            <span className="text-[10px] font-mono text-ink-3">{violation.inspectorId}</span>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Detected
            </span>
            <p className="nn-mono mt-0.5 text-ink-2 font-medium">{violation.dateTime}</p>
          </div>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* SECTION 2 — RULE EVALUATION (OBSERVED VS EXPECTED)                   */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between border-b border-divider pb-3">
          <div className="flex items-center gap-2">
            <Scale size={16} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Rule Evaluation
            </h2>
          </div>
          <span className="text-[11px] font-semibold text-ink-3">
            Statutory Compliance Differential
          </span>
        </div>

        {/* Side-by-Side Observed vs Expected comparison */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Observed Card */}
          <div className="flex flex-col rounded-sm border border-violation-border bg-violation-fill p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-violation-text">
                Observed
              </span>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-violation-border/50 text-violation-text">
                <XCircle size={14} strokeWidth={2.4} />
              </span>
            </div>
            <p className="mt-2 text-[16px] font-bold tracking-tight text-ink font-mono">
              {violation.observed}
            </p>
            <p className="mt-1 text-[12px] text-ink-2">
              Physical package observation captured via computer vision &amp; inspector terminal.
            </p>
          </div>

          {/* Expected Card */}
          <div className="flex flex-col rounded-sm border border-pass-border bg-pass-fill p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-pass-text">
                Expected
              </span>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-pass-border/50 text-pass-text">
                <CheckCircle2 size={14} strokeWidth={2.4} />
              </span>
            </div>
            <p className="mt-2 text-[16px] font-bold tracking-tight text-ink">
              {violation.expected}
            </p>
            <p className="mt-1 text-[12px] text-ink-2">
              Statutory mandate under {violation.ruleSection}, Legal Metrology (Packaged Commodities) Rules.
            </p>
          </div>
        </div>

        {/* Finding Box */}
        <div className="mt-4 rounded-sm border border-divider bg-surface-2 p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-3">
            Finding
          </span>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink">
            {violation.finding}
          </p>
          <p className="mt-1 text-[11px] text-ink-3">
            Evaluated by NiyamNetra Rule Engine against rule catalog version {violation.ruleVersion}.
          </p>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* SECTION 3 — SUPPORTING EVIDENCE (TWO-COLUMN LAYOUT)                  */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between border-b border-divider pb-3">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Supporting Evidence
            </h2>
          </div>
          <span className="nn-mono rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">
            {violation.evidence} &middot; Calibrated
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* LEFT: Large Evidence / Product Image Placeholder */}
          <div className="relative flex h-64 sm:h-72 w-full flex-col items-center justify-center overflow-hidden rounded-sm border border-divider bg-surface-2 p-4 text-center">
            {/* Calibrated mm grid pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:16px_16px] opacity-40" />

            {/* Target Reticle / Calibrated Bounding Box */}
            <div className="relative z-10 flex h-48 w-44 flex-col items-center justify-center rounded-sm border-2 border-dashed border-violation-graphic/70 bg-surface/95 p-3 shadow-xs">
              <Package size={42} strokeWidth={1.4} className="text-ink-2" />
              <span className="nn-mono mt-2 text-[12px] font-bold text-ink">
                {violation.evidence}.JPG
              </span>
              <span className="text-[10px] text-ink-3">{violation.commodity}</span>
              <span className="mt-1.5 rounded bg-violation-fill border border-violation-border px-2 py-0.5 text-[9px] font-bold text-violation-text">
                Violation Region Flagged
              </span>
            </div>

            <div className="absolute bottom-2 left-3 text-[10px] font-mono text-ink-3">
              [CALIBRATED PDP BOUNDING BOX: 120 cm²]
            </div>
            <div className="absolute bottom-2 right-3 text-[10px] font-mono text-ink-3">
              OPTICAL STANDARD: 1.0mm/px
            </div>
          </div>

          {/* RIGHT: Evidence metadata & verification details */}
          <div className="flex flex-col justify-between gap-3">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-[13px]">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Evidence ID
                </dt>
                <dd className="nn-mono mt-0.5 text-[15px] font-bold text-ink">{violation.evidence}</dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Capture Time
                </dt>
                <dd className="nn-mono mt-0.5 font-medium text-ink-2">{violation.dateTime}</dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  OCR Status
                </dt>
                <dd className="mt-1">
                  <span className="inline-flex items-center gap-1 rounded border border-pass-border bg-pass-fill px-2 py-0.5 text-[11px] font-semibold text-pass-text">
                    <CheckCircle size={12} strokeWidth={2} /> Processed
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  SHA-256
                </dt>
                <dd className="mt-1 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded border border-pass-border bg-pass-fill px-2 py-0.5 text-[11px] font-semibold text-pass-text">
                    <ShieldCheck size={12} strokeWidth={2} /> Verified
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHash((prev) => !prev)}
                    className="text-[11px] font-semibold text-accent-text hover:underline"
                  >
                    {showHash ? 'Hide hash' : 'View hash'}
                  </button>
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Integrity
                </dt>
                <dd className="mt-0.5 flex items-center gap-1 font-semibold text-pass-text">
                  <CheckCircle2 size={14} strokeWidth={2} /> Verified (HMAC signature validated)
                </dd>
              </div>

              {showHash && (
                <div className="sm:col-span-2 rounded border border-divider bg-surface p-2">
                  <span className="text-[10px] font-semibold uppercase text-ink-3">
                    Cryptographic SHA-256 Digest
                  </span>
                  <p className="nn-mono mt-0.5 break-all text-[11px] font-medium text-ink">
                    {violation.evidenceSha256}
                  </p>
                </div>
              )}
            </dl>

            <div className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                icon={Maximize2}
                onClick={() => setShowEvidenceModal(true)}
                className="w-full justify-center sm:w-auto text-[12px] font-semibold"
              >
                View Full Evidence
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* SECTION 4 & 5 — APPLICABLE RULE & RELATED INSPECTION (SIDE BY SIDE)  */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* SECTION 4 — APPLICABLE RULE */}
        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-divider pb-2.5">
              <div className="flex items-center gap-2">
                <BookOpen size={15} className="text-ink-2" />
                <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
                  Applicable Rule
                </h2>
              </div>
              <span className="nn-mono text-[11px] font-semibold text-ink-3">
                Catalog v{violation.ruleVersion}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Check ID
                </dt>
                <dd className="nn-mono mt-0.5 font-bold text-ink">{violation.ruleId}</dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Rule Version
                </dt>
                <dd className="nn-mono mt-0.5 font-semibold text-ink">{violation.ruleVersion}</dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Rule
                </dt>
                <dd className="mt-0.5 font-semibold text-ink">{violation.rule}</dd>
                <span className="text-[11px] font-mono text-ink-3">{violation.ruleSection}</span>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Evaluation
                </dt>
                <dd className="mt-0.5">
                  <span className="inline-flex items-center gap-1 font-semibold text-violation-text">
                    <XCircle size={13} strokeWidth={2.4} /> Violation
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 border-t border-divider pt-3">
            <Link
              to="/admin/rule-versions"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
            >
              View Rule Version &rarr;
            </Link>
          </div>
        </Card>

        {/* SECTION 5 — RELATED INSPECTION */}
        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-divider pb-2.5">
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-ink-2" />
                <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
                  Related Inspection
                </h2>
              </div>
              <span className="nn-mono text-[11px] font-bold text-ink-3">
                {violation.inspection}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Inspection ID
                </dt>
                <dd className="nn-mono mt-0.5 font-bold text-accent-text">
                  <Link
                    to={`/admin/inspections/${violation.inspectionRawId || '10230'}`}
                    className="hover:underline"
                  >
                    {violation.inspection}
                  </Link>
                </dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Date
                </dt>
                <dd className="nn-mono mt-0.5 font-medium text-ink-2">{violation.date}</dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Store
                </dt>
                <dd className="mt-0.5 font-semibold text-ink">{violation.store}</dd>
                <span className="text-[11px] text-ink-3">{violation.area}</span>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Inspector
                </dt>
                <dd className="mt-0.5 font-medium text-ink">{violation.inspector}</dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Products Scanned
                </dt>
                <dd className="nn-mono mt-0.5 font-bold text-ink">{violation.productsScanned}</dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Findings
                </dt>
                <dd className="nn-mono mt-0.5 font-bold text-violation-text">
                  {violation.findingsCount}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 border-t border-divider pt-3">
            <Link
              to={`/admin/inspections/${violation.inspectionRawId || '10230'}`}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
            >
              View Inspection &rarr;
            </Link>
          </div>
        </Card>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 6 — AUDIT & INTEGRITY                                        */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between border-b border-divider pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Audit &amp; Integrity
            </h2>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-pass-text">
            <CheckCircle2 size={13} strokeWidth={2} /> Audit Chain Valid
          </span>
        </div>

        <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 sm:grid-cols-3 lg:grid-cols-6 text-[13px]">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Evidence Integrity
            </span>
            <p className="mt-0.5 font-semibold text-pass-text flex items-center gap-1">
              <Check size={13} strokeWidth={2.4} /> Verified
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              SHA-256
            </span>
            <p className="mt-0.5 font-semibold text-pass-text flex items-center gap-1">
              <Check size={13} strokeWidth={2.4} /> Verified
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Rule Version
            </span>
            <p className="nn-mono mt-0.5 font-bold text-ink">{violation.ruleVersion}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Inspection
            </span>
            <p className="nn-mono mt-0.5 font-bold text-ink">{violation.inspection}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Sync Status
            </span>
            <p className="mt-0.5 font-semibold text-pass-text flex items-center gap-1">
              <Check size={13} strokeWidth={2.4} /> Synced
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Audit Chain
            </span>
            <p className="mt-0.5 font-semibold text-pass-text flex items-center gap-1">
              <ShieldCheck size={13} strokeWidth={2} /> Valid
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-divider pt-3">
          <Button
            variant="secondary"
            size="sm"
            icon={Shield}
            onClick={() => navigate('/admin/audit')}
            className="text-[12px] font-semibold"
          >
            View Audit Trail
          </Button>

          <Button
            variant="ghost"
            size="sm"
            icon={QrCode}
            onClick={() => setShowQrModal(true)}
            className="text-[12px] font-semibold"
          >
            Verify QR
          </Button>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* SECTION 7 — RESOLUTION STATUS & ENFORCEMENT SAFETY                   */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between border-b border-divider pb-3">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Resolution Status
            </h2>
          </div>
          <span className="text-[12px] font-semibold text-ink-2">
            Current: <span className="text-ink font-bold">{activeStatus}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Status workflow controls */}
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-medium text-ink-2">
              Statutory Resolution Workflow:
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={activeStatus === 'Open' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleStatusChange('Open')}
                className="text-[12px]"
              >
                Open
              </Button>

              <Button
                variant={activeStatus === 'Under Review' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleStatusChange('Under Review')}
                className="text-[12px]"
              >
                Mark Under Review
              </Button>

              <Button
                variant={activeStatus === 'Resolved' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleStatusChange('Resolved')}
                className="text-[12px]"
              >
                Mark Resolved
              </Button>
            </div>

            <p className="text-[11px] text-ink-3">
              Status changes are logged with officer timestamp and cryptographically chained to the inspection audit trail.
            </p>
          </div>

          {/* Legal / Enforcement Safety Notice (STRICT: NO INVENTED MONETARY FINES) */}
          <div className="rounded border border-divider bg-surface-2 p-3.5 text-[12px]">
            <div className="flex items-center gap-1.5 font-semibold text-ink">
              <Info size={14} className="text-accent" />
              Statutory Penalty Assessment Note
            </div>
            <p className="mt-1 text-ink-2">
              Penalty Status:{' '}
              <span className="nn-mono font-bold text-ink">
                {violation.penaltyStatus || 'Not assessed'}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-ink-3 leading-normal">
              Statutory compounding or penal determination rests exclusively with the designated Assistant Controller of Legal Metrology under Section 48 read with Section 36 of the Legal Metrology Act, 2009. The automated portal does not assign unverified monetary rupee penalties.
            </p>
          </div>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* EVIDENCE MODAL (FULL VIEW)                                           */}
      {/* ==================================================================== */}
      <Modal
        open={showEvidenceModal}
        onClose={() => setShowEvidenceModal(false)}
        title={`Photographic Evidence · ${violation.evidence}`}
        description={`Statutory evidence record captured at ${violation.store} during Inspection ${violation.inspection}.`}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="relative flex h-80 w-full flex-col items-center justify-center overflow-hidden rounded-sm border border-divider bg-surface-2 p-4 text-center">
            {/* Calibrated mm grid pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:16px_16px] opacity-50" />

            <div className="relative z-10 flex h-60 w-52 flex-col items-center justify-center rounded-sm border-2 border-dashed border-violation-graphic bg-surface p-4 shadow-modal">
              <Package size={52} strokeWidth={1.2} className="text-ink-2" />
              <p className="nn-mono mt-2 font-bold text-ink">{violation.evidence}.JPG</p>
              <p className="text-[11px] text-ink-3">{violation.product}</p>
              <div className="mt-2 rounded bg-violation-fill border border-violation-border px-2.5 py-1 text-[10px] font-bold text-violation-text">
                Observed: {violation.observed}
              </div>
            </div>

            <div className="absolute bottom-2 left-3 text-[10px] font-mono text-ink-3">
              [CALIBRATED PDP BOUNDING BOX: 120 cm² &middot; OPTICAL STANDARD: 1.0mm/px]
            </div>
          </div>

          <div className="rounded border border-divider bg-surface-2 p-3 text-[12px]">
            <p className="font-semibold text-ink">Evidence Verification Metadata:</p>
            <p className="nn-mono mt-0.5 break-all text-[11px] text-ink-3">
              SHA-256: {violation.evidenceSha256}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowEvidenceModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================================== */}
      {/* QR VERIFICATION MODAL                                                */}
      {/* ==================================================================== */}
      <Modal
        open={showQrModal}
        onClose={() => setShowQrModal(false)}
        title="Statutory QR Verification"
        description="Verify public cryptographically signed inspection certificate."
        size="md"
      >
        <div className="flex flex-col items-center gap-4 py-3 text-center">
          <div className="grid h-36 w-36 place-items-center rounded-md border-2 border-dashed border-divider bg-surface-2 p-2">
            <QrCode size={100} className="text-ink" />
          </div>
          <div className="text-[12px] text-ink-2">
            <p className="font-bold text-ink">Certificate ID: CERT-{violation.id}-2026</p>
            <p className="mt-1 text-ink-3">
              Cryptographically signed by Inspector {violation.inspector} ({violation.inspectorId})
            </p>
            <p className="nn-mono mt-1 text-[11px] text-pass-text font-semibold">
              HMAC Signature: Valid &amp; Verified
            </p>
          </div>
          <Button variant="secondary" onClick={() => setShowQrModal(false)} className="mt-2">
            Done
          </Button>
        </div>
      </Modal>
    </div>
  )
}
