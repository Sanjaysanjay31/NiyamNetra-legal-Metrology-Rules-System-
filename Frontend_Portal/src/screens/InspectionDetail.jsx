/**
 * One inspection: the visit, its integrity record, and the packages under it.
 *
 * This screen is mounted twice — at /admin/inspections/:id and at
 * /inspector/inspections/:id — because it is the same record seen by two people
 * with different powers, not two records. Six decisions follow from that:
 *
 * 1. ROLE CHANGES THE ACTIONS, NEVER THE FACTS. An administrator sees who
 *    conducted the visit and can open any package; the officer who conducted it
 *    sees the same page plus the two things only they can do — add a package and
 *    submit. Nobody sees a different verdict, a softer word, or a hidden field.
 *
 * 2. LINKS ARE BUILT FROM THE CURRENT SECTION. A scan opened from the admin route
 *    goes to /admin/scans/:id; the same scan opened by its author goes to
 *    /inspector/scans/:id. Both resolve; a hardcoded prefix would 404 for one of
 *    them, which is precisely the dead-link class of defect App.jsx warns about.
 *
 * 3. THE INTEGRITY RECORD IS A PANEL, NOT A FOOTNOTE. Geofence status, mock
 *    location, clock skew and signature status are the four things a defence
 *    lawyer will ask about. They are shown together, in plain words, including
 *    when they are unremarkable — "inside the geofence" is evidence too, and a
 *    panel that appears only when something is wrong teaches the reader to skim.
 *
 * 4. THE INSPECTION-LEVEL SCOPE FLAG IS NOT THE PER-PACKAGE ONE. in_scope comes
 *    from the transaction type the officer chose; the authoritative test is CHK03,
 *    per package. Both are shown with that distinction spelled out, because
 *    "out of scope" on a visit and on a package mean different things.
 *
 * 5. SUBMIT IS A DIALOG, NOT A BUTTON. SubmitInspectionRequest requires
 *    signature_status, and its validator rejects a refused or unavailable
 *    signature with no note. The dialog enforces the same rule in the browser and
 *    says why, so the officer is never bounced by a 422 they could not predict.
 *
 * 6. WHAT THE ENDPOINT DOES NOT RETURN IS NAMED. _inspection_dict carries no
 *    coordinates (so there is no map), no per-inspection verdict tally, and no
 *    edited_offline flag — the last of which drives a third of the review-queue
 *    count and cannot be displayed anywhere. Stated at the foot of the page.
 */

import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  FileSignature,
  MapPin,
  Package,
  Send,
  ShieldCheck,
  Store as StoreIcon,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { CHECKS_TOTAL, SCAN_RESULTS } from '../lib/checks'
import { useDocumentTitle, useMutation, useResource } from '../lib/hooks'
import { inspectionDetail, storesById, usersById } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  CardHeader,
  DemoChip,
  EmptyState,
  Eyebrow,
  Field,
  MetaStat,
  Modal,
  PageHeader,
  Pill,
  RadioCards,
  SectionTitle,
  Skeleton,
  Textarea,
  VerdictBadge,
  cx,
  useToast,
} from '../ui'

/* The seven transaction types CreateInspectionRequest permits, with the two that
   put a package inside Chapter II's retail ambit marked. _RETAIL_TYPES in
   routers/inspections.py is the authority for that mark. */
const TRANSACTIONS = {
  retail_sale: { label: 'Retail sale', retail: true },
  packed_in_presence: { label: 'Packed in the buyer’s presence', retail: true },
  wholesale: { label: 'Wholesale', retail: false },
  institutional: { label: 'Institutional supply', retail: false },
  industrial: { label: 'Industrial supply', retail: false },
  export: { label: 'Export consignment', retail: false },
  other: { label: 'Other', retail: false },
}

const SIGNATURES = {
  signed: {
    label: 'Signed',
    family: 'pass',
    body: 'A representative of the shop signed the record.',
  },
  refused: {
    label: 'Refused',
    family: 'review',
    body: 'A representative was present and declined to sign. The refusal is recorded, and the inspection stands.',
  },
  unavailable: {
    label: 'Unavailable',
    family: 'na',
    body: 'No authorised representative was available to sign.',
  },
}

const GEOFENCE = {
  inside: {
    label: 'Inside the geofence',
    family: 'pass',
    icon: ShieldCheck,
  },
  outside: {
    label: 'Outside the geofence',
    family: 'review',
    icon: MapPin,
  },
  unknown: {
    label: 'Location not established',
    family: 'na',
    icon: MapPin,
  },
}

