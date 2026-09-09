/**
 * New inspection — the first act of a visit, and the record everything else hangs on.
 *
 * This screen creates the draft. It does not assess anything and it does not
 * decide scope; both of those are the server's to do, and saying so on the page
 * is the point. Four things here are load-bearing and are surfaced rather than
 * hidden:
 *
 * 1. SCOPE IS THE TRANSACTION'S, NOT A TOGGLE. routers/inspections.py treats only
 *    `retail_sale` and `packed_in_presence` as in scope; every other transaction
 *    type is *recorded* but stamped with an out_of_scope_reason, because Chapter
 *    II of the Rules does not reach a wholesale or institutional consignment. The
 *    officer picks the truth of the transaction and the server draws the
 *    consequence — this screen only shows, before they choose, which choices end
 *    the declaration duty.
 *
 * 2. GEOFENCE IS COMPUTED THERE, NOT HERE. We send the device's coordinates and
 *    accuracy; the server compares them to the shop and returns inside / outside
 *    / unknown. "Unknown" is a real, recorded answer — a visit with no location
 *    is never silently treated as inside the shop.
 *
 * 3. A WEB CLIENT CANNOT KNOW A LOCATION IS SIMULATED. `mock_location` is an
 *    Android platform signal the field app can read and a browser cannot, so this
 *    screen never sends it and says as much rather than reporting a reassuring
 *    `false`.
 *
 * 4. AN INSPECTOR CANNOT ADD A SHOP. POST /stores is require_admin — an inspector
 *    gets 403 — so the "add a shop" affordance is shown as the administrator's
 *    task it is, not as a button that will fail on tap.
 *
 * The device clock is sent as `local_created_at` so the server can record clock
 * skew; the inspection date itself is the server's `date.today()`, not ours.
 *
 * The form is laid out in the same six sections the rest of the portal uses
 * (Store Information, Product Information, Date & Time, Evidence, Compliance),
 * with three bottom actions (Cancel / Save Draft / Start Inspection). The
 * Product, Evidence and Compliance fields are kept on this screen as a
 * pre-fill — the canonical capture flow still happens at
 * /inspector/inspections/:id/capture. Saving the draft persists the local form
 * state so an officer can step away and return.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowRight,
  Camera,
  CheckSquare,
  ChevronRight,
  Info,
  MapPin,
  Package,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Square,
  Store as StoreIcon,
  Upload,
  X,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useAuth } from '../auth/AuthContext'
import { useDebounced, useDocumentTitle, useMutation, useResource } from '../lib/hooks'
import { CHECKS } from '../lib/checks'
import { stores as storesFixture } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  Checkbox,
  Field,
  Input,
  Pill,
  RadioCards,
  SectionTitle,
  Select,
  Skeleton,
  Textarea,
  cx,
} from '../ui'

/* The seven values SubmitInspectionRequest permits on transaction_type, in the
   order the schema lists them. `scope: 'retail'` marks the two the server treats
   as in scope; the rest are recorded and stamped out of scope. The hint on each
   is what an officer needs *before* choosing, not after. */
const TRANSACTION_TYPES = [
  { value: 'retail_sale', scope: 'retail', hintEn: 'A sale to the end consumer. Chapter II applies in full.' },
  { value: 'packed_in_presence', scope: 'retail', hintEn: 'Packed for the buyer at the counter. Still a retail declaration duty.' },
  { value: 'wholesale', scope: 'other', hintEn: 'Sale in bulk for resale. Recorded, but outside the packaged-commodity rules.' },
  { value: 'institutional', scope: 'other', hintEn: 'Supply to an institution, not a retail sale. Recorded out of scope.' },
  { value: 'industrial', scope: 'other', hintEn: 'Supply as a raw or packing material to industry. Recorded out of scope.' },
  { value: 'export', scope: 'other', hintEn: 'Packed for export. Governed by the destination, not these rules.' },
  { value: 'other', scope: 'other', hintEn: 'Anything the six above do not describe. Recorded, and marked out of scope.' },
]

/* Kept in lockstep with routers/inspections.py:_RETAIL_TYPES. If the server ever
   widens what counts as retail, this set — and only this set — moves with it. */
const IN_SCOPE = new Set(['retail_sale', 'packed_in_presence'])

/* A small fixed set of compliance items the officer confirms before the visit
   starts. The full CHK## catalog is assessed on the server after capture; this
   list is a pre-flight acknowledgment, not a substitute. */
