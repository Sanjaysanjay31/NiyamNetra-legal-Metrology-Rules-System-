/**
 * Scan Details Screen — Legal Metrology Enforcement Portal.
 *
 * Route: /admin/products-scans/:scanId
 *
 * Complete details of one scanned product clearly connecting:
 *   Product Scan → Captured Evidence → OCR Extraction → Rule Evaluation → Findings → Audit Integrity
 *
 * Sections:
 *   - Header: Title, Breadcrumb, Product, Scan ID, Download Report, View Inspection, Result badge: Violation
 *   - Section 1: Scan Overview (Scan ID, Product, Store, Inspection, Inspector, Date & Time, OCR Status, Result)
 *   - Section 2: Captured Evidence (Two-column: large image placeholder + Evidence ID, Capture Status, OCR Status, Integrity, Captured, View Full Evidence)
 *   - Section 3: OCR Extracted Information (Read-only: Product Name, MRP, Net Quantity, Manufacturer, Packed Date, Customer Care)
 *   - Section 4: Rule Evaluation (19 Checks Performed, 16 Compliant, 3 Violations, 0 Not Assessed; compact expandable rows with View Rule action)
 *   - Section 5: Evidence References (IMG-001 → CHK03, CHK05, CHK08 visual flow)
 *   - Section 6: Audit & Integrity (Evidence Integrity, SHA-256, Rule Version, Inspection, Sync Status, Audit Chain, View Audit Trail, Verify QR)
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Layers,
  MapPin,
  Minus,
  Package,
  QrCode,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store,
  Tag,
  X,
  XCircle,
} from 'lucide-react'
import { saveBlob } from '../api/client'
import { useDocumentTitle } from '../lib/hooks'
import { SCAN_RECORDS } from '../mock/productsScansData'
import {
  Button,
  Card,
  cx,
  Modal,
  useToast,
} from '../ui'

/* -------------------------------------------------------------------------- */
/* 19 Statutory Legal Metrology Checks Catalog for SCN-001                     */
/* 16 Compliant, 3 Violations (CHK03, CHK05, CHK08), 0 Not Assessed           */
/* -------------------------------------------------------------------------- */