/* The submit dialog's three options, in the order SubmitInspectionRequest lists
   them. The note requirement is stated on the option itself rather than appearing
   as an error after the fact. */
const SIGNATURE_OPTIONS = [
  {
    value: 'signed',
    label: 'Signed',
    hint: 'A representative signed the record. A note is optional.',
  },
  {
    value: 'refused',
    label: 'Refused to sign',
    hint: 'A note is required: say who was present and what they said.',
  },
  {
    value: 'unavailable',
    label: 'No representative available',
    hint: 'A note is required: say who was approached and when.',
  },
]

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

/** Clock skew in words. A number of seconds means nothing to a reader; a minute
    of drift on a device that timestamps evidence means something. */
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

/**
 * One row of the integrity record. Always rendered, even when the answer is the
 * unremarkable one — see decision 3 in the header.
 */
function IntegrityRow({ icon: Icon, label, value, family, body }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cx(
          'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-pill border',
          family === 'pass' && 'border-pass-border bg-pass-fill text-pass-text',
          family === 'review' && 'border-review-border bg-review-fill text-review-text',
          family === 'violation' && 'border-violation-border bg-violation-fill text-violation-text',
          (family === 'na' || !family) && 'border-divider bg-surface-2 text-ink-3'
        )}
        aria-hidden="true"
      >
        <Icon size={15} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className="nn-eyebrow">{label}</p>
        <p className="text-small font-medium text-ink">{value}</p>
        {body && <p className="mt-0.5 max-w-prose text-caption text-ink-2">{body}</p>}
      </div>
    </li>
  )
}

/**
 * A package under this inspection.
 *
 * The endpoint gives id, commodity, brand, result and the two counts. It does not
 * give a thumbnail (ScanImageOut has no URL) or a severity, so the card carries
 * the result and the denominator and stops there — everything else is one click
 * away on the findings page, where the evidence sits beside it.
 */