const PRE_FLIGHT_ITEMS = [
  { id: 'pf_visit', label: 'I am physically present at the premises.' },
  { id: 'pf_photos', label: 'I have permission to photograph the products and labels.' },
  { id: 'pf_representative', label: 'A representative is on site to sign for the inspection, or to refuse.' },
  { id: 'pf_scope', label: 'I have confirmed the transaction type and the in-scope / out-of-scope consequence.' },
]

/* The default checklist pre-selected when scope is in retail. The selection is
   advisory at this stage — the server re-asserts these on the captured scan. */
const COMPLIANCE_PRESETS = {
  retail_sale: ['CHK01', 'CHK04', 'CHK05', 'CHK06', 'CHK17'],
  packed_in_presence: ['CHK01', 'CHK04', 'CHK05'],
  other: [],
}

const DRAFT_KEY = 'newInspection.draft.v1'

const storeMatches = (s, q) => {
  if (!q) return true
  const hay = `${s.name ?? ''} ${s.city ?? ''} ${s.district ?? ''} ${s.pincode ?? ''}`.toLowerCase()
  return hay.includes(q.toLowerCase())
}

function nowLocalInputValue() {
  /* <input type="datetime-local"> wants a value in the local timezone, not UTC.
     format('yyyy-MM-dd\'T\'HH:mm') gives the local wall clock without seconds. */
  return format(new Date(), "yyyy-MM-dd'T'HH:mm")
}

