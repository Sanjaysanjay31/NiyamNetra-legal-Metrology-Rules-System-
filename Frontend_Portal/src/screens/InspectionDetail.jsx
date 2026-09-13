/**
 * Inspection Details — Government Legal Metrology Statutory Record.
 *
 * Destination for administrators viewing visit records from `/admin/inspections`.
 * Provides the complete 8-section evidence-backed regulatory review:
 *   1. Inspection Overview (summary, IDs, status badges)
 *   2. Store Information (compact shop record)
 *   3. Inspection Result (prominent NON-COMPLIANT verdict & counts)
 *   4. Findings / Rule Checks (complete 19-check expandable statutory table)
 *   5. Evidence (IMG-001 item card, SHA-256 verified, OCR processed)
 *   6. Extracted Information (collapsible secondary OCR data)
 *   7. Audit & Integrity (SHA-256, rule version 2.0.0, audit chain)
 *   8. Actions (Back, Download Report, View Audit Trail)
 *
 * Evidentiary workflow relationship:
 *   Inspection → Rule Checks / Findings → Evidence → OCR Data → Rule Version → Audit Integrity
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Eye,
  FileCheck,
  FileDown,
  FileText,
  Filter,
  HelpCircle,
  Info,
  Layers,
  MapPin,
  Maximize2,
  MinusCircle,
  Package,
  QrCode,
  Search,
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
import { useDocumentTitle, useResource } from '../lib/hooks'
import { storesById, usersById } from '../mock/fixtures'
import { getInspectionDetail } from '../mock/inspectionsData'
import {
  Button,
  Card,
  cx,
  InspectionStatusBadge,
  Modal,
  Pill,
  Select,
  Skeleton,
  SyncBadge,
  useToast,
  VerdictBadge,
} from '../ui'

/* -------------------------------------------------------------------------- */
/* 1. Complete 19 Statutory Legal Metrology Checks Catalog                     */
/* -------------------------------------------------------------------------- */

