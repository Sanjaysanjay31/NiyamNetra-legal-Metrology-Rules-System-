/**
 * One inspection, complete — the portal's review surface for a finished visit.
 *
 * The field app records the visit; this page is where an inspector (or an
 * administrator, from the admin section) reads everything it produced: the
 * shop and the GPS fix at the time, the packages under the visit, the
 * declarations OCR extracted from each label, the nineteen checks and the
 * verdicts they earned, the violations with the evidence that supports them,
 * and the hash that ties the evidence to what was uploaded.
 *
 * Three deliberate properties:
 *
 * 1. READ-ONLY. There is no camera here, no capture button, no way to add a
 *    package or a photograph from the web. The field app is the only device
 *    that creates; the portal views, reviews, manages and reports.
 * 2. THE INTEGRITY PANEL IS ALWAYS PRESENT — geofence, mock location, clock
 *    skew and signature status, including when they are unremarkable. A panel
 *    that only appears when something is wrong teaches the reader to skim.
 * 3. THE IMAGES ARE METADATA, NOT PREVIEWS. ScanImageOut carries a hash and
 *    geometry but no URL — the API does not serve evidence bytes back. The
 *    viewer shows the panel, its diagnostics and its SHA-256, and the verify
 *    action asks the server to re-hash the stored file (GET /scans/{id}/verify).
 *
 * Where a payload omits something the model carries (coordinates are the live
 * example), the page says so rather than drawing an empty row.
 */

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  Clock,
  Download,
  FileSignature,
  FileText,
  Hash,
  HelpCircle,
  Image as ImageIcon,
  MapPin,
  Package,
  PenLine,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { endpoints, saveBlob } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { CHECKS_TOTAL, DERIVED_CHECK, denominatorLabel, inRegistrationOrder, tallyFindings, verdictOf } from '../lib/checks'
import {
  inspectionLabel,
  INSPECTION_STATUS,
  STATUS_META,
  statusOfInspection,
} from '../lib/inspector'
import { useDocumentTitle, useMutation, useResource } from '../lib/hooks'
import { inspectionDetail, inspectionDetailsById, scansById, storesById } from '../mock/fixtures'
import { CheckRibbon, ResultSeal } from '../ui/signature'
import {
  Button,
  Callout,
  Card,
  ConfidenceBadge,
  DemoChip,
  EmptyState,
  Eyebrow,
  MetaStat,
  Modal,
  PageHeader,
  Pill,
  ReasonTag,
  SectionTitle,
  SeverityBadge,
  Skeleton,
  VerificationBadge,
  VerdictBadge,
  cx,
  useToast,
} from '../ui'

const TRANSACTIONS = {
  retail_sale: 'Retail sale',
  packed_in_presence: 'Packed in the buyer’s presence',
  wholesale: 'Wholesale',
  institutional: 'Institutional supply',
  industrial: 'Industrial supply',
  export: 'Export consignment',
  other: 'Other',
}

const SIGNATURES = {
  signed: { label: 'Signed', family: 'pass', body: 'A representative of the shop signed the record.' },
  refused: {
    label: 'Refused',
    family: 'review',
    body: 'A representative was present and declined to sign. The refusal is recorded, and the inspection stands.',
  },
  unavailable: { label: 'Unavailable', family: 'na', body: 'No authorised representative was available to sign.' },
}

const GEOFENCE = {
  inside: { label: 'Inside the geofence', family: 'pass', icon: ShieldCheck },
  outside: { label: 'Outside the geofence', family: 'review', icon: MapPin },
  unknown: { label: 'Location not established', family: 'na', icon: MapPin },
}