export default function NewInspection() {
  const { t } = useI18n()
  useDocumentTitle(t('inspection.new'))
  const navigate = useNavigate()
  const { user } = useAuth()

  /* Store Information */
  const [storeId, setStoreId] = useState(null)
  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw.trim(), 250)
  const [transactionType, setTransactionType] = useState('retail_sale')
  const [inspectorName, setInspectorName] = useState(user?.full_name ?? '—')
  const [inspectionAt, setInspectionAt] = useState(nowLocalInputValue())

  /* Product Information — captured here as a pre-fill, sent as part of the
     draft. The canonical capture flow still happens on the next page. */
  const [productName, setProductName] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [mrp, setMrp] = useState('')
  const [netQuantity, setNetQuantity] = useState('')
  const [batchLot, setBatchLot] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [manufacturingDate, setManufacturingDate] = useState('')
  const [bestBefore, setBestBefore] = useState('')

  /* Evidence — count of staged images. The actual upload is the field app's
     job; this screen holds the pre-flight count. */
  const [evidenceCount, setEvidenceCount] = useState(0)
  const [evidenceNote, setEvidenceNote] = useState('')

  /* Compliance */
  const [preFlight, setPreFlight] = useState({})
  const [checklist, setChecklist] = useState(() => new Set(COMPLIANCE_PRESETS.retail_sale))

  /* Notes + location */
  const [notes, setNotes] = useState('')
  const [geo, setGeo] = useState({ status: 'idle' })
  const [confirmOutOfScope, setConfirmOutOfScope] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)

  /* Restore a previously saved draft on first mount. Saving a draft is
     deliberate: the form is long, and an officer who has to step away should
     not lose the work. */
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.storeId != null) setStoreId(d.storeId)
      if (d.transactionType) setTransactionType(d.transactionType)
      if (typeof d.notes === 'string') setNotes(d.notes)
      if (Array.isArray(d.preFlight)) setPreFlight(Object.fromEntries(d.preFlight.map((k) => [k, true])))
      if (Array.isArray(d.checklist)) setChecklist(new Set(d.checklist))
      if (typeof d.productName === 'string') setProductName(d.productName)
      if (typeof d.brand === 'string') setBrand(d.brand)
      if (typeof d.manufacturer === 'string') setManufacturer(d.manufacturer)
      if (typeof d.evidenceCount === 'number') setEvidenceCount(d.evidenceCount)
      setDraftRestored(true)
    } catch {
      /* corrupt / blocked storage — start clean */
    }
  }, [])

  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: storesFixture,
    label: t('inspection.store'),
  })

  const create = useMutation((body) => endpoints.inspections.create(body))
  const fieldErrors = create.fieldErrors
  const err = create.error

  const allShops = shops.data ?? []
  const selected = allShops.find((s) => s.id === storeId) ?? null
  const filtered = useMemo(() => allShops.filter((s) => storeMatches(s, q)), [allShops, q])

  const inScope = IN_SCOPE.has(transactionType)
  const txOptions = useMemo(
    () =>
      TRANSACTION_TYPES.map((tx) => ({
        value: tx.value,
        label: t(`inspection.${tx.value}`),
        hint: tx.hintEn,
      })),
    [t]
  )

  /* Switching the transaction type after the fact resets the checklist preset
     so a wholesale visit does not carry retail-only CHK items. */
  function setType(v) {
    setTransactionType(v)
    setConfirmOutOfScope(false)
    setChecklist(new Set(COMPLIANCE_PRESETS[v] ?? []))
  }

  /* A browser cannot read the mock-location flag, so it is never sent. Sending a
     falsey value would be a claim we cannot stand behind. */
  function locate() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeo({ status: 'unsupported' })
      return
    }
    setGeo({ status: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGeo({
          status: 'ok',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
      (e) =>
        setGeo({
          status: 'error',
          message:
            e && e.code === 1
              ? 'Location permission was declined. The inspection can still be recorded without it.'
              : 'The device could not fix a location. The inspection can still be recorded without it.',
        }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  /* The out-of-scope acknowledgement is a browser-side courtesy, not a gate: the
     server records the visit either way. It exists so an officer does not create
     a wholesale visit expecting a compliance verdict that will never come. */
  const needsScopeAck = !inScope && !confirmOutOfScope
  const preFlightOk = PRE_FLIGHT_ITEMS.every((i) => preFlight[i.id])
  const canStart = Boolean(storeId) && !needsScopeAck && preFlightOk
  const canSaveDraft = Boolean(storeId)

  function persistDraft() {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          storeId,
          transactionType,
          notes,
          preFlight: Object.keys(preFlight).filter((k) => preFlight[k]),
          checklist: Array.from(checklist),
          productName,
          brand,
          manufacturer,
          evidenceCount,
        })
      )
    } catch {
      /* storage full / blocked — in-memory only */
    }
  }

  function clearDraft() {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* see persistDraft */
    }
  }

  async function onStart() {
    if (!canStart) return
    persistDraft()
    const body = {
      store_id: storeId,
      transaction_type: transactionType,
      local_created_at: new Date(inspectionAt ? new Date(inspectionAt) : new Date()).toISOString(),
      notes: notes.trim() || null,
    }
    if (geo.status === 'ok') {
      body.latitude = geo.lat
      body.longitude = geo.lon
      body.gps_accuracy_m = geo.accuracy
    }
    try {
      const created = await create.run(body)
      const newId = created?.id ?? created?.inspection_id
      clearDraft()
      if (newId != null) navigate(`/inspector/inspections/${newId}/capture`)
      else navigate('/inspector/inspections')
    } catch {
      /* useMutation already holds the error; the form surfaces it below. */
    }
  }

  function onSaveDraft() {
    if (!canSaveDraft) return
    persistDraft()
  }

  const lowDisk = err?.status === 507
  const genericError = err && err.status !== 422 && err.status !== 507

  const selectedAddress = selected
    ? [selected.address, selected.city, selected.district, selected.pincode].filter(Boolean).join(', ')
    : '—'
  const selectedArea = selected?.district || selected?.city || '—'

  return (
    <div className="nn-admin-page mx-auto max-w-[1040px]">
      {/* Breadcrumb + title */}
      <nav className="mb-2 flex items-center gap-1 text-caption text-ink-3" aria-label="Breadcrumb">
        <Link to="/admin" className="hover:text-ink-2">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <Link to="/inspector/inspections" className="hover:text-ink-2">
          Inspections
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium text-ink-2">New Inspection</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">New Inspection</h1>
          <p className="mt-1 text-small text-ink-2">
            Record where you are, what kind of transaction this is, and the package you'll capture. Scope, geofence and the inspection date are settled by the server.
          </p>
        </div>
        {draftRestored && (
          <Pill family="info" icon={Save}>
            Draft restored
          </Pill>
        )}
      </div>

      {/* ---- A refusal that is about the device, not the visit. ---- */}
      {lowDisk && (
        <Callout
          family="violation"
          title="There is no room to store this evidence"
          icon={ShieldAlert}
          className="mt-5"
        >
          {err.message ||
            'The device is too low on free space to guarantee the photographs can be written. Free some space and try again — nothing was recorded.'}
        </Callout>
      )}
      {genericError && (
        <Callout
          family="violation"
          title="The inspection could not be created"
          className="mt-5"
          actions={
            <Button size="sm" variant="accent" onClick={onStart} loading={create.pending}>
              {t('common.retry')}
            </Button>
          }
        >
          {err.message}
        </Callout>
      )}

      {/* ============================================================ 1 — Store Information */}
      <FormSection
        title="Store Information"
        caption="Where the visit is taking place, and who is recording it."
        icon={StoreIcon}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Store" hint="Choose the premises from the search list below." required error={fieldErrors?.store_id}>
            {() => (
              <div className="text-small">
                <span className="block font-medium text-ink">{selected ? selected.name : 'No store selected'}</span>
                <span className="block text-caption text-ink-3">{selected ? `Shop #${selected.id}` : 'Use the search below to choose a store.'}</span>
              </div>
            )}
          </Field>
          <Field label="Address" hint="Set by the office that registered the shop.">
            {() => (
              <p className="text-small text-ink-2">{selectedAddress}</p>
            )}
          </Field>
          <Field label="Area">
            {() => (
              <p className="text-small text-ink-2">{selectedArea}</p>
            )}
          </Field>
          <Field label="Inspector">
            {(props) => (
              <Input
                {...props}
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                placeholder="Officer full name"
              />
            )}
          </Field>
          <Field
            label="Inspection Type"
            hint="Scope follows the transaction type on the server — only retail and packed-in-presence are in scope."
            required
            error={fieldErrors?.transaction_type}
          >
            {() => (
              <RadioCards
                name="transaction_type"
                value={transactionType}
                onChange={setType}
                options={txOptions}
                columns={2}
              />
            )}
          </Field>
          <Field
            label="Date & Time"
            hint="The device clock at the start of the visit. The server records the actual inspection date."
            required
          >
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                value={inspectionAt}
                onChange={(e) => setInspectionAt(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="mt-4">
          <Field
            label="Search the store list"
            hint="Matches shop name, city, district or pincode."
          >
            {(props) => (
              <div className="relative">
                <Input
                  {...props}
                  icon={Search}
                  value={qRaw}
                  onChange={(e) => setQRaw(e.target.value)}
                  placeholder="e.g. Shivneri, or 411038"
                  className={qRaw ? 'pr-11' : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                {qRaw && (
                  <button
                    type="button"
                    onClick={() => setQRaw('')}
                    aria-label="Clear the shop search"
                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-sm text-ink-3 hover:text-ink-2"
                  >
                    <X size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </Field>
        </div>

        {shops.loading ? (
          <div className="mt-3">
            <Skeleton lines={4} />
          </div>
        ) : shops.error ? (
          <Callout family="violation" title="The shop list could not be loaded" className="mt-3">
            {shops.error.message}
          </Callout>
        ) : filtered.length === 0 ? (
          <p className="mt-3 rounded-card border border-line bg-surface-2 px-3 py-2 text-caption text-ink-2">
            {q ? 'No shop matches that.' : 'No shops are registered yet.'} Adding a shop is an
            administrator's job — ask your office to register this premises before recording a visit.
          </p>
        ) : (
          <ul
            className="mt-3 flex max-h-[260px] flex-col gap-1.5 overflow-y-auto pr-1"
            role="radiogroup"
            aria-label="Stores"
          >
            {filtered.map((s) => {
              const active = s.id === storeId
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStoreId(s.id)}
                    className={cx(
                      'w-full min-h-touch rounded-sm border px-3 py-2 text-left',
                      'transition-colors duration-fast ease-settle',
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-control bg-surface hover:bg-surface-2'
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-small font-medium text-ink">{s.name}</span>
                      {s.store_type && (
                        <Pill className="text-caption">{s.store_type}</Pill>
                      )}
                    </span>
                    <span className="mt-0.5 block text-caption text-ink-2">
                      {[s.address, s.city, s.district, s.pincode].filter(Boolean).join(' · ') ||
                        'No address on record'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* Out-of-scope acknowledgement, when the transaction type is not retail. */}
        {!inScope && (
          <div className="mt-4">
            <Callout family="review" title="This will be recorded out of scope" icon={Info}>
              <p>
                The visit is still saved and still counts as work done — it is not discarded. But
                no declaration verdict will be drawn, because Chapter II does not reach this kind
                of transaction. The server sets the reason; you cannot override it into scope from
                here.
              </p>
              <div className="mt-3">
                <Checkbox
                  checked={confirmOutOfScope}
                  onChange={(e) => setConfirmOutOfScope(e.target.checked)}
                  label="I understand this visit will not produce a compliance result."
                />
              </div>
            </Callout>
          </div>
        )}
      </FormSection>

      {/* ============================================================ 2 — Product Information */}
      <FormSection
        title="Product Information"
        caption="The first package you intend to capture. The full per-package flow still happens after Start."
        icon={Package}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Product">
            {(props) => (
              <Input
                {...props}
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Salt Chips 50g"
              />
            )}
          </Field>
          <Field label="Brand">
            {(props) => (
              <Input
                {...props}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Tastemaker"
              />
            )}
          </Field>
          <Field label="Category">
            {(props) => (
              <select {...props} value={category} onChange={(e) => setCategory(e.target.value)} className="nn-select">
                <option value="">Select category</option>
                <option value="biscuits">Biscuits</option>
                <option value="edible_oil">Edible oil</option>
                <option value="wheat_flour">Wheat flour</option>
                <option value="detergent">Detergent</option>
                <option value="toothpaste">Toothpaste</option>
                <option value="soap">Soap</option>
                <option value="snacks">Snacks</option>
                <option value="rice">Rice</option>
                <option value="other">Other</option>
              </select>
            )}
          </Field>
          <Field label="MRP" hint="Inclusive of all taxes.">
            {(props) => (
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-small text-ink-3">₹</span>
                <Input
                  {...props}
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  inputMode="decimal"
                  placeholder="20.00"
                  className="pl-7"
                />
              </div>
            )}
          </Field>
          <Field label="Net Quantity">
            {(props) => (
              <Input
                {...props}
                value={netQuantity}
                onChange={(e) => setNetQuantity(e.target.value)}
                placeholder="e.g. 50 g, 1 L"
              />
            )}
          </Field>
          <Field label="Batch / Lot">
            {(props) => (
              <Input
                {...props}
                value={batchLot}
                onChange={(e) => setBatchLot(e.target.value)}
                placeholder="e.g. TSC-26-08-1142"
              />
            )}
          </Field>
          <Field label="Manufacturer" hint="Name and address of the packer.">
            {(props) => (
              <Input
                {...props}
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Tastemaker Snacks Pvt Ltd, Pune"
              />
            )}
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Manufacturing Date">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={manufacturingDate}
                  onChange={(e) => setManufacturingDate(e.target.value)}
                />
              )}
            </Field>
            <Field label="Best Before">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={bestBefore}
                  onChange={(e) => setBestBefore(e.target.value)}
                />
              )}
            </Field>
          </div>
        </div>
      </FormSection>

      {/* ============================================================ 3 — Evidence */}
      <FormSection
        title="Evidence"
        caption="Upload or capture photos of the product. The field app handles the actual upload; this is a count for the record."
        icon={Camera}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={Upload}
            onClick={() => setEvidenceCount((n) => n + 1)}
          >
            Upload photos
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={Camera}
            onClick={() => setEvidenceCount((n) => n + 1)}
          >
            Capture from camera
          </Button>
          {evidenceCount > 0 && (
            <Pill family="info" icon={Camera}>
              {evidenceCount} photo{evidenceCount === 1 ? '' : 's'} attached
            </Pill>
          )}
        </div>
        <div className="mt-3">
          <Field label="Evidence note" hint="Anything about the photos that a reviewer will need.">
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="e.g. Curved panel, photographed at three angles to keep the rectified crop readable."
                maxLength={1000}
              />
            )}
          </Field>
        </div>
      </FormSection>

      {/* ============================================================ 4 — Compliance */}
      <FormSection
        title="Compliance"
        caption="Pre-flight items the officer confirms before the visit starts. The full per-check verdict is drawn on the server after capture."
        icon={CheckSquare}
      >
        <ul className="flex flex-col gap-2">
          {PRE_FLIGHT_ITEMS.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setPreFlight((p) => ({ ...p, [i.id]: !p[i.id] }))}
                className="flex w-full items-start gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-2"
              >
                {preFlight[i.id] ? (
                  <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden="true" />
                ) : (
                  <Square className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
                )}
                <span className="text-small text-ink-2">{i.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {inScope && (
          <div className="mt-4">
            <p className="nn-eyebrow">Checklist</p>
            <p className="mt-1 text-caption text-ink-3">
              The declaration items the engine will assess for this transaction type. Defaults are
              below; tick or untick to set your expectation before the visit.
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {Object.entries(CHECKS)
                .filter(([, c]) => c.severity !== 'derived')
                .slice(0, 12)
                .map(([id, c]) => {
                  const on = checklist.has(id)
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => {
                          setChecklist((prev) => {
                            const next = new Set(prev)
                            if (next.has(id)) next.delete(id)
                            else next.add(id)
                            return next
                          })
                        }}
                        className={cx(
                          'flex w-full items-center gap-2 rounded-sm border px-2.5 py-1.5 text-left text-small',
                          on ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'
                        )}
                        aria-pressed={on}
                      >
                        {on ? (
                          <CheckSquare className="h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden="true" />
                        ) : (
                          <Square className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                        )}
                        <span className="nn-mono text-caption text-ink-3">{id}</span>
                        <span className="truncate">{c.title}</span>
                      </button>
                    </li>
                  )
                })}
            </ul>
          </div>
        )}

        {!preFlightOk && (
          <p className="mt-3 text-caption text-ink-3">
            Confirm all four pre-flight items to enable Start Inspection.
          </p>
        )}
      </FormSection>

      {/* ============================================================ 5 — Location & Notes */}
      <FormSection
        title="Location & Notes"
        caption="Coordinates are sent to the server, which decides whether you were inside the shop's geofence — that judgement is not made on this device."
        icon={MapPin}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            icon={MapPin}
            onClick={locate}
            loading={geo.status === 'locating'}
          >
            {geo.status === 'ok' ? 'Update my location' : 'Use my current location'}
          </Button>
          {geo.status === 'ok' && (
            <Pill family="pass">Accurate to about {Math.round(geo.accuracy ?? 0)} m</Pill>
          )}
        </div>

        {geo.status === 'ok' && (
          <p className="nn-mono mt-2 text-caption text-ink-3">
            {geo.lat.toFixed(5)}, {geo.lon.toFixed(5)}
          </p>
        )}
        {(geo.status === 'error' || geo.status === 'unsupported') && (
          <Callout family="na" className="mt-3" icon={Info}>
            {geo.status === 'unsupported'
              ? 'This device does not expose a location to the browser. The inspection can still be recorded; the geofence will read "unknown".'
              : geo.message}
          </Callout>
        )}

        <div className="mt-3">
          <Field label="Notes" hint="Anything about the visit that the photographs will not carry." error={fieldErrors?.notes} optional>
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="e.g. Representative present; shelf being restocked during the visit."
              />
            )}
          </Field>
        </div>
      </FormSection>

      {/* ============================================================ Bottom actions */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-5">
        <Button
          variant="ghost"
          onClick={() => {
            if (typeof window !== 'undefined' && window.confirm('Discard this draft and go back?')) {
              clearDraft()
              navigate('/inspector/inspections')
            }
          }}
        >
          Cancel
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={Save}
            onClick={onSaveDraft}
            disabled={!canSaveDraft}
            disabledReason={canSaveDraft ? undefined : 'Choose a store first; the draft attaches to a store.'}
          >
            Save Draft
          </Button>
          <Button
            variant="accent"
            iconRight={ArrowRight}
            onClick={onStart}
            loading={create.pending}
            disabled={!canStart}
            disabledReason={
              !storeId
                ? 'Choose the shop you are standing in first.'
                : needsScopeAck
                  ? 'Acknowledge that an out-of-scope visit produces no compliance result.'
                  : !preFlightOk
                    ? 'Confirm all four pre-flight items in the Compliance section.'
                    : undefined
            }
          >
            Start Inspection
          </Button>
        </div>
      </div>

      {/* ---- The honest boundary. ---- */}
      <Callout family="info" className="mt-5" title="What this screen cannot do" icon={Info}>
        <ul className="mt-2 flex flex-col gap-2 text-small text-ink-2">
          <li>It cannot register a new shop — POST /stores is an administrator's route.</li>
          <li>It cannot place a wholesale or institutional visit into scope — Chapter II does not reach those transactions.</li>
          <li>It cannot decide the geofence — the device offers coordinates; the server compares them to the shop.</li>
          <li>The per-package evidence upload and the per-check verdict happen on the next page, after Start Inspection.</li>
        </ul>
      </Callout>
    </div>
  )
}

/* One form section: a card with a hairline header (eyebrow, divider, optional
   caption), then a body. Mirrors the SectionTitle pattern used elsewhere in
   the portal so the visual rhythm is the same. */
function FormSection({ title, caption, icon: Icon, children }) {
  return (
    <Card className="mt-5 p-5 sm:p-6">
      <SectionTitle caption={caption}>
        <span className="inline-flex items-center gap-2">
          {Icon && <Icon size={16} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />}
          {title}
        </span>
      </SectionTitle>
      <div className="mt-1">{children}</div>
    </Card>
  )
}