const RULE_CHECKS_19 = [
  {
    id: 'CHK01',
    name: 'Net Quantity Declaration',
    rule: 'Rule 6(1)(c), Legal Metrology (Packaged Commodities) Rules, 2011',
    status: 'Compliant',
    observed: '50 g declared on Principal Display Panel',
    expected: 'Unambiguous net quantity declaration on PDP',
    reason: 'Statutory net quantity declaration is clearly and prominently declared in permissible location.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK02',
    name: 'Unit of Measurement',
    rule: 'Rules 12–13 read with First Schedule',
    status: 'Compliant',
    observed: "'g' (grams) - Standard SI symbol",
    expected: 'Prescribed SI units only (g, kg, ml, l) with correct symbols',
    reason: "Unit symbol 'g' conforms to statutory standard units with no prohibited abbreviations or qualifiers.",
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK03',
    name: 'MRP Declaration',
    rule: 'Rule 6(1)(e) read with Rule 2(m)',
    status: 'Violation',
    observed: '₹20.00 sticker affixed over original printed ₹18.00 declaration',
    expected: 'Unobscured printed retail price inclusive of all taxes; no price alteration',
    reason: 'Retail sale price sticker affixed over original printed MRP declaration. Altering declared price upwards violates Rule 6(1)(e) and Rule 6(4A).',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK04',
    name: 'Manufacturer Details',
    rule: 'Rule 6(1)(a) and Rule 6(1)(b)',
    status: 'Compliant',
    observed: 'XYZ Foods Pvt Ltd, Survey No. 14, MIDC, Pune, Maharashtra 411019',
    expected: 'Complete legal name and full postal address including PIN code',
    reason: 'Manufacturer entity name, factory address, and valid postal index number are fully verified.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK05',
    name: 'Consumer Care Details',
    rule: 'Rule 6(1)(g) and Rule 6(1)(ga)',
    status: 'Violation',
    observed: 'Telephone (1800-103-2255) provided; missing postal address for consumer grievances',
    expected: 'Name, address, telephone number and email address of person/office to be contacted',
    reason: 'Mandatory postal contact address omitted from grievance redressal declaration in contravention of Rule 6(1)(g).',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK06',
    name: 'Numeral & Character Font Height',
    rule: 'Rule 7(2) read with Table-I',
    status: 'Violation',
    observed: '1.12 mm measured character height (Area of PDP: 78 cm²)',
    expected: 'Minimum 1.50 mm height required for display panel area between 50 cm² and 100 cm²',
    reason: 'Measured numeral height 1.12 mm fails the statutory 1.50 mm minimum required by Table-I substituted w.e.f. 01.01.2018.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK07',
    name: 'Character Width Ratio',
    rule: 'Rule 7(3), Legal Metrology Rules',
    status: 'Compliant',
    observed: 'Width-to-height ratio: 0.44 (exceeds 0.33 limit)',
    expected: 'Character width must be at least one-third (33.3%) of character height',
    reason: 'Font width satisfies statutory proportion requirements across all declared numerals.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK08',
    name: 'Conspicuous Background Contrast',
    rule: 'Rule 9, Conspicuous Display',
    status: 'Compliant',
    observed: 'Contrast ratio 7.4:1 (black text on high-contrast panel)',
    expected: 'Declarations must contrast conspicuously with package background color',
    reason: 'Text is clearly visible and legible with no interference from graphic art or patterns.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK09',
    name: 'Clear Space Around Net Quantity',
    rule: 'Rule 8, Declaration Placement',
    status: 'Compliant',
    observed: 'Surrounding clear space measured at 2.4 mm (exceeds 1.5 mm minimum)',
    expected: 'Free space equal to at least character height above and below, two character widths to sides',
    reason: 'Adequate unobstructed breathing margin maintained around net quantity figures.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK10',
    name: 'Standard Pack Size Denomination',
    rule: 'Rule 5 read with Second Schedule',
    status: 'Compliant',
    observed: '50 g (Permissible increment)',
    expected: 'Net quantity must conform to Second Schedule standard denominations where applicable',
    reason: 'Packaged commodity weight matches permissible retail distribution bracket.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK11',
    name: 'Sticker & Correction Restrictions',
    rule: 'Rule 6(3) and Rule 6(4A)',
    status: 'Violation',
    observed: 'Adhesive sticker applied over printed declaration',
    expected: 'No sticker permitted unless issued under central government exemption or to reduce price',
    reason: 'Unlawful sticker found on retail package altering mandatory declarations.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK12',
    name: 'Country of Origin Declaration',
    rule: 'Rule 6(1)(aa)',
    status: 'Compliant',
    observed: "'Country of Origin: India' explicitly printed",
    expected: 'Country of origin must be declared on package or domestic manufacture established',
    reason: 'Declaration verified on back panel.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK13',
    name: 'Month & Year of Manufacture / Packing',
    rule: 'Rule 6(1)(d)',
    status: 'Compliant',
    observed: "'Pkd: 08/2026' (August 2026)",
    expected: 'Month and year of packing or manufacturing in statutory MM/YYYY format',
    reason: 'Packing date printed in statutory format and fully legible.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK14',
    name: 'Best Before / Use By Period',
    rule: 'Rule 6(1)(da)',
    status: 'Compliant',
    observed: "'Best Before 6 Months from Packaging'",
    expected: 'Best before or use by period declared for perishable commodities',
    reason: 'Expiry timeframe declared in compliance with commodity durability requirements.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK15',
    name: 'Batch or Lot Number Identification',
    rule: 'Rule 6(1)(h)',
    status: 'Compliant',
    observed: "Batch No: 'TSC-26-08-1142'",
    expected: 'Batch or lot number enabling traceback to production run',
    reason: 'Traceable batch code present on crimp seal.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK16',
    name: 'Prohibited Qualifiers in Quantity',
    rule: 'Rule 13, Prohibited Terms',
    status: 'Compliant',
    observed: "'50 g' with no preceding or following qualifiers",
    expected: "Strictly no words like 'approximately', 'approx', 'when packed', or 'minimum'",
    reason: 'Net quantity stated as absolute measurement without misleading qualifying phrases.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK17',
    name: 'Common or Generic Commodity Name',
    rule: 'Rule 6(1)(b)',
    status: 'Compliant',
    observed: "'Potato Chips - Salted'",
    expected: 'Common or generic name of commodity declared on Principal Display Panel',
    reason: 'Generic commodity nomenclature clearly identifies package contents.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK18',
    name: 'E-Commerce / Digital Listing Compliance',
    rule: 'Rule 6(10) and Rule 6(10A)',
    status: 'Out of Scope',
    observed: 'Physical retail marketplace inspection',
    expected: 'Digital platform listing duties apply only to electronic marketplace sales',
    reason: 'Inspection conducted at physical retail premise; e-commerce requirements do not apply.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK19',
    name: 'Graduated Enforcement Penalty Assessment',
    rule: 'Section 36(1), Legal Metrology Act, 2009',
    status: 'Not Assessed',
    observed: '3 Statutory Violations Recorded for Enforcement Review',
    expected: 'Compounding or statutory prosecution determination under Section 48',
    reason: 'Adjudication penalty tier is determined by Assistant Controller after notice period.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
]

/* -------------------------------------------------------------------------- */
/* 2. Status Badge Helpers                                                    */
/* -------------------------------------------------------------------------- */

function StatusBadge({ status, className = '' }) {
  const norm = String(status || '').toLowerCase()
  if (norm === 'compliant' || norm === 'pass') {
    return (
      <span
        className={cx(
          'inline-flex items-center gap-1 rounded-sm border border-pass-border bg-pass-fill px-2 py-0.5 text-[11px] font-semibold text-pass-text',
          className
        )}
      >
        <CheckCircle2 size={12} strokeWidth={2.4} aria-hidden="true" />
        Compliant
      </span>
    )
  }
  if (norm === 'violation' || norm === 'fail') {
    return (
      <span
        className={cx(
          'inline-flex items-center gap-1 rounded-sm border border-violation-border bg-violation-fill px-2 py-0.5 text-[11px] font-semibold text-violation-text',
          className
        )}
      >
        <XCircle size={12} strokeWidth={2.4} aria-hidden="true" />
        Violation
      </span>
    )
  }
  if (norm === 'not assessed' || norm === 'not_assessed') {
    return (
      <span
        className={cx(
          'inline-flex items-center gap-1 rounded-sm border border-review-border bg-review-fill px-2 py-0.5 text-[11px] font-semibold text-review-text',
          className
        )}
      >
        <Clock size={12} strokeWidth={2.4} aria-hidden="true" />
        Not Assessed
      </span>
    )
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-sm border border-divider bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3',
        className
      )}
    >
      <MinusCircle size={12} strokeWidth={2.4} aria-hidden="true" />
      Out of Scope
    </span>
  )
}