function ScanCard({ scan, base }) {
  const meta = SCAN_RESULTS[scan.overall_result] ?? null
  const assessed = scan.checks_assessed ?? null
  const total = scan.checks_total ?? CHECKS_TOTAL
  const gap = assessed != null && total != null ? total - assessed : null
  const name =
    scan.brand_name && scan.commodity_generic
      ? `${scan.brand_name} — ${scan.commodity_generic}`
      : scan.brand_name || scan.commodity_generic || 'Unidentified package'

  return (
    <Card
      as={Link}
      to={`${base}/scans/${scan.id}`}
      interactive
      className="flex flex-col gap-3 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="nn-mono text-caption text-ink-3">Package #{scan.id}</p>
          <p className="mt-0.5 truncate text-small font-semibold text-ink">{name}</p>
        </div>
        <VerdictBadge verdict={scan.overall_result} />
      </div>

      <p className="text-caption text-ink-2">{meta?.blurb ?? 'This package has not been assessed.'}</p>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-divider pt-3">
        <span className="nn-mono text-caption text-ink-2">
          {assessed == null ? '—' : `${assessed} of ${total} checks assessed`}
        </span>
        {gap != null && gap > 0 && (
          <span className="nn-mono text-caption text-na-text">{gap} not assessed</span>
        )}
        {scan.duplicate_of != null && (
          <Pill family="na" icon={Copy}>
            Duplicate of #{scan.duplicate_of}
          </Pill>
        )}
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------- screen -- */

export default function InspectionDetail() {
  const { id } = useParams()
  const { t } = useI18n()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  /* The section this page was opened from, so every link stays inside it. */
  const base = location.pathname.startsWith('/admin') ? '/admin' : '/inspector'

  const [submitOpen, setSubmitOpen] = useState(false)
  const [signature, setSignature] = useState('signed')
  const [notes, setNotes] = useState('')

  const detail = useResource(() => endpoints.inspections.get(id), {
    deps: [id],
    fallback: inspectionDetail,
    label: `inspection-${id}`,
  })

  /* Two joins, both optional. The names improve the page; their absence must not
     empty it, so each falls back to the numeric id from the inspection itself. */
  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: 'stores',
  })
  const officers = useResource(() => endpoints.admin.users(), {
    enabled: isAdmin,
    fallback: Object.values(usersById),
    label: 'users',
  })

  const d = detail.data
  useDocumentTitle(d ? `Inspection #${d.id}` : t('nav.inspections'))

  const shop = useMemo(
    () => (shops.data ?? []).find((s) => s.id === d?.store_id) ?? null,
    [shops.data, d?.store_id]
  )
  const officer = useMemo(() => {
    if (!d) return null
    if (!isAdmin) return d.user_id === user?.id ? user : null
    return (officers.data ?? []).find((u) => u.id === d.user_id) ?? null
  }, [officers.data, d, isAdmin, user])

  const scans = d?.scans ?? []
  const isDraft = d?.status === 'draft'
  const mine = d != null && user != null && d.user_id === user.id
  /* Submitting is the author's act. owned_inspection lets an admin through, but an
     administrator signing off somebody else's visit is not a power this interface
     should offer — the record would name the wrong person as having closed it.
     Packages are never added from the portal: capture belongs to the field app. */
  const canSubmit = isDraft && mine

  const tally = useMemo(() => {
    const out = { compliant: 0, violation: 0, not_assessed: 0, out_of_scope: 0, unassessed: 0 }
    for (const s of scans) {
      if (s.overall_result == null) out.unassessed += 1
      else if (out[s.overall_result] != null) out[s.overall_result] += 1
    }
    return out
  }, [scans])

  const liveScans = useMemo(() => scans.filter((s) => s.duplicate_of == null), [scans])
  const duplicates = scans.length - liveScans.length

  const submit = useMutation((body) => endpoints.inspections.submit(id, body))
  const noteRequired = signature === 'refused' || signature === 'unavailable'
  const noteMissing = noteRequired && notes.trim() === ''

  async function onSubmit(e) {
    e.preventDefault()
    if (noteMissing) return
    try {
      await submit.run({ signature_status: signature, notes: notes.trim() || null })
      setSubmitOpen(false)
      toast.push({
        family: 'pass',
        title: 'Inspection submitted',
        body: 'The record is now closed to new packages. It remains readable and appears in reports.',
      })
      detail.reload()
    } catch {
      /* useMutation holds the error; the dialog renders it. */
    }
  }

  if (detail.loading) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Skeleton lines={3} className="max-w-md" />
        <Card className="mt-6 p-5">
          <Skeleton lines={6} />
        </Card>
      </div>
    )
  }

  if (detail.error || !d) {
    const notFound = detail.error?.status === 404
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => navigate(`${base}/inspections`)}>
          All inspections
        </Button>
        <Callout
          family={notFound ? 'review' : 'violation'}
          title={notFound ? 'That inspection is not available to you' : 'The inspection could not be loaded'}
          className="mt-5"
          actions={
            !notFound && (
              <Button size="sm" onClick={detail.reload}>
                Try again
              </Button>
            )
          }
        >
          {notFound
            ? 'The record does not exist, or it belongs to another officer. The API answers both cases the same way on purpose, so this page cannot be used to discover which inspections exist.'
            : (detail.error?.message ?? 'No detail was returned.')}
        </Callout>
      </div>
    )
  }

  const transaction = TRANSACTIONS[d.transaction_type] ?? {
    label: d.transaction_type ?? 'Not recorded',
    retail: false,
  }
  const geo = GEOFENCE[d.geofence_status] ?? GEOFENCE.unknown
  const sig = d.signature_status ? SIGNATURES[d.signature_status] : null
  const skew = skewLabel(d.clock_skew_seconds)
  const submitted = prettyTime(d.submitted_at)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => navigate(`${base}/inspections`)}>
        {base === '/admin' ? 'All inspections' : 'My inspections'}
      </Button>

      <PageHeader
        className="mt-4"
        eyebrow={`Inspection #${d.id}`}
        title={shop?.name ?? `Shop #${d.store_id}`}
        subtitle={
          shop
            ? [shop.address, shop.city, shop.pincode].filter(Boolean).join(', ')
            : 'The shop list did not load, so only the numeric id is known here.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(detail.demo || shops.demo) && <DemoChip />}
            {canSubmit && (
              <Button icon={Send} variant="primary" size="sm" onClick={() => setSubmitOpen(true)}>
                Submit inspection
              </Button>
            )}
          </div>
        }
        meta={
          <>
            <MetaStat label="Date" value={pretty(d.inspection_date)} />
            <MetaStat
              label="Status"
              value={d.status === 'submitted' ? 'Submitted' : 'Draft'}
              title={
                d.status === 'submitted'
                  ? submitted
                    ? `Submitted ${submitted}`
                    : undefined
                  : 'Packages can still be added while an inspection is a draft.'
              }
            />
            <MetaStat label="Packages" value={String(d.scan_count ?? scans.length)} />
            {officer ? (
              <MetaStat
                label="Inspector"
                value={officer.full_name}
                title={officer.employee_id}
              />
            ) : (
              isAdmin && <MetaStat label="Inspector" value={`Officer #${d.user_id}`} />
            )}
          </>
        }
      />

      {/* Scope, first, because it governs how everything below should be read. */}
      {d.in_scope === false && (
        <Callout
          family="na"
          title="This visit was recorded as outside Chapter II"
          icon={ClipboardList}
          className="mt-6"
        >
          {d.out_of_scope_reason ??
            'The transaction type recorded is not a retail sale, so the packaged-commodity declaration duties do not arise at the inspection level.'}{' '}
          Each package is still tested for applicability on its own by CHK03, so a package below may
          be assessed even though the visit is marked out of scope.
        </Callout>
      )}

      {isDraft && (
        <Callout family="review" title="This inspection is still a draft" icon={Clock} className="mt-6">
          {mine
            ? 'Packages can be added until you submit it. Submitting records the signature status and freezes the record against new packages.'
            : 'The officer who recorded it has not submitted it yet. It is visible to you, but only its author can submit it — the record would otherwise name the wrong person as having closed the visit.'}
        </Callout>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------------- packages -- */}
        <section>
          <SectionTitle
            caption={
              scans.length === 0
                ? 'No packages have been recorded against this inspection yet.'
                : `${liveScans.length} ${liveScans.length === 1 ? 'package' : 'packages'} assessed on their own evidence${
                    duplicates > 0
                      ? `, and ${duplicates} marked as a duplicate capture of another package in this visit`
                      : ''
                  }. Every verdict below belongs to one package; there is no combined score for a visit.`
            }
            right={
              scans.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {tally.compliant > 0 && (
                    <Pill family="pass">{tally.compliant} success</Pill>
                  )}
                  {tally.violation > 0 && (
                    <Pill family="violation">{tally.violation} violation{tally.violation === 1 ? '' : 's'}</Pill>
                  )}
                  {tally.not_assessed > 0 && (
                    <Pill family="na">{tally.not_assessed} not assessed</Pill>
                  )}
                  {tally.out_of_scope > 0 && (
                    <Pill family="na">{tally.out_of_scope} out of scope</Pill>
                  )}
                  {tally.unassessed > 0 && (
                    <Pill family="review">{tally.unassessed} awaiting assessment</Pill>
                  )}
                </div>
              )
            }
          >
            Packages
          </SectionTitle>

          {scans.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No packages recorded"
              body="This inspection was recorded without any package being captured. Packages are captured with the field app, which is the only place a photograph can enter the system."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {scans.map((s) => (
                <ScanCard key={s.id} scan={s} base={base} />
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------ integrity -- */}
        <aside className="flex flex-col gap-6">
          <Card className="p-5">
            <CardHeader
              title="Integrity record"
              caption="The four questions asked of any inspection record. Shown whether or not there is anything to flag."
            />
            <ul className="mt-3 divide-y divide-divider">
              <IntegrityRow
                icon={geo.icon}
                label="Location"
                family={geo.family}
                value={
                  d.geofence_status === 'outside' && d.geofence_distance_m != null
                    ? `${Math.round(d.geofence_distance_m)} m from the registered point`
                    : geo.label
                }
                body={
                  d.geofence_reason ??
                  (d.geofence_status === 'inside' && d.geofence_distance_m != null
                    ? `Recorded ${Math.round(d.geofence_distance_m)} m from the shop's registered point, within its ${shop?.geofence_radius_m ?? 150} m radius.`
                    : undefined)
                }
              />
              <IntegrityRow
                icon={d.mock_location === true ? AlertTriangle : CheckCircle2}
                label="Device location source"
                family={d.mock_location === true ? 'violation' : d.mock_location == null ? 'na' : 'pass'}
                value={
                  d.mock_location === true
                    ? 'The device reported a mock location'
                    : d.mock_location === false
                      ? 'A real device fix'
                      : 'Not reported'
                }
                body={
                  d.mock_location === true
                    ? 'A mock-location provider was active. The capture is kept and flagged; it is not silently discarded, and it is not treated as a genuine fix.'
                    : d.mock_location == null
                      ? 'The device did not report whether its location was mocked. Absence of the flag is not the same as a clean fix.'
                      : undefined
                }
              />
              <IntegrityRow
                icon={Clock}
                label="Clock"
                family={skew?.tone === 'warn' ? 'review' : skew?.tone === 'ok' ? 'pass' : 'na'}
                value={skew?.text ?? 'No local timestamp was recorded'}
                body={
                  skew?.tone === 'warn'
                    ? 'A large drift matters when a capture time is evidence. The server time is the one recorded; the drift is kept so the difference is auditable.'
                    : undefined
                }
              />
              <IntegrityRow
                icon={FileSignature}
                label="Signature"
                family={sig?.family}
                value={sig?.label ?? 'Not yet recorded'}
                body={
                  sig?.body ??
                  'The signature status is set at submission, so a draft has none.'
                }
              />
            </ul>
          </Card>

          <Card className="p-5">
            <CardHeader title="Visit" caption="As recorded at the shop." />
            <dl className="mt-3 flex flex-col gap-3">
              <div>
                <dt className="nn-eyebrow">Transaction type</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-small text-ink">
                  {transaction.label}
                  <Pill family={transaction.retail ? 'pass' : 'na'}>
                    {transaction.retail ? 'Retail ambit' : 'Outside retail ambit'}
                  </Pill>
                </dd>
              </div>
              {shop && (
                <div>
                  <dt className="nn-eyebrow">Shop</dt>
                  <dd className="mt-0.5 text-small text-ink">
                    <span className="flex items-center gap-1.5">
                      <StoreIcon size={13} strokeWidth={1.9} aria-hidden="true" className="text-ink-3" />
                      {shop.store_type ? shop.store_type.replace(/_/g, ' ') : 'type not recorded'}
                    </span>
                    <span className="nn-mono mt-1 block text-caption text-ink-3">
                      Shop #{shop.id}
                      {shop.geofence_radius_m ? ` · ${shop.geofence_radius_m} m geofence` : ''}
                    </span>
                  </dd>
                </div>
              )}
              {officer && (
                <div>
                  <dt className="nn-eyebrow">Recorded by</dt>
                  <dd className="mt-0.5 text-small text-ink">
                    {officer.full_name}
                    <span className="nn-mono block text-caption text-ink-3">
                      {officer.employee_id}
                      {officer.jurisdiction ? ` · ${officer.jurisdiction}` : ''}
                    </span>
                  </dd>
                </div>
              )}
              {submitted && (
                <div>
                  <dt className="nn-eyebrow">Submitted</dt>
                  <dd className="nn-mono mt-0.5 text-small text-ink">{submitted}</dd>
                </div>
              )}
              {d.notes && (
                <div>
                  <dt className="nn-eyebrow">Officer’s note</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-small text-ink-2">{d.notes}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card className="p-5">
            <Eyebrow>Not on this page</Eyebrow>
            <ul className="mt-2 flex flex-col gap-2.5">
              {[
                [
                  'A map',
                  'GET /inspections/{id} returns the geofence status and distance but not the coordinates, although the columns exist on the model.',
                ],
                [
                  'A verdict for the visit',
                  'There is none to show. Each package is assessed on its own evidence, and averaging them would invent a number the Rules do not recognise.',
                ],
                [
                  'Whether this record was edited offline',
                  'edited_offline is counted in the review-queue total but is not returned by _inspection_dict, so no screen can display it.',
                ],
              ].map(([title, body]) => (
                <li key={title} className="text-caption">
                  <span className="font-semibold text-ink">{title}. </span>
                  <span className="text-ink-2">{body}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      {/* --------------------------------------------------------- submit -- */}
      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit this inspection"
        description="Submitting records the signature status and closes the record to new packages. Findings already recorded are unaffected."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSubmitOpen(false)} disabled={submit.pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Send}
              loading={submit.pending}
              disabled={noteMissing}
              disabledReason="A refused or unavailable signature must be explained in the note."
              onClick={onSubmit}
            >
              Submit
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {submit.error && (
            <Callout family="violation" title="The inspection was not submitted">
              {submit.error.status === 409
                ? 'It has already been submitted. Reload the page to see the current state.'
                : submit.error.message}
            </Callout>
          )}

          <div>
            <Eyebrow>Signature status</Eyebrow>
            <RadioCards
              name="signature_status"
              value={signature}
              onChange={setSignature}
              options={SIGNATURE_OPTIONS}
              className="mt-2"
            />
          </div>

          <Field
            label="Note"
            hint={
              noteRequired
                ? 'Required. The API rejects a refused or unavailable signature with no explanation, and so does this form.'
                : 'Optional. Anything a reader of the record would need to understand the visit.'
            }
            error={noteMissing ? 'Explain the refusal or the absence of a representative.' : undefined}
            required={noteRequired}
          >
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  noteRequired
                    ? 'e.g. The manager was present, read the summary, and declined to sign. A copy was left at the counter.'
                    : 'e.g. Routine market inspection; representative present throughout.'
                }
              />
            )}
          </Field>

          <p className="text-caption text-ink-3">
            {scans.length === 0
              ? 'No packages have been captured. An inspection can be submitted without any — it records that the visit happened.'
              : `${scans.length} ${scans.length === 1 ? 'package is' : 'packages are'} attached to this inspection.`}
          </p>
        </form>
      </Modal>
    </div>
  )
}