const RULE_CHECKS_19 = [
  {
    id: 'CHK01',
    name: 'Net Quantity Declaration',
    rule: 'Rule 6(1)(c), Legal Metrology (Packaged Commodities) Rules, 2011',
    status: 'Compliant',
    observed: '500 g declared on Principal Display Panel',
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
    observed: '₹120',
    expected: 'Valid MRP declaration',
    reason: 'Retail sale price sticker affixed over original printed MRP declaration. Altering declared price upwards violates Rule 6(1)(e) and Rule 6(4A).',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK04',
    name: 'Manufacturer Details',
    rule: 'Rule 6(1)(a) and Rule 6(1)(b)',
    status: 'Compliant',
    observed: 'ABC Foods Pvt Ltd, Industrial Area, Rajahmundry 533101',
    expected: 'Complete legal entity name and full postal address including PIN code',
    reason: 'Manufacturer entity name, address, and valid postal index number are fully declared.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK05',
    name: 'Consumer Care Details',
    rule: 'Rule 6(1)(g) and Rule 6(1)(ga)',
    status: 'Violation',
    observed: '1800-103-2255 provided; postal contact address omitted',
    expected: 'Name, address, telephone number and email address of person/office to be contacted',
    reason: 'Mandatory postal contact address omitted from grievance redressal declaration in contravention of Rule 6(1)(g).',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK06',
    name: 'Numeral & Character Font Height',
    rule: 'Rule 7(2) read with Table-I',
    status: 'Compliant',
    observed: '2.10 mm measured character height (Area of PDP: 120 cm²)',
    expected: 'Minimum 2.00 mm height required for display panel area between 100 cm² and 500 cm²',
    reason: 'Measured numeral height 2.10 mm exceeds the statutory 2.00 mm minimum prescribed by Table-I.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK07',
    name: 'Character Width Ratio',
    rule: 'Rule 7(3), Legal Metrology Rules',
    status: 'Compliant',
    observed: 'Width-to-height ratio: 0.42 (exceeds 0.33 limit)',
    expected: 'Character width must be at least one-third (33.3%) of character height',
    reason: 'Font width satisfies statutory proportion requirements across all declared numerals.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK08',
    name: 'Net Quantity Declaration',
    rule: 'Rule 6(1)(c) read with Rule 8',
    status: 'Violation',
    observed: 'Secondary net quantity qualifier affixed near seal crimp',
    expected: 'Unobscured singular declaration on PDP without conflicting stickers',
    reason: 'Multiple conflicting net quantity markings detected on front display panel in violation of Rule 6(1)(c).',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK09',
    name: 'Conspicuous Background Contrast',
    rule: 'Rule 9, Conspicuous Display',
    status: 'Compliant',
    observed: 'Contrast ratio 8.2:1 (dark blue text on light background)',
    expected: 'Declarations must contrast conspicuously with package background color',
    reason: 'Text is clearly visible and legible with no interference from graphic art or patterns.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK10',
    name: 'Clear Space Around Net Quantity',
    rule: 'Rule 8, Declaration Placement',
    status: 'Compliant',
    observed: 'Surrounding clear space measured at 3.2 mm (exceeds 2.0 mm minimum)',
    expected: 'Free space equal to at least character height above and below, two character widths to sides',
    reason: 'Adequate unobstructed breathing margin maintained around net quantity figures.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK11',
    name: 'Standard Pack Size Denomination',
    rule: 'Rule 5 read with Second Schedule',
    status: 'Compliant',
    observed: '500 g (Permissible increment under Second Schedule)',
    expected: 'Net quantity must conform to Second Schedule standard denominations where applicable',
    reason: 'Packaged commodity weight matches permissible retail distribution bracket.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK12',
    name: 'Sticker & Correction Restrictions',
    rule: 'Rule 6(3) and Rule 6(4A)',
    status: 'Compliant',
    observed: 'Original printed label underneath sticker remains intact for forensic review',
    expected: 'Preservation of underlying declarations for enforcement inspection',
    reason: 'Original printing legible beneath removable sticker during optical transmission inspection.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK13',
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
    id: 'CHK14',
    name: 'Month & Year of Manufacture / Packing',
    rule: 'Rule 6(1)(d)',
    status: 'Compliant',
    observed: "'Packed: 08/2026' (August 2026)",
    expected: 'Month and year of packing or manufacturing in statutory MM/YYYY format',
    reason: 'Packing date printed in statutory format and fully legible.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK15',
    name: 'Best Before / Use By Period',
    rule: 'Rule 6(1)(da)',
    status: 'Compliant',
    observed: "'Best Before 9 Months from Packaging'",
    expected: 'Best before or use by period declared for perishable commodities',
    reason: 'Expiry timeframe declared in compliance with commodity durability requirements.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK16',
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
    id: 'CHK17',
    name: 'Prohibited Qualifiers in Quantity',
    rule: 'Rule 13, Prohibited Terms',
    status: 'Compliant',
    observed: "'500 g' with no preceding or following qualifiers",
    expected: "Strictly no words like 'approximately', 'approx', 'when packed', or 'minimum'",
    reason: 'Net quantity stated as absolute measurement without misleading qualifying phrases.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK18',
    name: 'Common or Generic Commodity Name',
    rule: 'Rule 6(1)(b)',
    status: 'Compliant',
    observed: "'Sample Product A - Packaged Goods'",
    expected: 'Common or generic name of commodity declared on Principal Display Panel',
    reason: 'Generic commodity nomenclature clearly identifies package contents.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
  {
    id: 'CHK19',
    name: 'Principal Display Panel (PDP) Dimensions',
    rule: 'Rule 2(h) and Rule 7(1)',
    status: 'Compliant',
    observed: 'PDP area 120 cm² (exceeds minimum 40% surface requirement)',
    expected: 'Principal display panel must satisfy 40% area of rectangular package side',
    reason: 'Calculated display panel area conforms to packaging dimensional requirements.',
    evidenceId: 'IMG-001',
    ruleVersion: '2.0.0',
  },
]

/* -------------------------------------------------------------------------- */
/* Status Badges                                                               */
/* -------------------------------------------------------------------------- */

function ResultBadge({ result, size = 'md' }) {
  const norm = String(result ?? '').trim().toLowerCase()

  if (norm === 'pass' || norm === 'compliant') {
    return (
      <span
        className={cx(
          'nn-badge border border-pass-border bg-pass-fill text-pass-text',
          size === 'lg' ? 'px-2.5 py-1 text-[13px] font-bold' : 'text-[12px]'
        )}
      >
        <CheckCircle size={size === 'lg' ? 15 : 13} strokeWidth={2} aria-hidden="true" />
        Pass
      </span>
    )
  }

  if (norm === 'violation' || norm === 'fail') {
    return (
      <span
        className={cx(
          'nn-badge border border-violation-border bg-violation-fill text-violation-text',
          size === 'lg' ? 'px-2.5 py-1 text-[13px] font-bold' : 'text-[12px]'
        )}
      >
        <XCircle size={size === 'lg' ? 15 : 13} strokeWidth={2} aria-hidden="true" />
        Violation
      </span>
    )
  }

  if (norm === 'review' || norm === 'needs review') {
    return (
      <span
        className={cx(
          'nn-badge border border-review-border bg-review-fill text-review-text',
          size === 'lg' ? 'px-2.5 py-1 text-[13px] font-bold' : 'text-[12px]'
        )}
      >
        <Clock size={size === 'lg' ? 15 : 13} strokeWidth={2} aria-hidden="true" />
        Review
      </span>
    )
  }

  if (norm === 'out of scope') {
    return (
      <span
        className={cx(
          'nn-badge border border-divider bg-surface-2 text-ink-3',
          size === 'lg' ? 'px-2.5 py-1 text-[13px] font-bold' : 'text-[12px]'
        )}
      >
        <Minus size={size === 'lg' ? 15 : 13} strokeWidth={2} aria-hidden="true" />
        Out of Scope
      </span>
    )
  }

  return (
    <span
      className={cx(
        'nn-badge border border-divider bg-surface-2 text-ink-3',
        size === 'lg' ? 'px-2.5 py-1 text-[13px] font-bold' : 'text-[12px]'
      )}
    >
      <Minus size={size === 'lg' ? 15 : 13} strokeWidth={2} aria-hidden="true" />
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

/* -------------------------------------------------------------------------- */
/* Main Component                                                             */
/* -------------------------------------------------------------------------- */

export default function ScanDetail() {
  const { scanId } = useParams()
  const navigate = useNavigate()
  const { push: toast } = useToast()

  const [expandedCheckId, setExpandedCheckId] = useState('CHK03')
  const [showEvidenceModal, setShowEvidenceModal] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Primary scan lookup
  const scan = useMemo(() => {
    const raw = scanId || 'SCN-001'
    const found = SCAN_RECORDS.find((s) => s.id.toLowerCase() === raw.toLowerCase())

    if (found) return found

    // Default fallback to SCN-001
    return {
      id: raw,
      product: 'Sample Product A',
      store: 'Sri Stores',
      storeId: 'ST-001',
      inspection: 'INS-10230',
      inspectionRawId: '10230',
      inspector: 'S. Kumar',
      dateTime: '02 Sep 2026, 10:20 AM',
      ocrStatus: 'Processed',
      result: 'Violation',
      findings: 3,
      date: '02 Sep 2026',
      area: 'Rajahmundry',
      brand: 'Tastemaker',
      commodity: 'Packaged Food Commodity',
      declaredMrp: '₹120',
      declaredNetQuantity: '500 g',
      manufacturer: 'ABC Foods',
      packedDate: '08/2026',
      customerCare: 'Available',
      evidenceId: 'IMG-001',
      evidenceHash: 'a7c9f4d1e2b58839401f82c61149e0b82f4d19aa913b719484b2c1598372641a',
    }
  }, [scanId])

  useDocumentTitle(`${scan.product} (${scan.id}) · Scan Details`)

  function handleDownloadReport() {
    setDownloading(true)
    try {
      const today = '2026-09-02'
      const reportText = `GOVERNMENT OF ANDHRA PRADESH
DEPARTMENT OF LEGAL METROLOGY
STATUTORY PRODUCT SCAN AUDIT REPORT
============================================================
Scan ID: ${scan.id}
Product Name: ${scan.product}
Store: ${scan.store} (${scan.storeId || 'ST-001'})
Inspection: ${scan.inspection}
Inspector: ${scan.inspector || 'S. Kumar'}
Date & Time: ${scan.dateTime || '02 Sep 2026, 10:20 AM'}
OCR Status: ${scan.ocrStatus}
Final Result: ${scan.result}
Findings Recorded: ${scan.findings}

CAPTURED EVIDENCE:
- Evidence ID: ${scan.evidenceId || 'IMG-001'}
- Integrity: SHA-256 Verified (${scan.evidenceHash || 'a7c9f4d1e2b58839401f82c61149e0b82f4d19aa913b719484b2c1598372641a'})
- Capture Status: Verified
- Timestamp: ${scan.dateTime || '02 Sep 2026, 10:20 AM'}

OCR EXTRACTED DECLARATIONS:
- Product Name: ${scan.product}
- MRP: ${scan.declaredMrp || '₹120'}
- Net Quantity: ${scan.declaredNetQuantity || '500 g'}
- Manufacturer: ${scan.manufacturer || 'ABC Foods'}
- Packed Date: ${scan.packedDate || '08/2026'}
- Customer Care: ${scan.customerCare || 'Available'}

STATUTORY RULE EVALUATION SUMMARY:
- 19 Checks Performed: 16 Compliant | 3 Violations | 0 Not Assessed
${RULE_CHECKS_19.map((c) => `[${c.id}] ${c.name} : ${c.status} | Observed: ${c.observed}`).join('\n')}

EVIDENCE REFERENCES:
- ${scan.evidenceId || 'IMG-001'}
  → CHK03 — MRP Declaration
  → CHK05 — Consumer Care Details
  → CHK08 — Net Quantity Declaration

AUDIT & INTEGRITY:
- Evidence Integrity: Verified
- SHA-256: Verified
- Rule Version: 2.0.0
- Sync Status: Synced
- Audit Chain: Valid

============================================================
Official Regulatory Enforcement Record · NiyamNetra Portal
`
      saveBlob(
        new Blob([reportText], { type: 'text/plain;charset=utf-8' }),
        `niyamnetra-scan-${scan.id}-report-${today}.txt`
      )
      toast({
        family: 'pass',
        title: 'Report downloaded',
        body: `Statutory audit report for ${scan.product} (${scan.id}) saved.`,
      })
    } catch (err) {
      toast({
        family: 'violation',
        title: 'Download failed',
        body: err?.message ?? 'Could not download scan report.',
      })
    } finally {
      setDownloading(false)
    }
  }

  function handleVerifyQr() {
    toast({
      family: 'pass',
      title: 'QR signature verified',
      body: `Cryptographic checksum matches Department of Legal Metrology registry for ${scan.id}.`,
    })
    setShowQrModal(true)
  }

  return (
    <div className="nn-admin-page nn-admin-detail-page nn-scan-detail-page flex flex-col gap-5 pb-12">
      {/* ---- Breadcrumb ---- */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-ink-3">
        <Link
          to="/admin"
          className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
        >
          Home
        </Link>
        <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
        <Link
          to="/admin/products-scans"
          className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
        >
          Products / Scans
        </Link>
        <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
        <span className="font-semibold text-ink">{scan.id}</span>
      </nav>

      {/* ---- Header ---- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Scan Details</h1>
            <span className="text-ink-3">·</span>
            <span className="nn-mono rounded bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">
              {scan.id}
            </span>
            <ResultBadge result="Violation" size="lg" />
          </div>
          <p className="text-[14px] font-medium text-ink-2">
            Product: <span className="font-bold text-ink">{scan.product}</span> · Scan ID:{' '}
            <span className="nn-mono font-semibold text-ink">{scan.id}</span>
          </p>
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={Download}
            loading={downloading}
            onClick={handleDownloadReport}
            className="text-[12px] font-semibold"
          >
            Download Report
          </Button>

          <Button
            variant="primary"
            icon={ClipboardList}
            onClick={() => navigate(`/admin/inspections/${scan.inspectionRawId || '10230'}`)}
            className="text-[12px] font-semibold"
          >
            View Inspection
          </Button>
        </div>
      </header>

      {/* ---- Information Flow Tracker ---- */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-divider bg-surface px-4 py-2 text-[11px] text-ink-3">
        <span className="font-semibold uppercase tracking-wider text-ink-2">Information Flow:</span>
        <span className="font-semibold text-ink">Product Scan ({scan.id})</span>
        <span className="text-ink-3">→</span>
        <span className="font-semibold text-accent-text">Captured Evidence (IMG-001)</span>
        <span className="text-ink-3">→</span>
        <span className="font-semibold text-ink">OCR Extraction</span>
        <span className="text-ink-3">→</span>
        <span className="font-semibold text-ink">Rule Evaluation (19 Checks)</span>
        <span className="text-ink-3">→</span>
        <span className="font-semibold text-violation-text">Findings (3 Violations)</span>
        <span className="text-ink-3">→</span>
        <span className="font-semibold text-pass-text">Audit Integrity</span>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1 — SCAN OVERVIEW                                            */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-3 border-b border-divider pb-2.5">
          <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
            Scan Overview
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 sm:grid-cols-4 text-[13px]">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Scan ID
            </span>
            <p className="nn-mono mt-0.5 font-bold text-ink">{scan.id}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Product
            </span>
            <p className="mt-0.5 font-semibold text-ink">{scan.product}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Store
            </span>
            <p className="mt-0.5 font-medium text-ink">{scan.store}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Inspection
            </span>
            <p className="mt-0.5">
              <Link
                to={`/admin/inspections/${scan.inspectionRawId || '10230'}`}
                className="nn-mono font-bold text-accent-text hover:underline"
              >
                {scan.inspection}
              </Link>
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Inspector
            </span>
            <p className="mt-0.5 text-ink">{scan.inspector || 'S. Kumar'}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Date &amp; Time
            </span>
            <p className="nn-mono mt-0.5 text-ink-2">{scan.dateTime || '02 Sep 2026, 10:20 AM'}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              OCR Status
            </span>
            <div className="mt-1">
              <OcrBadge status="Processed" />
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Result
            </span>
            <div className="mt-1">
              <ResultBadge result="Violation" />
            </div>
          </div>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* SECTION 2 — CAPTURED EVIDENCE (PROMINENT TWO-COLUMN LAYOUT)          */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between border-b border-divider pb-3">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Captured Evidence
            </h2>
          </div>
          <span className="nn-mono rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">
            IMG-001 · 3024 × 4032 px
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* LEFT: Large evidence/product image placeholder */}
          <div className="relative flex h-64 sm:h-72 w-full flex-col items-center justify-center overflow-hidden rounded-sm border border-divider bg-surface-2 p-4 text-center">
            {/* Calibrated mm grid pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:16px_16px] opacity-40" />

            {/* Target Reticle / Calibrated Bounding Box */}
            <div className="relative z-10 flex h-48 w-44 flex-col items-center justify-center rounded-sm border-2 border-dashed border-accent/70 bg-surface/90 p-3 shadow-xs">
              <Package size={44} strokeWidth={1.4} className="text-accent" />
              <span className="nn-mono mt-2 text-[12px] font-bold text-ink">IMG-001.JPG</span>
              <span className="text-[10px] text-ink-3">Front Principal Display Panel</span>
              <span className="mt-1.5 rounded bg-pass-fill border border-pass-border px-2 py-0.5 text-[9px] font-bold text-pass-text">
                Optical Standard: 1.0mm/px
              </span>
            </div>

            <div className="absolute bottom-2 left-3 text-[10px] font-mono text-ink-3">
              [CALIBRATED PDP BOUNDING BOX: 120 cm²]
            </div>
            <div className="absolute bottom-2 right-3 text-[10px] font-mono text-ink-3">
              SHA-256: a7c9f4d1...
            </div>
          </div>

          {/* RIGHT: Metadata and verification details */}
          <div className="flex flex-col justify-between gap-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-[13px]">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Evidence ID
                </dt>
                <dd className="nn-mono mt-0.5 text-[15px] font-bold text-ink">IMG-001</dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Capture Status
                </dt>
                <dd className="mt-0.5 flex items-center gap-1 font-semibold text-pass-text">
                  <CheckCircle size={14} strokeWidth={2} /> Verified
                </dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  OCR Status
                </dt>
                <dd className="mt-1">
                  <OcrBadge status="Processed" />
                </dd>
              </div>

              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Integrity
                </dt>
                <dd className="mt-0.5 flex items-center gap-1 font-semibold text-pass-text">
                  <ShieldCheck size={14} strokeWidth={2} /> SHA-256 Verified
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
                  Captured
                </dt>
                <dd className="nn-mono mt-0.5 font-medium text-ink-2">
                  02 Sep 2026, 10:20 AM
                </dd>
              </div>

              <div className="sm:col-span-2 border-t border-divider pt-2 text-[12px] text-ink-2">
                <p>
                  Captured by terminal <span className="nn-mono font-medium text-ink">LM-TG-1042</span> during statutory market surveillance.
                </p>
              </div>
            </dl>

            <div className="pt-2">
              <Button
                variant="secondary"
                icon={Eye}
                onClick={() => setShowEvidenceModal(true)}
                className="w-full sm:w-auto font-semibold"
              >
                View Full Evidence
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* SECTION 3 — OCR EXTRACTED INFORMATION (READ-ONLY)                    */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between border-b border-divider pb-3">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              OCR Extracted Information
            </h2>
          </div>
          <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">
            Read-only observed declarations
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          <div className="rounded-sm border border-divider/60 bg-surface-2/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Product Name
            </span>
            <p className="mt-1 text-[14px] font-semibold text-ink">Sample Product A</p>
          </div>

          <div className="rounded-sm border border-divider/60 bg-surface-2/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              MRP
            </span>
            <p className="nn-mono mt-1 text-[14px] font-bold text-ink">₹120</p>
          </div>

          <div className="rounded-sm border border-divider/60 bg-surface-2/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Net Quantity
            </span>
            <p className="nn-mono mt-1 text-[14px] font-bold text-ink">500 g</p>
          </div>

          <div className="rounded-sm border border-divider/60 bg-surface-2/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Manufacturer
            </span>
            <p className="mt-1 text-[14px] font-medium text-ink">ABC Foods</p>
          </div>

          <div className="rounded-sm border border-divider/60 bg-surface-2/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Packed Date
            </span>
            <p className="nn-mono mt-1 text-[14px] font-medium text-ink">08/2026</p>
          </div>

          <div className="rounded-sm border border-divider/60 bg-surface-2/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Customer Care
            </span>
            <p className="mt-1 flex items-center gap-1 text-[14px] font-semibold text-pass-text">
              <CheckCircle size={14} /> Available
            </p>
          </div>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* SECTION 4 — RULE EVALUATION (19 EXPANDABLE CHECKS)                    */}
      {/* ==================================================================== */}
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-ink">Rule Evaluation</h2>
            <p className="text-[12px] text-ink-3">
              Statutory verification across all 19 Legal Metrology (Packaged Commodities) Rules, 2011 checks.
            </p>
          </div>

          {/* Summary counters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-sm border border-divider bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink">
              19 Checks Performed
            </span>
            <span className="rounded-sm border border-pass-border bg-pass-fill px-2.5 py-1 text-[11px] font-bold text-pass-text">
              16 Compliant
            </span>
            <span className="rounded-sm border border-violation-border bg-violation-fill px-2.5 py-1 text-[11px] font-black text-violation-text">
              3 Violations
            </span>
            <span className="rounded-sm border border-divider bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-3">
              0 Not Assessed
            </span>
          </div>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-divider">
            {RULE_CHECKS_19.map((check) => {
              const isExpanded = expandedCheckId === check.id
              const isViolation = check.status === 'Violation'

              return (
                <div key={check.id} className="transition-colors hover:bg-surface-2/50">
                  {/* Row Summary Bar */}
                  <div
                    onClick={() => setExpandedCheckId(isExpanded ? null : check.id)}
                    className="flex cursor-pointer items-center justify-between px-4 py-3 select-none"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3">
                      <span className="nn-mono font-bold text-ink text-[12px] min-w-[50px]">
                        {check.id}
                      </span>
                      <span className="text-ink-3">—</span>
                      <span className="text-[13px] font-medium text-ink">{check.name}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <ResultBadge result={check.status} />
                      <button
                        type="button"
                        aria-label={isExpanded ? 'Collapse check' : 'Expand check'}
                        className="text-ink-3 hover:text-ink"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="border-t border-divider bg-surface px-5 py-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-[12px]">
                        <div className="sm:col-span-2">
                          <span className="text-[11px] font-medium uppercase text-ink-3">
                            Rule Reference
                          </span>
                          <p className="nn-mono mt-0.5 font-medium text-ink-2">{check.rule}</p>
                        </div>

                        <div>
                          <span className="text-[11px] font-medium uppercase text-ink-3">Status</span>
                          <div className="mt-1">
                            <ResultBadge result={check.status} />
                          </div>
                        </div>

                        <div>
                          <span className="text-[11px] font-medium uppercase text-ink-3">
                            Evidence ID
                          </span>
                          <p className="nn-mono mt-0.5 font-bold text-ink">{check.evidenceId}</p>
                        </div>

                        <div>
                          <span className="text-[11px] font-medium uppercase text-ink-3">
                            Observed Value
                          </span>
                          <p
                            className={cx(
                              'mt-0.5 font-semibold',
                              isViolation ? 'text-violation-text' : 'text-ink'
                            )}
                          >
                            {check.observed}
                          </p>
                        </div>

                        <div>
                          <span className="text-[11px] font-medium uppercase text-ink-3">
                            Expected Value
                          </span>
                          <p className="mt-0.5 font-medium text-ink-2">{check.expected}</p>
                        </div>

                        <div>
                          <span className="text-[11px] font-medium uppercase text-ink-3">
                            Rule Version
                          </span>
                          <p className="nn-mono mt-0.5 font-bold text-ink">{check.ruleVersion}</p>
                        </div>

                        <div>
                          <span className="text-[11px] font-medium uppercase text-ink-3">Action</span>
                          <div className="mt-1">
                            <Link
                              to="/admin/rule-versions"
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
                            >
                              View Rule <span aria-hidden="true">→</span>
                            </Link>
                          </div>
                        </div>

                        <div className="sm:col-span-2 lg:col-span-4 border-t border-divider/70 pt-2">
                          <span className="text-[11px] font-medium uppercase text-ink-3">
                            Reason / Statutory Finding
                          </span>
                          <p
                            className={cx(
                              'mt-1 leading-relaxed',
                              isViolation ? 'font-medium text-violation-text' : 'text-ink-2'
                            )}
                          >
                            {check.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </section>

      {/* ==================================================================== */}
      {/* SECTION 5 — EVIDENCE REFERENCES (IMG-001 → CHK03, CHK05, CHK08)       */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between border-b border-divider pb-3">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Evidence References
            </h2>
          </div>
          <span className="text-[11px] text-ink-3">Direct link between evidence and findings</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Primary Evidence Box */}
          <div className="flex items-center gap-2.5 rounded-sm border border-accent/40 bg-accent/5 px-4 py-3 shrink-0">
            <div className="grid h-8 w-8 place-items-center rounded bg-navy text-white font-mono text-[11px] font-bold">
              IMG
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase text-ink-3">Captured Evidence</span>
              <p className="nn-mono text-[14px] font-bold text-ink">IMG-001</p>
            </div>
          </div>

          {/* Flow indicator */}
          <div className="text-ink-3 font-bold text-[18px] flex items-center justify-center">
            <span className="hidden sm:inline">→</span>
            <span className="sm:hidden">↓</span>
          </div>

          {/* Linked Statutory Findings */}
          <div className="flex-1 flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-sm border border-violation-border bg-violation-fill px-3 py-2 text-[12px]">
              <span className="nn-mono font-bold text-violation-text">CHK03</span>
              <span className="text-ink-3">—</span>
              <span className="font-semibold text-ink">MRP Declaration</span>
            </div>

            <div className="flex items-center gap-2 rounded-sm border border-violation-border bg-violation-fill px-3 py-2 text-[12px]">
              <span className="nn-mono font-bold text-violation-text">CHK05</span>
              <span className="text-ink-3">—</span>
              <span className="font-semibold text-ink">Consumer Care Details</span>
            </div>

            <div className="flex items-center gap-2 rounded-sm border border-violation-border bg-violation-fill px-3 py-2 text-[12px]">
              <span className="nn-mono font-bold text-violation-text">CHK08</span>
              <span className="text-ink-3">—</span>
              <span className="font-semibold text-ink">Net Quantity Declaration</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* SECTION 6 — AUDIT & INTEGRITY                                        */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between border-b border-divider pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-pass-graphic" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Audit &amp; Integrity
            </h2>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-pass-text">
            <CheckCircle size={12} /> Tamper Evident
          </span>
        </div>

        <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 sm:grid-cols-3 text-[13px]">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Evidence Integrity
            </span>
            <p className="mt-0.5 flex items-center gap-1 font-semibold text-pass-text">
              <CheckCircle size={14} /> Verified
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              SHA-256
            </span>
            <p className="mt-0.5 flex items-center gap-1 font-semibold text-pass-text">
              <Shield size={14} /> Verified
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Rule Version
            </span>
            <p className="nn-mono mt-0.5 font-bold text-ink">2.0.0</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Inspection
            </span>
            <p className="mt-0.5">
              <Link
                to={`/admin/inspections/${scan.inspectionRawId || '10230'}`}
                className="nn-mono font-bold text-accent-text hover:underline"
              >
                INS-10230
              </Link>
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Sync Status
            </span>
            <p className="mt-0.5 flex items-center gap-1 font-semibold text-pass-text">
              <CheckCircle size={14} /> Synced
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Audit Chain
            </span>
            <p className="mt-0.5 flex items-center gap-1 font-semibold text-pass-text">
              <ShieldCheck size={14} /> Valid
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3">
          <span className="nn-mono text-[11px] text-ink-3">
            SHA-256: a7c9f4d1e2b58839401f82c61149e0b82f4d19aa913b719484b2c1598372641a
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={QrCode}
              onClick={handleVerifyQr}
            >
              Verify QR
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={ShieldCheck}
              onClick={() => navigate('/admin/audit')}
            >
              View Audit Trail
            </Button>
          </div>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* EVIDENCE FULL MODAL                                                  */}
      {/* ==================================================================== */}
      {showEvidenceModal && (
        <Modal
          open
          onClose={() => setShowEvidenceModal(false)}
          title="Captured Evidence — IMG-001"
          description="Statutory photographic evidence captured at Sri Stores (ST-001) during Inspection INS-10230."
          footer={
            <Button variant="secondary" onClick={() => setShowEvidenceModal(false)}>
              Close Evidence
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="relative flex h-80 w-full flex-col items-center justify-center rounded-sm border border-divider bg-surface-2 p-6 text-center">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:20px_20px] opacity-50" />
              <div className="relative z-10 flex h-60 w-52 flex-col items-center justify-center rounded-sm border-2 border-dashed border-accent bg-surface p-4 shadow-sm">
                <Package size={56} strokeWidth={1.4} className="text-accent" />
                <span className="nn-mono mt-3 text-[13px] font-bold text-ink">IMG-001.JPG</span>
                <span className="text-[11px] text-ink-2">Sample Product A · Front Display</span>
                <span className="mt-2 rounded bg-violation-fill border border-violation-border px-2 py-0.5 text-[10px] font-bold text-violation-text">
                  Violations Flagged: CHK03, CHK05, CHK08
                </span>
              </div>
            </div>

            <div className="rounded-sm border border-divider bg-surface-2 p-3 text-[12px]">
              <span className="text-[10px] font-mono uppercase text-ink-3">Cryptographic Checksum</span>
              <p className="nn-mono text-[11px] text-ink break-all mt-0.5">
                a7c9f4d1e2b58839401f82c61149e0b82f4d19aa913b719484b2c1598372641a
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================================================================== */}
      {/* QR VERIFICATION MODAL                                                */}
      {/* ==================================================================== */}
      {showQrModal && (
        <Modal
          open
          onClose={() => setShowQrModal(false)}
          title="Cryptographic QR Verification"
          description="Statutory digital signature verification for Scan SCN-001."
          footer={
            <Button variant="secondary" onClick={() => setShowQrModal(false)}>
              Dismiss
            </Button>
          }
        >
          <div className="flex flex-col items-center gap-4 text-center py-2">
            <div className="grid h-36 w-36 place-items-center rounded-card border-2 border-divider bg-white p-3 shadow-xs">
              <QrCode size={110} className="text-navy" />
            </div>

            <div className="flex flex-col gap-1">
              <span className="flex items-center justify-center gap-1.5 font-bold text-pass-text text-[14px]">
                <CheckCircle size={16} /> Cryptographically Signed &amp; Audited
              </span>
              <p className="text-[12px] text-ink-2 max-w-sm">
                Signed by Officer S. Kumar (LM-TG-1042) on 02 Sep 2026, 10:20 AM. Checksum verified with Government Central Registry.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
