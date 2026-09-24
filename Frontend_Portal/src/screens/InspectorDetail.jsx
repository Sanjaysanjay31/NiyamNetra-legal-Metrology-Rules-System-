/**
 * Inspector Details — Administrative Dossier for Field Officers.
 *
 * Route: /admin/inspectors/:inspectorId
 *
 * Displays statutory officer profile, jurisdiction, and inspection activity.
 * Strict regulatory privacy: NO fake HR/salary/attendance/rating info.
 */

import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  MapPin,
  Shield,
  ShieldCheck,
  Tag,
  User,
  XCircle,
} from 'lucide-react'
import { useDocumentTitle } from '../lib/hooks'
import { getInspectorDetail } from '../mock/inspectorsData'
import {
  Button,
  Card,
  cx,
} from '../ui'

function Breadcrumb({ inspectorId, name }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-ink-3">
      <Link
        to="/admin"
        className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
      >
        Dashboard
      </Link>
      <span className="text-ink-3">/</span>
      <Link
        to="/admin/inspectors"
        className="font-medium text-ink-2 transition-colors duration-fast hover:text-ink"
      >
        Inspectors
      </Link>
      <span className="text-ink-3">/</span>
      <span className="font-semibold text-ink">{inspectorId}</span>
    </nav>
  )
}

function StatusBadge({ status }) {
  const norm = String(status ?? '').trim().toLowerCase()

  if (norm === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-pass-border bg-pass-fill px-2.5 py-0.5 text-[12px] font-semibold text-pass-text">
        <span className="h-2 w-2 rounded-full bg-pass-graphic" aria-hidden="true" />
        Active
      </span>
    )
  }

  if (norm === 'on assignment' || norm === 'assigned') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-review-border bg-review-fill px-2.5 py-0.5 text-[12px] font-semibold text-review-text">
        <span className="h-2 w-2 rounded-full bg-review-graphic" aria-hidden="true" />
        On Assignment
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-divider bg-surface-2 px-2.5 py-0.5 text-[12px] font-medium text-ink-3">
      <span className="h-2 w-2 rounded-full bg-ink-4" aria-hidden="true" />
      Inactive
    </span>
  )
}

export default function InspectorDetail() {
  const { inspectorId } = useParams()
  const navigate = useNavigate()

  const inspector = useMemo(() => {
    return getInspectorDetail(inspectorId || 'INS-001')
  }, [inspectorId])

  useDocumentTitle(`Inspector Details · ${inspector.name} (${inspector.id})`)

  return (
    <div className="nn-admin-page nn-inspector-detail-page flex flex-col gap-5">
      {/* ---- Header ---- */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-divider pb-4">
        <div className="flex flex-col gap-1.5">
          <Link
            to="/admin/inspectors"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
          >
            <ArrowLeft size={14} /> Back to Inspectors
          </Link>

          <div className="mt-1">
            <Breadcrumb inspectorId={inspector.id} name={inspector.name} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-bold tracking-[-0.01em] text-ink">
              {inspector.name}
            </h1>
            <span className="nn-mono text-[16px] text-ink-3 font-semibold">({inspector.id})</span>
            <StatusBadge status={inspector.status} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/inspectors')}
            className="text-[12px] font-semibold"
          >
            Back to Roster
          </Button>
        </div>
      </header>

      {/* ---- Inspector Overview Card ---- */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between border-b border-divider pb-2.5">
          <div className="flex items-center gap-2">
            <User size={16} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Officer Dossier
            </h2>
          </div>
          <span className="nn-mono text-[11px] font-semibold text-ink-3">
            ID: {inspector.badgeId}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 sm:grid-cols-4 text-[13px]">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Inspector ID
            </span>
            <p className="nn-mono mt-0.5 font-bold text-ink">{inspector.id}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Official Name
            </span>
            <p className="mt-0.5 font-semibold text-ink">{inspector.name}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Assigned Area
            </span>
            <p className="mt-0.5 font-medium text-ink">{inspector.area}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Designation
            </span>
            <p className="mt-0.5 font-medium text-ink-2">{inspector.designation}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Jurisdiction Division
            </span>
            <p className="mt-0.5 font-medium text-ink">{inspector.division}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Inspections Recorded
            </span>
            <p className="nn-mono mt-0.5 text-[16px] font-bold text-ink">{inspector.inspections}</p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Violations Identified
            </span>
            <p className="nn-mono mt-0.5 text-[16px] font-bold text-violation-text">
              {inspector.violationsFound}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">
              Last Field Activity
            </span>
            <p className="nn-mono mt-0.5 font-medium text-ink-2">{inspector.lastInspection}</p>
          </div>
        </div>
      </Card>

      {/* ---- Inspection Activity History ---- */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-divider px-5 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-ink-2" />
            <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-ink">
              Recent Field Inspections
            </h2>
          </div>
          <span className="text-[11px] text-ink-3">
            Officer statutory log
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-divider bg-surface-2 text-left">
                <th className="nn-eyebrow whitespace-nowrap px-4 py-3">Inspection ID</th>
                <th className="nn-eyebrow whitespace-nowrap px-4 py-3">Store</th>
                <th className="nn-eyebrow whitespace-nowrap px-4 py-3">Area</th>
                <th className="nn-eyebrow whitespace-nowrap px-4 py-3">Date</th>
                <th className="nn-eyebrow whitespace-nowrap px-4 py-3">Result</th>
                <th className="nn-eyebrow whitespace-nowrap px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-divider last:border-b-0 hover:bg-surface-2">
                <td className="px-4 py-3.5">
                  <span className="nn-mono font-bold text-ink">{inspector.latestInspectionId}</span>
                </td>
                <td className="px-4 py-3.5 font-medium text-ink">
                  {inspector.latestStore}
                </td>
                <td className="px-4 py-3.5 text-ink-2">
                  {inspector.area}
                </td>
                <td className="nn-mono px-4 py-3.5 text-ink-2">
                  {inspector.lastInspection}
                </td>
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center gap-1 rounded border border-violation-border bg-violation-fill px-2 py-0.5 text-[11px] font-semibold text-violation-text">
                    <span className="h-1.5 w-1.5 rounded-full bg-violation-graphic" aria-hidden="true" />
                    Violation
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <Link
                    to={`/admin/inspections/${inspector.latestInspectionRawId || '10230'}`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent-text hover:underline"
                  >
                    View &rarr;
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