function SimpleBadge({ label, variant = 'neutral' }) {
  const styles = {
    neutral: 'bg-surface-2 border-divider text-ink-2',
    pass: 'bg-pass-fill border-pass-border text-pass-text',
    violation: 'bg-violation-fill border-violation-border text-violation-text',
    navy: 'bg-[#0f2a44]/10 border-[#0f2a44]/20 text-[#0f2a44]',
    synced: 'bg-pass-fill border-pass-border text-pass-text',
  }[variant] ?? 'bg-surface-2 border-divider text-ink-2'

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-mono font-medium uppercase tracking-wider',
        styles
      )}
    >
      {label}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* 3. Main InspectionDetail Screen Component                                  */
/* -------------------------------------------------------------------------- */

export default function InspectionDetail() {
  const { id } = useParams()
  const { t } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()

  const inspectionRefId = id ? (id.startsWith('INS-') ? id : `INS-${id}`) : 'INS-10230'
  useDocumentTitle(`Inspection Details · ${inspectionRefId}`)

  // Retrieve matching mock data record (or fallback to Sri Stores INS-10230)
  const mockRecord = useMemo(() => getInspectionDetail(id ? String(id).replace('INS-', '') : 10230), [id])

  // UI state for expandable findings & collapsible sections
  const [expandedChecks, setExpandedChecks] = useState(() => new Set(['CHK03', 'CHK05', 'CHK06']))
  const [findingFilter, setFindingFilter] = useState('all') // all | violations | compliant | other
  const [searchQuery, setSearchQuery] = useState('')
  const [extractedOpen, setExtractedOpen] = useState(true)
  const [showEvidenceModal, setShowEvidenceModal] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)

  // Toggle single check expansion
  function toggleCheck(checkId) {
    setExpandedChecks((prev) => {
      const next = new Set(prev)
      if (next.has(checkId)) next.delete(checkId)
      else next.add(checkId)
      return next
    })
  }

  // Toggle all checks
  function toggleAllChecks() {
    if (expandedChecks.size === RULE_CHECKS_19.length) {
      setExpandedChecks(new Set())
    } else {
      setExpandedChecks(new Set(RULE_CHECKS_19.map((c) => c.id)))
    }
  }

  // Filtered checks list
  const filteredChecks = useMemo(() => {
    return RULE_CHECKS_19.filter((check) => {
      if (findingFilter === 'violations' && check.status !== 'Violation') return false
      if (findingFilter === 'compliant' && check.status !== 'Compliant') return false
      if (findingFilter === 'other' && check.status !== 'Not Assessed' && check.status !== 'Out of Scope') return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          check.id.toLowerCase().includes(q) ||
          check.name.toLowerCase().includes(q) ||
          check.rule.toLowerCase().includes(q) ||
          check.observed.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [findingFilter, searchQuery])

  // Summary counts
  const summaryCounts = useMemo(() => {
    const total = RULE_CHECKS_19.length
    const violations = RULE_CHECKS_19.filter((c) => c.status === 'Violation').length
    const compliant = RULE_CHECKS_19.filter((c) => c.status === 'Compliant').length
    const notAssessed = RULE_CHECKS_19.filter((c) => c.status === 'Not Assessed').length
    const outOfScope = RULE_CHECKS_19.filter((c) => c.status === 'Out of Scope').length
    return { total, violations, compliant, notAssessed, outOfScope }
  }, [])

  // Action handlers
  function handleDownloadReport() {
    setDownloadingReport(true)
    setTimeout(() => {
      setDownloadingReport(false)
      window.print()
      toast.push({
        family: 'pass',
        title: 'Inspection Report Generated',
        body: `Report for ${inspectionRefId} generated. Print dialog opened.`,
      })
    }, 400)
  }

  function handleExportEvidence() {
    toast.push({
      family: 'pass',
      title: 'Evidence Bundle Exported',
      body: 'ZIP manifest with SHA-256 integrity hash downloaded.',
    })
  }

  return (
    <div className="nn-admin-page flex flex-col gap-6 pb-12">
      {/* -------------------------------------------------------------------- */}
      {/* HEADER & BREADCRUMB                                                   */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        {/* Breadcrumb: Home → Inspections → INS-10230 */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <Link
            to="/admin"
            className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
          >
            Home
          </Link>
          <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
          <Link
            to="/admin/inspections"
            className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
          >
            Inspections
          </Link>
          <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
          <span className="nn-mono font-semibold text-ink">{inspectionRefId}</span>
        </nav>

        {/* Title, Display ID, and Right-side actions */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-divider pb-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-[24px] font-bold tracking-[-0.01em] text-ink">
              Inspection Details
            </h1>
            <span className="nn-mono text-[14px] font-semibold text-ink-2">
              Inspection ID: {inspectionRefId}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Result badge: Violation */}
            <StatusBadge status="Violation" className="px-2.5 py-1 text-[12px]" />

            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={handleExportEvidence}
            >
              Export Evidence
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={FileText}
              loading={downloadingReport}
              onClick={handleDownloadReport}
            >
              Download Report
            </Button>
          </div>
        </header>

        {/* EVIDENTIARY UX WORKFLOW RELATIONSHIP RIBBON */}
        <div className="flex flex-wrap items-center gap-1 rounded-sm border border-divider bg-surface-2 px-3 py-2 text-[11px] font-mono text-ink-2">
          <span className="font-semibold text-ink uppercase tracking-wider">Statutory Audit Chain:</span>
          <span className="font-semibold text-ink">Inspection</span>
          <span className="text-ink-3 font-sans">↓</span>
          <span className="font-semibold text-ink">Rule Checks / Findings</span>
          <span className="text-ink-3 font-sans">↓</span>
          <span className="font-semibold text-ink">Evidence</span>
          <span className="text-ink-3 font-sans">↓</span>
          <span className="font-semibold text-ink">OCR / Observed Data</span>
          <span className="text-ink-3 font-sans">↓</span>
          <span className="font-semibold text-ink">Rule Version (2.0.0)</span>
          <span className="text-ink-3 font-sans">↓</span>
          <span className="font-semibold text-pass-text">Audit Integrity (Verified)</span>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* SECTION 1 — INSPECTION OVERVIEW & SECTION 2 — STORE INFORMATION     */}
      {/* -------------------------------------------------------------------- */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* SECTION 1 — INSPECTION OVERVIEW */}
        <Card className="flex flex-col p-5">
          <div className="flex items-center justify-between border-b border-divider pb-3">
            <div className="flex items-center gap-2">
              <FileCheck size={16} className="text-[#0f2a44]" />
              <h2 className="text-[14px] font-bold text-ink uppercase tracking-wider">
                Inspection Overview
              </h2>
            </div>
            <StatusBadge status="Violation" />
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-y-3.5 gap-x-6 sm:grid-cols-2 text-[13px]">
            <div>
              <dt className="nn-eyebrow">Inspection ID</dt>
              <dd className="nn-mono mt-0.5 font-semibold text-ink">{inspectionRefId}</dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Store</dt>
              <dd className="mt-0.5 font-medium text-ink">Sri Stores</dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Inspector</dt>
              <dd className="mt-0.5 font-medium text-ink">S. Kumar (LM-TG-1042)</dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Area</dt>
              <dd className="mt-0.5 font-medium text-ink">Rajahmundry</dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Date &amp; Time</dt>
              <dd className="mt-0.5 font-medium text-ink">02 Sep 2026, 10:20 AM</dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Inspection Status</dt>
              <dd className="mt-0.5">
                <InspectionStatusBadge status="submitted" />
              </dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Rule Result</dt>
              <dd className="mt-0.5">
                <StatusBadge status="Violation" />
              </dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Sync Status</dt>
              <dd className="mt-0.5">
                <SyncBadge state="synced" />
              </dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Products Scanned</dt>
              <dd className="nn-mono mt-0.5 font-semibold text-ink">1</dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="nn-eyebrow">Sync Status</dt>
              <dd className="mt-0.5">
                <SimpleBadge label="Synced" variant="synced" />
              </dd>
            </div>
          </dl>
        </Card>

        {/* SECTION 2 — STORE INFORMATION */}
        <Card className="flex flex-col p-5">
          <div className="flex items-center justify-between border-b border-divider pb-3">
            <div className="flex items-center gap-2">
              <StoreIcon size={16} className="text-[#0f2a44]" />
              <h2 className="text-[14px] font-bold text-ink uppercase tracking-wider">
                Store Information
              </h2>
            </div>
            <SimpleBadge label="ST-001" variant="navy" />
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-y-3.5 gap-x-6 sm:grid-cols-2 text-[13px]">
            <div className="sm:col-span-2">
              <dt className="nn-eyebrow">Store Name</dt>
              <dd className="mt-0.5 text-[15px] font-bold text-ink">Sri Stores</dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Location</dt>
              <dd className="mt-0.5 font-medium text-ink">Rajahmundry</dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Store ID</dt>
              <dd className="nn-mono mt-0.5 font-semibold text-ink">ST-001</dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Inspection Date</dt>
              <dd className="mt-0.5 font-medium text-ink">02 Sep 2026</dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Inspector</dt>
              <dd className="mt-0.5 font-medium text-ink">S. Kumar</dd>
            </div>

            <div className="sm:col-span-2 pt-2 border-t border-divider text-xs text-ink-3">
              <p>Registered Address: Shop 4, Main Bazaar, Rajahmundry, Andhra Pradesh · 533101</p>
            </div>
          </dl>
        </Card>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* SECTION 3 — INSPECTION RESULT                                        */}
      {/* -------------------------------------------------------------------- */}
      <section>
        <Card className="border-violation-border bg-violation-fill/30 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Prominent Verdict */}
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-violation text-white shadow-xs">
                <XCircle size={24} strokeWidth={2.4} aria-hidden="true" />
              </div>
              <div>
                <span className="nn-eyebrow text-violation-text font-bold">Inspection Result</span>
                <p className="text-[22px] font-black tracking-tight text-violation-text leading-tight">
                  NON-COMPLIANT
                </p>
                <p className="text-[12px] font-medium text-violation-text/90 mt-0.5">
                  Package contravenes statutory rules under the Legal Metrology (Packaged Commodities) Rules, 2011.
                </p>
              </div>
            </div>

            {/* Right: Supporting summary counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
              <div className="rounded-sm border border-divider bg-surface px-3.5 py-2">
                <span className="text-[10px] font-mono font-semibold uppercase text-ink-3">Products Inspected</span>
                <p className="nn-mono text-[18px] font-bold text-ink">1</p>
              </div>

              <div className="rounded-sm border border-divider bg-surface px-3.5 py-2">
                <span className="text-[10px] font-mono font-semibold uppercase text-ink-3">Checks Performed</span>
                <p className="nn-mono text-[18px] font-bold text-ink">19</p>
              </div>

              <div className="rounded-sm border border-violation-border bg-violation-fill px-3.5 py-2">
                <span className="text-[10px] font-mono font-bold uppercase text-violation-text">Violations</span>
                <p className="nn-mono text-[18px] font-black text-violation-text">3</p>
              </div>

              <div className="rounded-sm border border-divider bg-surface px-3.5 py-2">
                <span className="text-[10px] font-mono font-semibold uppercase text-ink-3">Not Assessed</span>
                <p className="nn-mono text-[18px] font-bold text-ink">0</p>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* SECTION 4 — FINDINGS / RULE CHECKS (PRIMARY SECTION)                 */}
      {/* -------------------------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-ink">
              Findings / Rule Checks
            </h2>
            <p className="text-[12px] text-ink-3">
              Complete catalog of 19 statutory Legal Metrology compliance checks evaluated for this inspection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter buttons */}
            <div className="flex items-center rounded-sm border border-divider bg-surface p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setFindingFilter('all')}
                className={cx(
                  'rounded-xs px-2.5 py-1 transition-colors',
                  findingFilter === 'all'
                    ? 'bg-navy text-white'
                    : 'text-ink-2 hover:text-ink'
                )}
              >
                All ({summaryCounts.total})
              </button>
              <button
                type="button"
                onClick={() => setFindingFilter('violations')}
                className={cx(
                  'rounded-xs px-2.5 py-1 transition-colors',
                  findingFilter === 'violations'
                    ? 'bg-violation text-white'
                    : 'text-ink-2 hover:text-violation-text'
                )}
              >
                Violations ({summaryCounts.violations})
              </button>
              <button
                type="button"
                onClick={() => setFindingFilter('compliant')}
                className={cx(
                  'rounded-xs px-2.5 py-1 transition-colors',
                  findingFilter === 'compliant'
                    ? 'bg-pass text-white'
                    : 'text-ink-2 hover:text-pass-text'
                )}
              >
                Compliant ({summaryCounts.compliant})
              </button>
              <button
                type="button"
                onClick={() => setFindingFilter('other')}
                className={cx(
                  'rounded-xs px-2.5 py-1 transition-colors',
                  findingFilter === 'other'
                    ? 'bg-ink-3 text-white'
                    : 'text-ink-2 hover:text-ink'
                )}
              >
                Other ({summaryCounts.notAssessed + summaryCounts.outOfScope})
              </button>
            </div>

            {/* Expand / Collapse All */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAllChecks}
              className="text-[11px]"
            >
              {expandedChecks.size === RULE_CHECKS_19.length ? 'Collapse All' : 'Expand All'}
            </Button>
          </div>
        </div>

        {/* Compact Expandable Findings Table / List */}
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-divider bg-surface-2 text-ink-3 font-semibold">
                  <th scope="col" className="w-10 px-3 py-2.5 text-center"></th>
                  <th scope="col" className="w-24 px-3 py-2.5 font-mono uppercase">Check ID</th>
                  <th scope="col" className="px-4 py-2.5 font-sans uppercase">Rule / Check Name</th>
                  <th scope="col" className="hidden lg:table-cell px-4 py-2.5 font-sans uppercase">Rule Citation</th>
                  <th scope="col" className="w-36 px-4 py-2.5 text-right font-sans uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {filteredChecks.map((check) => {
                  const isExpanded = expandedChecks.has(check.id)
                  const isViolation = check.status === 'Violation'

                  return (
                    <tr
                      key={check.id}
                      className={cx(
                        'transition-colors duration-fast',
                        isViolation
                          ? 'bg-violation-fill/15 hover:bg-violation-fill/25'
                          : 'hover:bg-surface-2'
                      )}
                    >
                      <td colSpan={5} className="p-0">
                        {/* Primary Row */}
                        <div
                          onClick={() => toggleCheck(check.id)}
                          className="flex cursor-pointer items-center justify-between px-3 py-3 select-none"
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleCheck(check.id)
                            }
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-xs text-ink-3 hover:text-ink">
                              {isExpanded ? (
                                <ChevronUp size={16} strokeWidth={2} />
                              ) : (
                                <ChevronDown size={16} strokeWidth={2} />
                              )}
                            </span>

                            <span className="nn-mono w-18 shrink-0 font-bold text-ink">
                              {check.id}
                            </span>

                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-ink text-[13px]">
                                {check.name}
                              </span>
                              <span className="hidden lg:inline-block ml-3 font-mono text-[11px] text-ink-3">
                                {check.rule}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0 pl-3">
                            <StatusBadge status={check.status} />
                          </div>
                        </div>

                        {/* Expanded Detail Panel */}
                        {isExpanded && (
                          <div className="border-t border-divider/70 bg-surface px-6 py-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 text-[12px]">
                              <div>
                                <span className="nn-eyebrow text-ink-3">Rule Reference</span>
                                <p className="mt-1 font-mono font-medium text-ink-2 leading-snug">
                                  {check.rule}
                                </p>
                              </div>

                              <div>
                                <span className="nn-eyebrow text-ink-3">Rule Result</span>
                                <div className="mt-1">
                                  <StatusBadge status={check.status} />
                                </div>
                              </div>

                              <div>
                                <span className="nn-eyebrow text-ink-3">Observed Value</span>
                                <p className={cx(
                                  'mt-1 font-medium',
                                  isViolation ? 'text-violation-text font-semibold' : 'text-ink'
                                )}>
                                  {check.observed}
                                </p>
                              </div>

                              <div>
                                <span className="nn-eyebrow text-ink-3">Expected Value</span>
                                <p className="mt-1 font-medium text-ink-2">
                                  {check.expected}
                                </p>
                              </div>

                              <div className="md:col-span-2 lg:col-span-2">
                                <span className="nn-eyebrow text-ink-3">Reason / Statutory Analysis</span>
                                <p className={cx(
                                  'mt-1 leading-relaxed',
                                  isViolation ? 'text-violation-text' : 'text-ink-2'
                                )}>
                                  {check.reason}
                                </p>
                              </div>

                              <div>
                                <span className="nn-eyebrow text-ink-3">Evidence ID</span>
                                <div className="mt-1 flex items-center gap-2">
                                  <span className="nn-mono font-semibold text-ink">{check.evidenceId}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setShowEvidenceModal(true)
                                    }}
                                    className="text-[11px] font-semibold text-accent-text hover:underline"
                                  >
                                    View Evidence
                                  </button>
                                </div>
                              </div>

                              <div>
                                <span className="nn-eyebrow text-ink-3">Rule Version</span>
                                <p className="nn-mono mt-1 font-semibold text-ink">
                                  {check.ruleVersion}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* SECTION 5 — EVIDENCE & SECTION 6 — EXTRACTED INFORMATION             */}
      {/* -------------------------------------------------------------------- */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* SECTION 5 — EVIDENCE */}
        <Card className="flex flex-col p-5">
          <div className="flex items-center justify-between border-b border-divider pb-3">
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-[#0f2a44]" />
              <h2 className="text-[14px] font-bold text-ink uppercase tracking-wider">
                Evidence
              </h2>
            </div>
            <span className="nn-mono text-[11px] font-semibold text-ink-3">IMG-001</span>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-4">
            {/* Visual Evidence Image Card / Placeholder */}
            <div className="relative w-full sm:w-44 h-44 shrink-0 overflow-hidden rounded-sm border border-divider bg-surface-2 flex flex-col items-center justify-center p-3 text-center">
              <div className="relative z-10 flex flex-col items-center">
                <Package size={36} strokeWidth={1.5} className="text-ink-3" />
                <span className="nn-mono mt-2 text-[11px] font-bold text-ink">IMG-001.JPG</span>
                <span className="text-[10px] text-ink-3">Front &amp; Rear PDP</span>
                <span className="mt-1 rounded bg-pass-fill px-1.5 py-0.5 text-[9px] font-bold text-pass-text">
                  3024 × 4032 px
                </span>
              </div>
              {/* Subtle background registration grid */}
              <div className="absolute inset-0 opacity-10 font-mono text-[8px] flex items-center justify-center pointer-events-none">
                [GRID: CALIBRATED 1.0mm/px]
              </div>
            </div>

            {/* Evidence Metadata */}
            <div className="flex-1 flex flex-col justify-between gap-3 text-[12px]">
              <dl className="grid grid-cols-1 gap-2.5">
                <div>
                  <dt className="nn-eyebrow">Evidence ID</dt>
                  <dd className="nn-mono font-bold text-ink">IMG-001</dd>
                </div>

                <div>
                  <dt className="nn-eyebrow">Capture Timestamp</dt>
                  <dd className="font-medium text-ink">02 Sep 2026, 10:21 AM</dd>
                </div>

                <div>
                  <dt className="nn-eyebrow">Integrity &amp; Processing</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-sm border border-pass-border bg-pass-fill px-2 py-0.5 text-[11px] font-semibold text-pass-text">
                      <ShieldCheck size={12} strokeWidth={2.4} />
                      SHA-256 Verified
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-sm border border-pass-border bg-pass-fill px-2 py-0.5 text-[11px] font-semibold text-pass-text">
                      <CheckCircle2 size={12} strokeWidth={2.4} />
                      OCR Processed
                    </span>
                  </dd>
                </div>

                <div>
                  <dt className="nn-eyebrow">Linked Finding IDs</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                    <span className="rounded bg-violation-fill border border-violation-border px-1.5 py-0.5 font-bold text-violation-text">CHK03</span>
                    <span className="rounded bg-violation-fill border border-violation-border px-1.5 py-0.5 font-bold text-violation-text">CHK05</span>
                    <span className="rounded bg-violation-fill border border-violation-border px-1.5 py-0.5 font-bold text-violation-text">CHK06</span>
                    <span className="rounded bg-violation-fill border border-violation-border px-1.5 py-0.5 font-bold text-violation-text">CHK11</span>
                  </dd>
                </div>
              </dl>

              <div className="pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Eye}
                  onClick={() => setShowEvidenceModal(true)}
                  className="w-full sm:w-auto"
                >
                  View Evidence
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* SECTION 6 — EXTRACTED INFORMATION (COLLAPSIBLE) */}
        <Card className="flex flex-col p-5">
          <div
            onClick={() => setExtractedOpen((v) => !v)}
            className="flex cursor-pointer items-center justify-between border-b border-divider pb-3 select-none"
            role="button"
            tabIndex={0}
            aria-expanded={extractedOpen}
          >
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-[#0f2a44]" />
              <div>
                <h2 className="text-[14px] font-bold text-ink uppercase tracking-wider">
                  Extracted Information
                </h2>
                <span className="text-[11px] text-ink-3">OCR &amp; Observed Data (Secondary)</span>
              </div>
            </div>
            <button type="button" className="text-ink-3 hover:text-ink">
              {extractedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {extractedOpen ? (
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-[12px]">
              <div>
                <dt className="nn-eyebrow">Product Name</dt>
                <dd className="mt-0.5 font-semibold text-ink">XYZ Product (Tastemaker Salt Chips)</dd>
              </div>

              <div>
                <dt className="nn-eyebrow">MRP</dt>
                <dd className="nn-mono mt-0.5 font-semibold text-violation-text">
                  ₹120 (Observed ₹20.00 sticker)
                </dd>
              </div>

              <div>
                <dt className="nn-eyebrow">Net Quantity</dt>
                <dd className="nn-mono mt-0.5 font-semibold text-ink">500 g (Pack: 50 g)</dd>
              </div>

              <div>
                <dt className="nn-eyebrow">Manufacturer</dt>
                <dd className="mt-0.5 font-medium text-ink">ABC Foods (XYZ Foods Pvt Ltd)</dd>
              </div>

              <div>
                <dt className="nn-eyebrow">Packed Date</dt>
                <dd className="nn-mono mt-0.5 font-medium text-ink">08/2026</dd>
              </div>

              <div>
                <dt className="nn-eyebrow">Customer Care</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  Available <span className="text-ink-3">(1800-103-2255)</span>
                </dd>
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-divider flex items-center justify-between text-[11px] text-ink-3">
                <span>OCR Pipeline: Tesseract + Custom Legal Metrology Engine v2.0</span>
                <span className="font-mono text-pass-text font-semibold">98.4% Confidence</span>
              </div>
            </dl>
          ) : (
            <div className="mt-3 text-center text-[12px] text-ink-3 py-4">
              Click to expand extracted packaging fields and raw OCR data.
            </div>
          )}
        </Card>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* SECTION 7 — AUDIT & INTEGRITY                                        */}
      {/* -------------------------------------------------------------------- */}
      <section>
        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-divider pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-pass" />
              <h2 className="text-[14px] font-bold text-ink uppercase tracking-wider">
                Audit &amp; Integrity
              </h2>
            </div>
            <Link
              to="/admin/audit"
              className="text-[12px] font-semibold text-accent-text hover:underline"
            >
              View Audit Trail →
            </Link>
          </div>

          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-[12px]">
            <div>
              <dt className="nn-eyebrow">Evidence Integrity</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-semibold text-pass-text">
                <CheckCircle2 size={14} />
                Verified
              </dd>
            </div>

            <div>
              <dt className="nn-eyebrow">SHA-256 Checksum</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-semibold text-pass-text">
                <ShieldCheck size={14} />
                <span>Verified</span>
                <span className="nn-mono text-[10px] text-ink-3">(b41f9...92e6)</span>
              </dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Rule Version</dt>
              <dd className="nn-mono mt-1 font-semibold text-ink">
                2.0.0
              </dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Inspection Created</dt>
              <dd className="mt-1 font-medium text-ink">
                02 Sep 2026, 10:20 AM
              </dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Last Synchronized</dt>
              <dd className="mt-1 font-medium text-ink">
                02 Sep 2026, 10:24 AM
              </dd>
            </div>

            <div>
              <dt className="nn-eyebrow">Audit Chain</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-semibold text-pass-text">
                <Check size={14} strokeWidth={2.5} />
                Valid (Block #10230-04)
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="nn-eyebrow">QR Verification</dt>
              <dd className="mt-1 flex items-center gap-2 font-medium text-ink">
                <QrCode size={14} className="text-ink-2" />
                <span>Available</span>
                <span className="text-[11px] text-ink-3">· Digital Signature cryptographically sealed</span>
              </dd>
            </div>
          </dl>

          <div className="mt-4 pt-3 border-t border-divider flex items-center justify-end">
            <Button
              variant="secondary"
              size="sm"
              icon={Shield}
              onClick={() => navigate('/admin/audit')}
            >
              View Audit Trail
            </Button>
          </div>
        </Card>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* SECTION 8 — ACTIONS                                                  */}
      {/* -------------------------------------------------------------------- */}
      <section className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-6">
        <Button
          variant="secondary"
          size="md"
          icon={ArrowLeft}
          onClick={() => navigate('/admin/inspections')}
        >
          Back to Inspections
        </Button>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="md"
            icon={ShieldCheck}
            onClick={() => navigate('/admin/audit')}
          >
            View Audit Trail
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={Download}
            loading={downloadingReport}
            onClick={handleDownloadReport}
          >
            Download Report
          </Button>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* EVIDENCE VIEWER MODAL                                                */}
      {/* -------------------------------------------------------------------- */}
      {showEvidenceModal && (
        <Modal
          open={showEvidenceModal}
          onClose={() => setShowEvidenceModal(false)}
          title="Evidence Package Details — IMG-001"
          description="Photographic and telemetry evidentiary record for statutory inspection INS-10230."
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="nn-mono text-xs text-ink-3">SHA-256: 3f9a72e8...c21e</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowEvidenceModal(false)}>
                  Close
                </Button>
                <Button variant="primary" size="sm" icon={Download} onClick={handleExportEvidence}>
                  Download Asset
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-4 text-[13px]">
            {/* Simulated photographic preview */}
            <div className="relative aspect-video w-full rounded-sm border border-divider bg-slate-900 flex items-center justify-center text-white overflow-hidden">
              <div className="flex flex-col items-center gap-2">
                <Package size={48} strokeWidth={1.5} className="text-slate-400" />
                <span className="font-mono text-xs font-semibold text-slate-300">
                  Tastemaker Salt Chips · Principal Display Panel (PDP)
                </span>
                <span className="rounded bg-black/60 px-2 py-0.5 text-[11px] font-mono text-amber-400">
                  Detected Bounding Box: [x: 142, y: 310, w: 220, h: 84] (MRP Sticker)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded border border-divider bg-surface-2">
                <span className="nn-eyebrow">Camera Resolution</span>
                <p className="nn-mono font-semibold text-ink mt-0.5">3024 × 4032 px (12.2 MP)</p>
              </div>
              <div className="p-2.5 rounded border border-divider bg-surface-2">
                <span className="nn-eyebrow">GPS Geolocation</span>
                <p className="nn-mono font-semibold text-ink mt-0.5">16.9891° N, 81.7840° E (±2.4m)</p>
              </div>
            </div>

            <div>
              <span className="nn-eyebrow">Associated Statutory Findings</span>
              <ul className="mt-1 space-y-1 text-xs text-ink-2">
                <li className="flex items-center gap-1.5">
                  <XCircle size={14} className="text-violation" />
                  <span className="font-semibold text-ink">CHK03</span> — Retail sale price sticker affixed over original printed MRP
                </li>
                <li className="flex items-center gap-1.5">
                  <XCircle size={14} className="text-violation" />
                  <span className="font-semibold text-ink">CHK05</span> — Missing grievance redressal postal address
                </li>
                <li className="flex items-center gap-1.5">
                  <XCircle size={14} className="text-violation" />
                  <span className="font-semibold text-ink">CHK06</span> — Numeral height 1.12 mm fails 1.50 mm statutory minimum
                </li>
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
