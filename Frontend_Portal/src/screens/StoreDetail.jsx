/**
 * Store Details — Legal Metrology Enforcement Portal.
 *
 * Route: /admin/stores/:storeId
 * Purpose:
 * Show the complete administrative overview and inspection history of one store.
 *
 * Information Flow:
 * Store → Inspection History → Inspection Details → Findings → Evidence → Audit Trail
 *
 * Sections:
 * - Header: Title "Store Details", Breadcrumb Home → Stores → ST-001,
 *   Store "Sri Stores", ID "ST-001", Area "Rajahmundry",
 *   Right-side actions: Download Store Report, View Latest Inspection, Status Badge: "Violation"
 * - Section 1: Store Information (clean info card with exact 8 fields, no invented personal fields)
 * - Section 2: Compliance Summary (4 compact summary cards + "Latest inspection identified 3 violations.")
 * - Section 3: Inspection History (Dominant section with clean table: INS-10230, INS-10215, INS-10190)
 * - Section 4: Products Scanned (Sample Product A, Last Scanned, Result, Findings, View Product →)
 * - Section 5: Recent Violations (CHK03, CHK05, CHK08 with View Finding →)
 * - Section 6: Store Location (Area: Rajahmundry, clean location placeholder)
 * - Section 7: Record Integrity (Latest Inspection, Evidence, Rule Version, Sync Status, Audit Trail, View Audit Trail)
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  MapPin,
  Package,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useDocumentTitle } from '../lib/hooks'
import { STORE_RECORDS } from '../mock/storesData'
import { saveBlob } from '../api/client'
import {
  Button,
  Card,
  cx,
  useToast,
} from '../ui'

/* ----------------------------------------------------------- Summary Card -- */

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

/* ---------------------------------------------------------- Status Badges -- */