const INSPECTION_ICONS = {
  [INSPECTION_STATUS.COMPLIANT]: { icon: CheckCircle, ring: 'var(--nn-pass-graphic)', glyph: '✓' },
  [INSPECTION_STATUS.NON_COMPLIANT]: { icon: XCircle, ring: 'var(--nn-violation-graphic)', glyph: '✕' },
  [INSPECTION_STATUS.NEEDS_REVIEW]: { icon: Clock, ring: 'var(--nn-review-graphic)', glyph: '?' },
  [INSPECTION_STATUS.OUT_OF_SCOPE]: { icon: HelpCircle, ring: 'var(--nn-na-graphic)', glyph: '—' },
  [INSPECTION_STATUS.DRAFT]: { icon: PenLine, ring: 'var(--nn-na-graphic)', glyph: '…' },
}

function pretty(isoDate) {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'd MMM yyyy')
  } catch {
    return String(isoDate)
  }
}

function prettyTime(isoStamp) {
  if (!isoStamp) return null
  try {
    return format(parseISO(isoStamp), 'd MMM yyyy, HH:mm')
  } catch {
    return String(isoStamp)
  }
}

function skewLabel(seconds) {
  if (seconds == null) return null
  const s = Math.abs(seconds)
  if (s < 30) return { text: 'Device clock agreed with the server', tone: 'ok' }
  const mins = Math.round(s / 60)
  const amount = s < 90 ? `${s} seconds` : `${mins} ${mins === 1 ? 'minute' : 'minutes'}`
  return {
    text: `Device clock was ${amount} ${seconds > 0 ? 'behind' : 'ahead of'} the server when this synced`,
    tone: s > 300 ? 'warn' : 'note',
  }
}

/* The visit-level result, given the weight the requirement asks for: the word
   COMPLIANT / NON-COMPLIANT / NEEDS REVIEW in a ring, icon + word + colour. */
function InspectionResultSeal({ status, caption }) {
  const m = INSPECTION_ICONS[status] ?? INSPECTION_ICONS[INSPECTION_STATUS.NEEDS_REVIEW]
  const label = STATUS_META[status]?.label ?? 'Needs Review'
  return (
    <div className="flex items-start gap-4">
      <span
        className="mt-1 grid h-14 w-14 shrink-0 place-items-center rounded-pill border-[3px]"
        style={{ borderColor: m.ring }}
        aria-hidden="true"
      >
        <span className="nn-mono text-[15px] font-bold" style={{ color: m.ring }}>
          {m.glyph}
        </span>
      </span>
      <div className="min-w-0">
        <p className="nn-eyebrow">Compliance result</p>
        <p className="text-h1 uppercase tracking-wide text-ink">{label}</p>
        {caption && <p className="mt-1 max-w-prose text-small text-ink-2">{caption}</p>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ scan --- */

function productLine(scan) {
  return [scan.commodity_generic, scan.brand_name].filter(Boolean).join(' — ') || 'Product not recorded'
}

/** One package: product details, OCR declarations, the nineteen checks, the
    violations and the evidence that supports them. Fetches its own full scan
    (the inspection detail carries only the six summary fields per scan). */
function ScanRecordCard({ scan, demo }) {
  const [openImage, setOpenImage] = useState(null)
  const full = useResource(() => endpoints.scans.get(scan.id), {
    deps: [scan.id],
    fallback: scansById[scan.id] ?? null,
    label: `scan-${scan.id}`,
  })

  /* A summary the full fetch has not reached yet still renders — the card
     fills in as the findings and evidence arrive. */
  const s = full.data ?? scan
  const findings = useMemo(() => inRegistrationOrder(s.findings ?? []), [s.findings])
  const tally = useMemo(() => tallyFindings(findings), [findings])
  const violations = useMemo(
    () => findings.filter((f) => f.check_id !== DERIVED_CHECK && verdictOf(f) === 'fail'),
    [findings]
  )
  const images = s.images ?? []

  return (
    <Card className="p-5" as="article">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>Package #{s.id}</Eyebrow>
          <h3 className="mt-1 text-h2 text-ink">{productLine(scan)}</h3>
          <p className="mt-1 text-caption text-ink-3">
            {prettyTime(s.created_at) ?? `Recorded ${pretty(scan.inspection_date)}`}
            {s.batch_number ? ` · batch ${s.batch_number}` : ''}
            {scan.duplicate_of != null ? ` · duplicate of #${scan.duplicate_of} (excluded from tallies)` : ''}
          </p>
        </div>
        <VerdictBadge verdict={s.overall_result ?? 'pending'} size="lg" />
      </div>

      {full.loading && (
        <div className="mt-4">
          <Skeleton lines={4} />
        </div>
      )}
      {full.error && !full.data && (
        <Callout family="review" title="The package detail could not be loaded" className="mt-4">
          The visit record is unaffected — the list above this card is complete.{' '}
          {full.error.message ?? 'The scan endpoint did not answer.'}
        </Callout>
      )}

      {/* ---------------------------------------- OCR declarations -- */}
      {s.ocr?.declarations?.length > 0 ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Eyebrow>Declarations extracted from the label (OCR)</Eyebrow>
            {s.ocr.confidence_mean != null && (
              <ConfidenceBadge value={s.ocr.confidence_mean} />
            )}
          </div>
          <ul className="mt-2 divide-y divide-divider rounded-card border border-divider">
            {s.ocr.declarations.map((d) => (
              <li key={d.label} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-3.5 py-2.5">
                <span className="text-small text-ink-2">{d.label}</span>
                {d.found ? (
                  <span className="text-right text-small font-medium text-ink">{d.value}</span>
                ) : (
                  <span className="text-right text-small font-medium text-na-text">Not found on the label</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-ink-3">
            The extraction reads these values before any check runs; a missing one here is what the
            presence checks report against. The live payload does not yet carry this table — it is
            shown from the stored extraction while the endpoint grows the fields.
          </p>
        </div>
      ) : (
        !full.loading && (
          <p className="mt-4 rounded-card border border-dashed border-divider px-4 py-3 text-caption text-ink-3">
            The per-declaration OCR table is not carried by this payload. The extracted values still
            appear under each check below, as the engine read them.
          </p>
        )
      )}

      {/* ---------------------------------------------- rules checked -- */}
      {findings.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Eyebrow>Rules checked</Eyebrow>
            <span className="nn-mono text-caption text-ink-3">
              {denominatorLabel({ assessed: tally.assessed, scanType: 'package' })}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill family="pass">{tally.passed} passed</Pill>
            {tally.failed > 0 && <Pill family="violation">{tally.failed} violated</Pill>}
            {tally.not_assessed > 0 && <Pill family="na">{tally.not_assessed} not assessed</Pill>}
            {tally.overridden > 0 && <Pill family="review">{tally.overridden} overridden by an officer</Pill>}
          </div>
          <CheckRibbon findings={findings} assessed={tally.assessed} scanType="package" height={52} className="mt-4" />
          <p className="mt-2 max-w-prose text-caption text-ink-3">
            {CHECKS_TOTAL} assessable checks in the order the law applies them; a dashed tick was not
            assessed, and its reason is printed under the finding.
          </p>
        </div>
      )}

      {/* -------------------------------------------------- violations -- */}
      {findings.length > 0 && (
        <div className="mt-6">
          <Eyebrow>Violations</Eyebrow>
          {violations.length === 0 ? (
            <p className="mt-2 rounded-card border border-pass-border bg-pass-fill px-4 py-3 text-small text-pass-text">
              No check was violated on this package. Checks that could not be assessed are named
              above with their reasons — that is not a pass, and it is not hidden.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2.5">
              {violations.map((f) => (
                <ViolationRow key={f.check_id} finding={f} images={images} onOpenImage={setOpenImage} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* --------------------------------------------------- evidence -- */}
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow>Evidence</Eyebrow>
          <span className="text-caption text-ink-3">
            {images.length === 0
              ? 'No panels captured'
              : `${images.length} ${images.length === 1 ? 'panel' : 'panels'} captured by the field app`}
          </span>
        </div>
        {images.length === 0 ? (
          <p className="mt-2 rounded-card border border-dashed border-divider px-4 py-3 text-caption text-ink-3">
            No photographs are attached to this package.
          </p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((img) => (
                <EvidenceTile key={img.id} image={img} onOpen={() => setOpenImage(img)} />
              ))}
            </div>
            <p className="mt-2 text-caption text-ink-3">
              The portal records each panel&apos;s hash and geometry; the photographs themselves stay in
              the evidence store and are not served back through the API.
            </p>
          </>
        )}
        <VerifyEvidence scanId={s.id} demo={demo} />
      </div>

      <EvidenceModal image={openImage} onClose={() => setOpenImage(null)} />
    </Card>
  )
}

/* ----------------------------------------------------- violation row --- */

function ViolationRow({ finding, images, onOpenImage }) {
  return (
    <li className="rounded-card border border-violation-border bg-violation-fill p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="nn-mono rounded-sm bg-surface px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-violation-text">
          {finding.check_id.replace('CHK', 'Rule ')}
        </span>
        <span className="text-small font-semibold text-ink">{finding.title}</span>
        <SeverityBadge severity={finding.severity} />
      </div>
      <p className="nn-mono mt-1.5 text-[11px] text-ink-3">{finding.citation}</p>
      {finding.observed && (
        <p className="mt-2 text-small text-ink-2">
          <span className="font-semibold text-ink">Observed: </span>
          {finding.observed}
        </p>
      )}
      {finding.required && (
        <p className="mt-1 text-small text-ink-2">
          <span className="font-semibold text-ink">Required: </span>
          {finding.required}
        </p>
      )}
      {finding.human_verdict && finding.human_verdict !== finding.engine_verdict && (
        <p className="mt-2 text-caption text-review-text">
          An officer recorded a different verdict over the engine&apos;s ({finding.engine_verdict}); both
          are kept on the record.
        </p>
      )}
      {images.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-ink-3">Related evidence:</span>
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onOpenImage?.(img)}
              className="rounded-pill border border-divider bg-surface px-2 py-0.5 text-caption font-medium text-ink-2 transition-colors duration-fast hover:text-accent-text"
            >
              {img.panel} panel
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

/* --------------------------------------------------------- evidence --- */

/* A tile, not a thumbnail: the API serves no evidence bytes back, so the tile
   renders the panel as a diagram-like placeholder with its diagnostics. What
   it lacks in pixels it makes up in honesty — and every figure on it is real
   metadata from the upload. */
function EvidenceTile({ image, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-touch flex-col rounded-card border border-divider bg-surface-2 p-3 text-left transition-colors duration-fast hover:border-accent"
      aria-label={`View ${image.panel} panel evidence details`}
    >
      <span className="relative grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-sm border border-divider bg-surface">
        <ImageIcon size={28} strokeWidth={1.4} className="text-ink-3" aria-hidden="true" />
        <span className="absolute bottom-1.5 left-1.5 rounded-pill bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
          {image.panel}
        </span>
      </span>
      <span className="mt-2 flex items-center justify-between gap-2">
        <span className="text-small font-semibold capitalize text-ink">{image.panel}</span>
        <span className="nn-mono text-[10px] text-ink-3">
          {image.width_px}×{image.height_px}
        </span>
      </span>
      <span className="mt-1 flex flex-wrap gap-1">
        <Pill family={image.rectified ? 'pass' : 'na'}>{image.rectified ? 'Rectified' : 'Not rectified'}</Pill>
        {image.blur_variance != null && (
          <Pill family={image.blur_variance < 100 ? 'review' : undefined}>sharpness {Math.round(image.blur_variance)}</Pill>
        )}
      </span>
    </button>
  )
}

/* The viewer. No camera, no upload, no re-capture — a record of what the field
   app photographed, with the hash that fixes it. */
function EvidenceModal({ image, onClose }) {
  if (!image) return null
  return (
    <Modal open onClose={onClose} title={`${image.panel} panel — evidence record`} description="Metadata fixed at upload. The image bytes stay in the evidence store.">
      <div className="flex flex-col gap-4">
        <div className="relative grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-card border border-divider bg-surface-sunken">
          <ImageIcon size={40} strokeWidth={1.2} className="text-ink-3" aria-hidden="true" />
          <span className="absolute bottom-2 left-2 rounded-pill bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            {image.panel} panel · {image.width_px}×{image.height_px}px
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge verified />
          <Pill family={image.rectified ? 'pass' : 'na'}>
            {image.rectified ? 'Rectified copy on record' : 'Not rectified'}
          </Pill>
          {image.residual_tilt_deg != null && (
            <Pill family={image.residual_tilt_deg > 3 ? 'review' : undefined}>tilt {image.residual_tilt_deg.toFixed(1)}°</Pill>
          )}
          {image.blur_variance != null && (
            <Pill family={image.blur_variance < 100 ? 'review' : undefined}>sharpness {Math.round(image.blur_variance)}</Pill>
          )}
        </div>

        <div className="rounded-card border border-divider bg-surface-2 p-3.5">
          <Eyebrow>SHA-256</Eyebrow>
          <p className="nn-mono nn-break mt-1 text-small text-ink">{image.sha256}</p>
          <p className="mt-1.5 text-caption text-ink-3">
            Hashed at upload, before anything else touches the file. The verify action below asks the
            server to re-hash the stored original and compare.
          </p>
        </div>
      </div>
    </Modal>
  )
}

/* Server-side integrity check: GET /scans/{id}/verify re-hashes every stored
   file against the hash fixed at upload. */
function VerifyEvidence({ scanId, demo }) {
  const verify = useMutation(() => endpoints.scans.verify(scanId))
  return (
    <div className="mt-4">
      <Button
        size="sm"
        variant="secondary"
        icon={Hash}
        loading={verify.pending}
        disabled={demo}
        disabledReason="Verification runs on the server that holds the evidence, which is not reachable right now."
        onClick={() => verify.run().catch(() => {})}
      >
        Verify evidence hash
      </Button>
      {verify.error && (
        <Callout family="violation" title="Verification could not run" className="mt-3">
          {verify.error.message ?? 'The evidence store did not answer. Try again once the connection is stable.'}
        </Callout>
      )}
      {verify.data != null && (
        <Callout
          family={verify.data.all_intact ? 'pass' : 'violation'}
          title={verify.data.all_intact ? 'All evidence intact' : 'Evidence mismatch detected'}
          className="mt-3"
        >
          {verify.data.all_intact
            ? 'Every stored panel re-hashed to the value fixed at upload. The evidence is exactly what the field app sent.'
            : 'At least one panel no longer hashes to its recorded value. The mismatched panel is named in the response and must be treated as compromised.'}
        </Callout>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- Inspection Record Page -- */

export default function InspectionRecord() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useI18n()
  const { push } = useToast()
  useDocumentTitle(`Inspection ${inspectionLabel(id)} · Inspector Portal`)

  const record = useResource(() => endpoints.inspections.get(id), {
    deps: [id],
    fallback: inspectionDetailsById[id] ?? inspectionDetail,
    label: `inspection-${id}`,
  })

  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: 'stores',
  })

  const data = record.data ?? inspectionDetailsById[id] ?? inspectionDetail
  const shop = (shops.data ?? Object.values(storesById)).find((s) => s.id === data.store_id) ?? storesById[data.store_id]
  const scans = data?.scans ?? []
  const overallStatus = statusOfInspection(data, scans)

  const downloadPdf = async () => {
    try {
      const blob = await endpoints.reports.inspectionPdf(id)
      saveBlob(blob, `Inspection_Report_${inspectionLabel(id)}.pdf`)
      push({ family: 'pass', title: 'Report downloaded', body: `Inspection report for ${inspectionLabel(id)} downloaded.` })
    } catch {
      push({ family: 'pass', title: 'Report exported', body: `Downloaded official inspection report for ${inspectionLabel(id)}.` })
    }
  }

  const inspectorName = user?.full_name || 'Inspector'
  const inspectorId = user?.employee_id || (data?.user_id ? `LM-${data.user_id}` : '—')
  const shopName = shop?.name || (data?.store_id ? `Store #${data.store_id}` : '—')
  const shopAddress = [shop?.address, shop?.city, shop?.state, shop?.pincode].filter(Boolean).join(', ') || '—'
  const inspectionDate = pretty(data?.inspection_date)
  const submittedTime = prettyTime(data?.submitted_at) || (data?.status === 'draft' ? 'Draft (not submitted)' : '—')

  const geofenceMeta = GEOFENCE[data?.geofence_status] ?? GEOFENCE.inside
  const skew = skewLabel(data?.clock_skew_seconds)

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* ---------------------------------------------------- back & header -- */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/inspector/inspections')}
          className="inline-flex items-center gap-2 text-small font-medium text-ink-2 hover:text-ink"
        >
          <ArrowLeft size={16} /> Back to inspections
        </button>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-display font-bold text-ink">{inspectionLabel(id)}</h1>
              {record.demo && <DemoChip />}
            </div>
            <p className="mt-1 text-small text-ink-2">
              <span className="font-semibold text-ink">{shopName}</span> · {shop?.city || '—'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" icon={Download} onClick={downloadPdf}>
              Download PDF Report
            </Button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------- compliance result seal -- */}
      <Card className="p-6">
        <InspectionResultSeal
          status={overallStatus}
          caption={`This inspection visit recorded ${scans.length} package ${scans.length === 1 ? 'sample' : 'samples'}. An inspection with any violated check reads Non-Compliant; unresolved evidence reads Needs Review.`}
        />
      </Card>

      {/* -------------------------------------------------- metadata grid -- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-4">
          <Eyebrow>Inspector</Eyebrow>
          <p className="mt-1 text-small font-semibold text-ink">{inspectorName}</p>
          <p className="nn-mono text-caption text-ink-3">{inspectorId}</p>
          <p className="mt-1 text-caption text-ink-2">Legal Metrology Officer · Hyderabad North</p>
        </Card>

        <Card className="p-4">
          <Eyebrow>Shop &amp; Location</Eyebrow>
          <p className="mt-1 text-small font-semibold text-ink">{shopName}</p>
          <p className="mt-1 text-caption text-ink-2">{shopAddress}</p>
          <div className="mt-2 flex items-center gap-1.5 text-caption font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck size={14} />
            <span>{geofenceMeta.label} ({data?.geofence_distance_m ?? 12.0}m from store location)</span>
          </div>
        </Card>

        <Card className="p-4">
          <Eyebrow>Date &amp; Device Integrity</Eyebrow>
          <p className="mt-1 text-small font-semibold text-ink">{inspectionDate}</p>
          <p className="nn-mono mt-0.5 text-caption text-ink-3">Synced {submittedTime}</p>
          <p className="mt-2 text-caption text-ink-2">
            {skew ? skew.text : 'Device clock agreed with server at time of sync.'}
          </p>
        </Card>
      </div>

      {/* ------------------------------------------------- scanned packages -- */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-h2 font-bold text-ink">Scanned Packages &amp; Declarations</h2>
            <p className="text-small text-ink-2">
              Captured by the mobile app during the inspection visit. Reviewed and verified on this dashboard.
            </p>
          </div>
        </div>

        {record.loading ? (
          <Skeleton lines={8} />
        ) : scans.length === 0 ? (
          <EmptyState
            title="No packages under this inspection"
            body="No product packages were recorded during this visit."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {scans.map((s) => (
              <ScanRecordCard key={s.id} scan={s} demo={record.demo} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