function StatusBadge({ result, size = 'md' }) {
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
        Compliant
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

  if (norm === 'not assessed' || norm === 'not_assessed' || norm === 'review' || norm === 'needs review') {
    return (
      <span
        className={cx(
          'nn-badge border border-review-border bg-review-fill text-review-text',
          size === 'lg' ? 'px-2.5 py-1 text-[13px] font-bold' : 'text-[12px]'
        )}
      >
        <Clock size={size === 'lg' ? 15 : 13} strokeWidth={2} aria-hidden="true" />
        Not Assessed
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
      Out of Scope
    </span>
  )
}

/* ---------------------------------------------------------- Main Component -- */

export default function StoreDetail() {
  const { storeId } = useParams()
  const navigate = useNavigate()
  const { push: toast } = useToast()
  const [downloading, setDownloading] = useState(false)

  // Primary store record matching ST-001 by default, or looking up route parameter
  const store = useMemo(() => {
    const rawId = storeId || 'ST-001'
    const found = STORE_RECORDS.find(
      (s) => s.id === rawId || String(s.id).toLowerCase() === String(rawId).toLowerCase()
    )

    if (found && found.id === 'ST-001') {
      return {
        id: 'ST-001',
        name: 'Sri Stores',
        area: 'Rajahmundry',
        address: 'Rajahmundry',
        currentStatus: 'Violation',
        totalInspections: 4,
        lastInspection: '02 Sep 2026',
        totalViolations: 3,
        passedCount: 2,
        violationsCount: 2,
        needsReviewCount: 0,
        latestViolationsNote: 'Latest inspection identified 3 violations.',
        latestInspectionId: '10230',
        latestInspectionCode: 'INS-10230',
        inspections: [
          {
            id: 'INS-10230',
            rawId: '10230',
            date: '02 Sep 2026',
            inspector: 'S. Kumar',
            products: 1,
            result: 'Violation',
            violations: 3,
          },
          {
            id: 'INS-10215',
            rawId: '10215',
            date: '18 Aug 2026',
            inspector: 'R. Kumar',
            products: 2,
            result: 'Pass',
            violations: 0,
          },
          {
            id: 'INS-10190',
            rawId: '10190',
            date: '04 Aug 2026',
            inspector: 'A. Sharma',
            products: 1,
            result: 'Pass',
            violations: 0,
          },
        ],
        productScanned: {
          name: 'Sample Product A',
          lastScanned: '02 Sep 2026',
          result: 'Violation',
          findings: 3,
        },
        recentViolations: [
          { id: 'CHK03', name: 'MRP Declaration', status: 'Violation' },
          { id: 'CHK05', name: 'Consumer Care Details', status: 'Violation' },
          { id: 'CHK08', name: 'Net Quantity Declaration', status: 'Violation' },
        ],
        recordIntegrity: {
          latestInspection: 'INS-10230',
          evidence: 'Verified',
          ruleVersion: '2.0.0',
          syncStatus: 'Synced',
          auditTrail: 'Valid',
        },
      }
    }

    if (found) {
      const isViolation = found.result === 'Violation' || found.violations > 0
      return {
        id: found.id,
        name: found.name,
        area: found.area,
        address: found.area,
        currentStatus: found.result,
        totalInspections: found.inspections || 3,
        lastInspection: found.lastInspection || '02 Sep 2026',
        totalViolations: found.violations,
        passedCount: isViolation ? found.inspections - 1 : found.inspections,
        violationsCount: isViolation ? 1 : 0,
        needsReviewCount: 0,
        latestViolationsNote: isViolation
          ? `Latest inspection identified ${found.violations} violation${found.violations === 1 ? '' : 's'}.`
          : 'Latest inspection confirmed full compliance with no violations.',
        latestInspectionId: String(found.recentInspectionId || 10230),
        latestInspectionCode: `INS-${found.recentInspectionId || 10230}`,
        inspections: [
          {
            id: `INS-${found.recentInspectionId || 10230}`,
            rawId: String(found.recentInspectionId || 10230),
            date: found.lastInspection || '02 Sep 2026',
            inspector: 'S. Kumar',
            products: 1,
            result: found.result,
            violations: found.violations,
          },
          {
            id: 'INS-10215',
            rawId: '10215',
            date: '18 Aug 2026',
            inspector: 'R. Kumar',
            products: 2,
            result: 'Pass',
            violations: 0,
          },
        ],
        productScanned: {
          name: 'Sample Product A',
          lastScanned: found.lastInspection || '02 Sep 2026',
          result: found.result,
          findings: found.violations,
        },
        recentViolations: isViolation
          ? [
              { id: 'CHK03', name: 'MRP Declaration', status: 'Violation' },
              { id: 'CHK05', name: 'Consumer Care Details', status: 'Violation' },
            ]
          : [],
        recordIntegrity: {
          latestInspection: `INS-${found.recentInspectionId || 10230}`,
          evidence: 'Verified',
          ruleVersion: '2.0.0',
          syncStatus: 'Synced',
          auditTrail: 'Valid',
        },
      }
    }

    // Default fallback to ST-001 (Sri Stores)
    return {
      id: rawId,
      name: 'Sri Stores',
      area: 'Rajahmundry',
      address: 'Rajahmundry',
      currentStatus: 'Violation',
      totalInspections: 4,
      lastInspection: '02 Sep 2026',
      totalViolations: 3,
      passedCount: 2,
      violationsCount: 2,
      needsReviewCount: 0,
      latestViolationsNote: 'Latest inspection identified 3 violations.',
      latestInspectionId: '10230',
      latestInspectionCode: 'INS-10230',
      inspections: [
        {
          id: 'INS-10230',
          rawId: '10230',
          date: '02 Sep 2026',
          inspector: 'S. Kumar',
          products: 1,
          result: 'Violation',
          violations: 3,
        },
        {
          id: 'INS-10215',
          rawId: '10215',
          date: '18 Aug 2026',
          inspector: 'R. Kumar',
          products: 2,
          result: 'Pass',
          violations: 0,
        },
        {
          id: 'INS-10190',
          rawId: '10190',
          date: '04 Aug 2026',
          inspector: 'A. Sharma',
          products: 1,
          result: 'Pass',
          violations: 0,
        },
      ],
      productScanned: {
        name: 'Sample Product A',
        lastScanned: '02 Sep 2026',
        result: 'Violation',
        findings: 3,
      },
      recentViolations: [
        { id: 'CHK03', name: 'MRP Declaration', status: 'Violation' },
        { id: 'CHK05', name: 'Consumer Care Details', status: 'Violation' },
        { id: 'CHK08', name: 'Net Quantity Declaration', status: 'Violation' },
      ],
      recordIntegrity: {
        latestInspection: 'INS-10230',
        evidence: 'Verified',
        ruleVersion: '2.0.0',
        syncStatus: 'Synced',
        auditTrail: 'Valid',
      },
    }
  }, [storeId])

  useDocumentTitle(`${store.name} (${store.id}) · Store Details`)

  function handleDownloadStoreReport() {
    setDownloading(true)
    try {
      const today = '2026-09-02'
      const reportText = `GOVERNMENT OF ANDHRA PRADESH
LEGAL METROLOGY DEPARTMENT
STATUTORY STORE COMPLIANCE REPORT
============================================================
Generated Date: ${today}
Store Name: ${store.name}
Store ID: ${store.id}
Area: ${store.area}
Address: ${store.address}
Current Status: ${store.currentStatus}
Total Inspections: ${store.totalInspections}
Last Inspection: ${store.lastInspection}
Total Violations: ${store.totalViolations}

COMPLIANCE SUMMARY:
- Total Inspections: ${store.totalInspections}
- Passed: ${store.passedCount}
- Violations: ${store.violationsCount}
- Needs Review: ${store.needsReviewCount}
- Note: ${store.latestViolationsNote}

INSPECTION HISTORY:
${store.inspections
  .map(
    (i) =>
      `[${i.id}] Date: ${i.date} | Inspector: ${i.inspector} | Products: ${i.products} | Result: ${i.result} | Violations: ${i.violations}`
  )
  .join('\n')}

PRODUCTS SCANNED:
- Product: ${store.productScanned.name}
- Last Scanned: ${store.productScanned.lastScanned}
- Result: ${store.productScanned.result}
- Findings: ${store.productScanned.findings}

RECENT VIOLATIONS:
${store.recentViolations.map((v) => `- ${v.id} — ${v.name} — ${v.status}`).join('\n')}

RECORD INTEGRITY:
- Latest Inspection: ${store.recordIntegrity.latestInspection}
- Evidence: ${store.recordIntegrity.evidence}
- Rule Version: ${store.recordIntegrity.ruleVersion}
- Sync Status: ${store.recordIntegrity.syncStatus}
- Audit Trail: ${store.recordIntegrity.auditTrail}

============================================================
Official Record · NiyamNetra Enforcement Portal
`
      saveBlob(
        new Blob([reportText], { type: 'text/plain;charset=utf-8' }),
        `niyamnetra-store-${store.id}-report-${today}.txt`
      )
      toast({
        family: 'pass',
        title: 'Report downloaded',
        body: `Statutory report for ${store.name} (${store.id}) saved.`,
      })
    } catch (err) {
      toast({
        family: 'violation',
        title: 'Download failed',
        body: err?.message ?? 'Could not download report.',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="nn-admin-page nn-admin-detail-page nn-store-detail-page flex flex-col gap-5 pb-12">
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
          to="/admin/stores"
          className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
        >
          Stores
        </Link>
        <ChevronRight size={12} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
        <span className="font-semibold text-ink">{store.id}</span>
      </nav>

      {/* ---- Header ---- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Store Details</h1>
            <span className="text-ink-3">·</span>
            <span className="nn-mono rounded bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">
              {store.id}
            </span>
            <span className="text-ink-3">·</span>
            <span className="text-[13px] font-medium text-ink-2">{store.area}</span>
            <StatusBadge result={store.currentStatus} size="lg" />
          </div>
          <p className="text-[14px] font-medium text-ink-2">
            {store.name} — Administrative Overview and Statutory Inspection History
          </p>
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={Download}
            loading={downloading}
            onClick={handleDownloadStoreReport}
            className="text-[12px] font-semibold"
          >
            Download Store Report
          </Button>

          <Button
            variant="primary"
            icon={Eye}
            onClick={() => navigate(`/admin/inspections/${store.latestInspectionId}`)}
            className="text-[12px] font-semibold"
          >
            View Latest Inspection
          </Button>
        </div>
      </header>

      {/* ---- Information Flow Tracker ---- */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-divider bg-surface px-4 py-2 text-[11px] text-ink-3">
        <span className="font-semibold uppercase tracking-wider text-ink-2">Enforcement Flow:</span>
        <span className="font-semibold text-accent-text">Store ({store.id})</span>
        <span className="text-ink-3">→</span>
        <span className="font-medium text-ink">Inspection History</span>
        <span className="text-ink-3">→</span>
        <span className="font-medium text-ink">Inspection Details</span>
        <span className="text-ink-3">→</span>
        <span className="font-medium text-ink">Findings</span>
        <span className="text-ink-3">→</span>
        <span className="font-medium text-ink">Evidence</span>
        <span className="text-ink-3">→</span>
        <span className="font-medium text-ink">Audit Trail</span>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1 — STORE INFORMATION                                        */}
      {/* ==================================================================== */}
      <Card className="p-5">
        <div className="mb-3 border-b border-divider pb-2.5">
          <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
            Store Information
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 sm:grid-cols-4">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Store Name
            </span>
            <p className="mt-0.5 text-[13px] font-medium text-ink">{store.name}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Store ID
            </span>
            <p className="nn-mono mt-0.5 text-[13px] font-semibold text-ink">{store.id}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Area
            </span>
            <p className="mt-0.5 text-[13px] text-ink">{store.area}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Address
            </span>
            <p className="mt-0.5 text-[13px] text-ink">{store.address}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Current Status
            </span>
            <div className="mt-1">
              <StatusBadge result={store.currentStatus} />
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Total Inspections
            </span>
            <p className="nn-mono mt-0.5 text-[13px] font-semibold text-ink">
              {store.totalInspections}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Last Inspection
            </span>
            <p className="nn-mono mt-0.5 text-[13px] text-ink">{store.lastInspection}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Total Violations
            </span>
            <p
              className={cx(
                'nn-mono mt-0.5 text-[13px] font-semibold',
                store.totalViolations > 0 ? 'font-bold text-violation-text' : 'text-ink'
              )}
            >
              {store.totalViolations}
            </p>
          </div>
        </div>
      </Card>

      {/* ==================================================================== */}
      {/* SECTION 2 — COMPLIANCE SUMMARY                                       */}
      {/* ==================================================================== */}
      <section className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="Total Inspections"
            value={store.totalInspections}
            accent="navy"
          />
          <SummaryCard
            label="Passed"
            value={store.passedCount}
            accent="pass"
          />
          <SummaryCard
            label="Violations"
            value={store.violationsCount}
            accent="violation"
          />
          <SummaryCard
            label="Needs Review"
            value={store.needsReviewCount}
            accent="review"
          />
        </div>

        {/* Below the cards note */}
        <div
          className={cx(
            'flex items-center gap-2 rounded-sm border px-4 py-2.5 text-[12px] font-medium',
            store.totalViolations > 0
              ? 'border-violation-border bg-violation-fill text-violation-text'
              : 'border-pass-border bg-pass-fill text-pass-text'
          )}
        >
          {store.totalViolations > 0 ? (
            <AlertTriangle size={15} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle size={15} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          )}
          <span>{store.latestViolationsNote}</span>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* SECTION 3 — INSPECTION HISTORY (DOMINANT SECTION)                    */}
      {/* ==================================================================== */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-ink">Inspection History</h2>
          <span className="text-[12px] text-ink-3">
            {store.inspections.length} recorded audit{store.inspections.length === 1 ? '' : 's'} on file
          </span>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-divider bg-surface-2 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                    Inspection ID
                  </th>
                  <th className="border-b border-divider bg-surface-2 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                    Date
                  </th>
                  <th className="border-b border-divider bg-surface-2 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                    Inspector
                  </th>
                  <th className="border-b border-divider bg-surface-2 px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                    Products
                  </th>
                  <th className="border-b border-divider bg-surface-2 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                    Result
                  </th>
                  <th className="border-b border-divider bg-surface-2 px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                    Violations
                  </th>
                  <th className="border-b border-divider bg-surface-2 px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {store.inspections.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors duration-fast ease-settle hover:bg-surface-2"
                  >
                    <td className="px-4 py-3 text-[12px]">
                      <span className="nn-mono font-semibold text-ink">{r.id}</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-ink-2">{r.date}</td>
                    <td className="px-4 py-3 text-[12px] text-ink">{r.inspector}</td>
                    <td className="px-4 py-3 text-right text-[12px]">
                      <span className="nn-mono font-semibold text-ink">{r.products}</span>
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      <StatusBadge result={r.result} />
                    </td>
                    <td className="px-4 py-3 text-right text-[12px]">
                      <span
                        className={cx(
                          'nn-mono font-semibold',
                          r.violations > 0 ? 'font-bold text-violation-text' : 'text-ink-3'
                        )}
                      >
                        {r.violations}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[12px]">
                      <Link
                        to={`/admin/inspections/${r.rawId}`}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
                        aria-label={`View inspection ${r.id}`}
                      >
                        View <span aria-hidden="true">→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* ==================================================================== */}
      {/* SECTIONS 4, 5, 6, 7 — SECONDARY DETAILS GRID                         */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* SECTION 4 — PRODUCTS / SCANS */}
        <Card className="flex flex-col justify-between p-4">
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-divider pb-2">
              <div className="flex items-center gap-1.5">
                <Package size={15} className="text-ink-2" aria-hidden="true" />
                <h3 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">
                  Products Scanned
                </h3>
              </div>
              <span className="text-[11px] text-ink-3">Recent item audit</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <span className="text-[11px] font-medium uppercase text-ink-3">Product</span>
                <p className="mt-0.5 font-semibold text-ink">{store.productScanned.name}</p>
              </div>

              <div>
                <span className="text-[11px] font-medium uppercase text-ink-3">Last Scanned</span>
                <p className="nn-mono mt-0.5 text-ink-2">{store.productScanned.lastScanned}</p>
              </div>

              <div>
                <span className="text-[11px] font-medium uppercase text-ink-3">Result</span>
                <div className="mt-0.5">
                  <StatusBadge result={store.productScanned.result} />
                </div>
              </div>

              <div>
                <span className="text-[11px] font-medium uppercase text-ink-3">Findings</span>
                <p className="nn-mono mt-0.5 font-bold text-violation-text">
                  {store.productScanned.findings}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-divider pt-2.5 text-right">
            <Link
              to={`/admin/inspections/${store.latestInspectionId}`}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
            >
              View Product <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Card>

        {/* SECTION 5 — RECENT VIOLATIONS */}
        <Card className="flex flex-col justify-between p-4">
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-divider pb-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert size={15} className="text-violation-text" aria-hidden="true" />
                <h3 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">
                  Recent Violations
                </h3>
              </div>
              <span className="text-[11px] text-ink-3">Rule infractions</span>
            </div>

            {store.recentViolations.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-ink-3">
                No recent violations recorded for this store.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-divider">
                {store.recentViolations.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between py-2 text-[12px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="nn-mono font-semibold text-ink">{v.id}</span>
                      <span className="text-ink-3">—</span>
                      <span className="font-medium text-ink">{v.name}</span>
                      <span className="text-ink-3">—</span>
                      <StatusBadge result={v.status} />
                    </div>

                    <Link
                      to={`/admin/inspections/${store.latestInspectionId}`}
                      className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-accent-text hover:underline"
                    >
                      View Finding <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* SECTION 6 — STORE LOCATION */}
        <Card className="flex flex-col justify-between p-4">
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-divider pb-2">
              <div className="flex items-center gap-1.5">
                <MapPin size={15} className="text-ink-2" aria-hidden="true" />
                <h3 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">
                  Store Location
                </h3>
              </div>
              <span className="text-[11px] text-ink-3">Jurisdiction</span>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-divider bg-surface-2 text-ink-2">
                <MapPin size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-[13px] font-semibold text-ink">
                  Area: <span className="font-bold text-accent-text">{store.area}</span>
                </div>
                <p className="text-[12px] text-ink-2">
                  Legal Metrology Sub-Division Office Jurisdiction · Andhra Pradesh
                </p>
              </div>
            </div>

            {/* Clean location placeholder */}
            <div className="mt-3 flex items-center justify-between rounded-sm border border-divider bg-surface-2 px-3 py-2 text-[11px] text-ink-3">
              <span>On-site terminal geo-fence boundary: 150m verified perimeter</span>
              <span className="font-semibold text-ink-2">Status: Active</span>
            </div>
          </div>
        </Card>

        {/* SECTION 7 — RECORD INTEGRITY */}
        <Card className="flex flex-col justify-between p-4">
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-divider pb-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-pass-graphic" aria-hidden="true" />
                <h3 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">
                  Record Integrity
                </h3>
              </div>
              <span className="text-[11px] text-pass-text font-medium">Verified & Auditable</span>
            </div>

            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-[12px]">
              <div>
                <span className="text-[11px] font-medium uppercase text-ink-3">
                  Latest Inspection
                </span>
                <p className="nn-mono mt-0.5 font-semibold text-ink">
                  {store.recordIntegrity.latestInspection}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-medium uppercase text-ink-3">Evidence</span>
                <p className="mt-0.5 flex items-center gap-1 font-medium text-pass-text">
                  <CheckCircle size={13} strokeWidth={2} />
                  {store.recordIntegrity.evidence}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-medium uppercase text-ink-3">Rule Version</span>
                <p className="nn-mono mt-0.5 font-semibold text-ink">
                  {store.recordIntegrity.ruleVersion}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-medium uppercase text-ink-3">Sync Status</span>
                <p className="mt-0.5 flex items-center gap-1 font-medium text-pass-text">
                  <CheckCircle size={13} strokeWidth={2} />
                  {store.recordIntegrity.syncStatus}
                </p>
              </div>

              <div className="col-span-2">
                <span className="text-[11px] font-medium uppercase text-ink-3">Audit Trail</span>
                <p className="mt-0.5 flex items-center gap-1 font-medium text-pass-text">
                  <ShieldCheck size={13} strokeWidth={2} />
                  {store.recordIntegrity.auditTrail} (Cryptographic verification passed)
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-divider pt-2.5 text-right">
            <Link
              to="/admin/audit"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
            >
              View Audit Trail <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
