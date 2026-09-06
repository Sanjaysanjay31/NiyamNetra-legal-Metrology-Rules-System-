/**
 * Capture — describe a package, photograph its panels, and ask the engine.
 *
 * This is the one screen where an inspection turns into evidence, so the honest
 * constraints are load-bearing and are shown, not buried:
 *
 * 1. THE FRONT PANEL IS REQUIRED, AND NOTHING ELSE IS. build_context in
 *    rules_engine.py raises without a `front` image, so assessment is disabled
 *    until the front is captured. Back, side, MRP, batch and other panels help,
 *    but the engine will run on the front alone. The panel allow-list is
 *    Backend/routers/scans.py:ALLOWED_PANELS.
 *
 * 2. A POOR PHOTOGRAPH IS FLAGGED, NEVER REFUSED. POST /scans/{id}/images accepts
 *    an image it judges low quality and returns a `quality_note`; only an
 *    undecodable file (422) or an oversized one (413) is turned away. So a blurry
 *    or tilted panel is uploaded, kept, and marked — the officer decides whether
 *    to retake, because the engine would rather assess weak evidence honestly
 *    than pretend none exists.
 *
 * 3. SCALE IS WHAT MAKES A MILLIMETRE MEAN ANYTHING. Without a declared shape or a
 *    reference object, the height checks cannot be assessed — the engine says so
 *    in words rather than guessing a size. The geometry block gathers exactly the
 *    fields PanelGeometry validates, and mirrors those validators in the browser
 *    so a save is not spent to be told what a shape needs.
 *
 * 4. A SUBMITTED VISIT IS FROZEN. POST /inspections/{id}/scans returns 409 once
 *    the inspection is submitted, because a signed record cannot grow new
 *    packages. The screen detects this and points back to the visit rather than
 *    letting the officer photograph into a wall.
 *
 * The two phases are deliberate: a package is described and saved (that create is
 * the 409 gate), and only then are its panels photographed against the scan id
 * the save returned.
 */

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle,
  Gauge,
  Info,
  Package,
  RotateCcw,
  Ruler,
  ShieldAlert,
  X,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDocumentTitle, useMutation, useResource } from '../lib/hooks'
import { enqueueScan, flushQueue, putBlob } from '../lib/queue'
import { inspections as inspectionsFixture, storesById } from '../mock/fixtures'
import CameraCapture from '../ui/CameraCapture'
import {
  Button,
  Callout,
  Card,
  Checkbox,
  DemoChip,
  Field,
  Input,
  PageHeader,
  Pill,
  RadioCards,
  Select,
  Skeleton,
  Textarea,
  cx,
  useToast,
} from '../ui'

function newClientUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/* Units the backend accepts (Backend/routers/scans.py:ALLOWED_QUANTITY_UNITS). */
const QTY_UNITS = ['g', 'kg', 'mg', 'gm', 'ml', 'l', 'ltr', 'litre', 'pcs', 'pc', 'pack', 'm', 'cm', 'mm', 'n', 'u']

/* The six panels the backend accepts (Backend/routers/scans.py:ALLOWED_PANELS).
   `front` is the only one the engine insists on; the rest sharpen a reading
   without gating it. */
const PANELS = [
  { key: 'front', required: true },
  { key: 'back', required: false },
  { key: 'side', required: false },
  { key: 'mrp', required: false },
  { key: 'batch', required: false },
  { key: 'other', required: false },
]

/* PanelGeometry.scale_source, in the order the schema lists it. This is how the
   engine turns pixels into millimetres; "none" means it cannot, and the height
   checks will read not-assessed rather than wrong. */
const SCALE_SOURCES = [
  { value: 'declared', label: 'Declared dimensions', hint: 'You are entering the panel size yourself, below.' },
  { value: 'id1_card', label: 'ID-1 card in frame', hint: 'A standard card (85.6 mm) placed beside the panel.' },
  { value: 'coin_5inr', label: '₹5 coin in frame', hint: 'The 23 mm coin as a reference object.' },
  { value: 'none', label: 'No scale reference', hint: 'Height checks cannot be assessed without one.' },
]

const SHAPES = [
  { value: 'rectangular', label: 'Rectangular', hint: 'A flat or boxed panel. Needs height and width.' },
  { value: 'cylindrical', label: 'Cylindrical', hint: 'A bottle or tin. Needs height and diameter.' },
  { value: 'other', label: 'Other', hint: 'An irregular shape. Give the total printable area instead.' },
]

/** '' → null; a number string → Number; anything else → null. Never NaN into a body. */
function toNum(v) {
  if (v == null || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * One panel's uploader. It shows the photograph the moment it is chosen, uploads
 * it, and then reports back exactly what the server said about it — including the
 * quality note on an image that was accepted but judged weak.
 */
function PanelTile({ label, required, state, onPhotograph, t }) {
  const status = state?.status ?? 'idle'
  const done = status === 'done'
  const flagged = done && state.result && state.result.usable === false
  const clean = done && !flagged
  const pct = Math.round((state?.progress ?? 0) * 100)

  return (
    <div
      className={cx(
        'flex flex-col rounded-card border bg-surface p-3',
        flagged ? 'border-review-border' : clean ? 'border-pass-border' : 'border-divider'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-1.5 text-small font-medium text-ink">
          {label}
          {required && <span className="text-violation-text" aria-hidden="true">*</span>}
          {required && <span className="sr-only-nn">(required)</span>}
        </span>
        {clean && <Pill family="pass" icon={CheckCircle}>Captured</Pill>}
        {flagged && <Pill family="review">Flagged</Pill>}
      </div>

      <div className="mt-2 aspect-[4/3] w-full overflow-hidden rounded-sm bg-surface-sunken">
        {state?.previewUrl ? (
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img src={state.previewUrl} alt={`${label} preview`} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-ink-3">
            <Camera size={28} strokeWidth={1.5} aria-hidden="true" />
          </span>
        )}
      </div>

      {status === 'uploading' && (
        <div className="mt-2" aria-live="polite">
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
            <div className="h-full rounded-pill bg-accent transition-all duration-fast ease-settle" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-caption text-ink-3">Uploading… {pct}%</p>
        </div>
      )}

      {status === 'error' && (
        <p role="alert" className="mt-2 text-caption text-violation-text">
          {state.code === 413
            ? 'That photo is too large to upload. Retake it at a lower resolution.'
            : state.code === 422
              ? 'That file could not be read as an image. Retake it.'
              : state.message || 'The upload did not complete. Try again.'}
        </p>
      )}

      {flagged && (
        <p className="mt-2 text-caption text-review-text">
          {state.result.quality_note || 'Accepted, but the quality is low. Retake if you can.'}
        </p>
      )}

      <div className="mt-2">
        <Button size="md" variant="secondary" icon={done ? RotateCcw : Camera} onClick={onPhotograph}>
          {done ? t('capture.retake') : t('capture.photograph')}
        </Button>
      </div>
    </div>
  )
}

export default function Capture() {
  const { t } = useI18n()
  const { id } = useParams()
  useDocumentTitle(t('capture.title'))
  const navigate = useNavigate()

  const fallback = inspectionsFixture.find((i) => String(i.id) === String(id))
  const insp = useResource(() => endpoints.inspections.get(id), {
    deps: [id],
    fallback,
    label: t('inspection.title'),
  })
  const inspection = insp.data
  const submitted = inspection?.status === 'submitted'
  const storeName = inspection
    ? storesById[inspection.store_id]?.name ?? `Shop #${inspection.store_id}`
    : null

  /* Package identity — every one of these is optional on CreateScanRequest. */
  const [commodity, setCommodity] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [batch, setBatch] = useState('')

  /* Geometry — the required half of the request. */
  const [shape, setShape] = useState('rectangular')
  const [heightMm, setHeightMm] = useState('')
  const [widthMm, setWidthMm] = useState('')
  const [diameterMm, setDiameterMm] = useState('')
  const [areaCm2, setAreaCm2] = useState('')
  const [blowMoulded, setBlowMoulded] = useState(false)
  const [scaleSource, setScaleSource] = useState('declared')

  /* Scope flags — persisted via PATCH /scans/{id} after the save (they decide
     CHK02/11/12/13/14). Null = unknown -> not_assessed, never pass. */
  const [netQtyValue, setNetQtyValue] = useState('')
  const [netQtyUnit, setNetQtyUnit] = useState('g')
  const [isImported, setIsImported] = useState(false)
  const [isPerishable, setIsPerishable] = useState(false)
  const [isMedical, setIsMedical] = useState(false)
  const [isTobacco, setIsTobacco] = useState(false)
  const [hasSticker, setHasSticker] = useState(false)
  const [stickerReduces, setStickerReduces] = useState(false)
  const [stickerCovers, setStickerCovers] = useState(false)
  const [listingUrl, setListingUrl] = useState('')
  const [scopeMsg, setScopeMsg] = useState(null)

  /* Scan lifecycle: null until the package is saved, then the panels attach. */
  const [scanId, setScanId] = useState(null)
  const [savedSummary, setSavedSummary] = useState(null)
  const [panels, setPanels] = useState({})
  const [queuedScan, setQueuedScan] = useState(false)
  /* Which panel's camera is open right now. Camera-only capture: the portal has
     no file input and no gallery, so the live camera is the only way an image
     enters the system — the "absent, not disabled" rule of 08 §4.3. */
  const [camPanel, setCamPanel] = useState(null)
  const toast = useToast()
  /* Idempotency travels as the `Idempotency-Key` header (CORS-allowed), not as
     a body field: CreateScanRequest has no client_uuid. */
  const createScan = useMutation(({ body, key }) =>
    endpoints.inspections.createScan(id, body, { headers: { 'Idempotency-Key': key } })
  )
  const assess = useMutation(() => endpoints.scans.assess(scanId))

  /* The shape validators from PanelGeometry, mirrored so a save is never spent to
     be told what a shape needs. Height/width/diameter are gt0 and le2000. */
  const geomError = useMemo(() => {
    const h = toNum(heightMm)
    const w = toNum(widthMm)
    const dia = toNum(diameterMm)
    const area = toNum(areaCm2)
    const over = (n) => n != null && n > 2000
    if (shape === 'rectangular') {
      if (!h || !w) return 'A rectangular panel needs both a height and a width.'
      if (over(h) || over(w)) return 'Height and width are measured in millimetres and must be 2000 or less.'
    } else if (shape === 'cylindrical') {
      if (!h || !dia) return 'A cylindrical panel needs a height and a diameter.'
      if (over(h) || over(dia)) return 'Height and diameter are measured in millimetres and must be 2000 or less.'
    } else if (shape === 'other') {
      if (!area) return 'An irregular panel needs a total printable area in square centimetres.'
    }
    return null
  }, [shape, heightMm, widthMm, diameterMm, areaCm2])

  const createErr = createScan.error
  const frozen = submitted || createErr?.status === 409
  const canSave = !geomError && !frozen && !createScan.pending

  function scopePatch() {
    const patch = {}
    const qv = toNum(netQtyValue)
    if (qv != null) patch.net_quantity_value = qv
    if (netQtyUnit.trim()) patch.net_quantity_unit = netQtyUnit.trim().toLowerCase()
    if (isImported) patch.is_imported = true
    if (isPerishable) patch.is_perishable = true
    if (isMedical) patch.is_medical_device = true
    if (isTobacco) patch.is_tobacco = true
    if (hasSticker) {
      patch.has_sticker = true
      if (stickerReduces) patch.sticker_reduces_price = true
      if (stickerCovers) patch.sticker_covers_original = true
    }
    return Object.keys(patch).length > 0 ? patch : null
  }

  async function persistScopeAndListing(targetScanId) {
    const patch = scopePatch()
    setScopeMsg(null)
    if (patch) {
      try {
        await endpoints.scans.updateScan(targetScanId, patch)
      } catch (e) {
        setScopeMsg(`Scope flags could not be saved: ${e.message}`)
      }
    }
    const url = listingUrl.trim()
    if (url) {
      try {
        await endpoints.scans.attachListing(targetScanId, url)
      } catch (e) {
        setScopeMsg((m) => [m, `Listing could not be attached: ${e.message}`].filter(Boolean).join(' '))
      }
    }
  }

  async function onSave() {
    if (!canSave) return
    setQueuedScan(false)
    const rect = shape === 'rectangular'
    const cyl = shape === 'cylindrical'
    const geometry = {
      panel_shape: shape,
      panel_height_mm: rect || cyl ? toNum(heightMm) : null,
      panel_width_mm: rect ? toNum(widthMm) : null,
      panel_diameter_mm: cyl ? toNum(diameterMm) : null,
      total_surface_area_cm2: shape === 'other' ? toNum(areaCm2) : null,
      is_blown_moulded: blowMoulded,
      scale_source: scaleSource,
    }
    const body = {
      commodity_generic: commodity.trim() || null,
      brand_name: brand.trim() || null,
      commodity_category: category.trim() || null,
      batch_number: batch.trim() || null,
      geometry,
    }
    const key = newClientUuid()
    try {
      const res = await createScan.run({ body, key })
      const newScanId = res?.scan_id ?? res?.id ?? null
      setScanId(newScanId)
      setSavedSummary({
        overall_result: res?.overall_result ?? null,
        checks_total: res?.checks_total ?? null,
      })
      if (newScanId != null) {
        await persistScopeAndListing(newScanId)
        flushQueue().catch(() => {})
      }
    } catch (err) {
      /* Offline: hold the scan body plus scope answers in the outbox. The
         badge (queueSummary) reflects the real outbox depth. */
      if (err?.offline || err?.status === 0) {
        try {
          await enqueueScan(
            id,
            body,
            [],
            { scope: scopePatch(), listingUrl: listingUrl.trim() || null }
          )
          setQueuedScan(true)
          toast.push({
            family: 'review',
            title: 'Package queued on this device',
            body: 'No connection, so the package will be created when you are back online.',
          })
        } catch {
          /* held on createScan.error and surfaced in the form */
        }
      }
      /* held on createScan.error and surfaced in the form otherwise */
    }
  }

  async function pickPanel(key, file) {
    if (!scanId) return
    const previewUrl = URL.createObjectURL(file)
    setPanels((p) => ({ ...p, [key]: { status: 'uploading', progress: 0, previewUrl } }))
    try {
      const result = await endpoints.scans.uploadImage(
        scanId,
        file,
        key,
        (frac) => setPanels((p) => ({ ...p, [key]: { ...p[key], progress: frac } })),
        { headers: { 'Idempotency-Key': `${scanId}:${key}:${Date.now()}` } }
      )
      setPanels((p) => ({ ...p, [key]: { ...p[key], status: 'done', progress: 1, result } }))
    } catch (e) {
      if (e?.offline || e?.status === 0) {
        /* No connection: keep the bytes in IndexedDB and queue the scan for
           replay. The preview stays so the officer sees what is held. */
        try {
          const blob = file instanceof Blob ? file : new Blob([file], { type: 'image/jpeg' })
          const handle = await putBlob(blob, { panel: key, name: `${key}.jpg` })
          await enqueueScan(
            id,
            null,
            [{ blobId: handle.blobId, panel: key, name: `${key}.jpg` }],
            { scanId }
          )
          setPanels((p) => ({
            ...p,
            [key]: { ...p[key], status: 'error', message: 'No connection — held on this device and queued to sync.', code: 0 },
          }))
          toast.push({
            family: 'review',
            title: `${key} panel queued`,
            body: 'The photo is stored on this device and will upload when you are back online.',
          })
          return
        } catch {
          /* fall through to the generic error below */
        }
      }
      setPanels((p) => ({ ...p, [key]: { ...p[key], status: 'error', message: e.message, code: e.status } }))
    }
  }

  function startAnother() {
    setScanId(null)
    setSavedSummary(null)
    setPanels({})
    setCamPanel(null)
    setQueuedScan(false)
    setScopeMsg(null)
    setCommodity('')
    setBrand('')
    setCategory('')
    setBatch('')
    setHeightMm('')
    setWidthMm('')
    setDiameterMm('')
    setAreaCm2('')
    setBlowMoulded(false)
    setNetQtyValue('')
    setNetQtyUnit('g')
    setIsImported(false)
    setIsPerishable(false)
    setIsMedical(false)
    setIsTobacco(false)
    setHasSticker(false)
    setStickerReduces(false)
    setStickerCovers(false)
    setListingUrl('')
    createScan.reset?.()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const frontDone = panels.front?.status === 'done'
  const anyUploading = PANELS.some((p) => panels[p.key]?.status === 'uploading')
  const phase = scanId ? 'capture' : 'describe'
  const fieldErrors = createScan.fieldErrors

  async function onAssess() {
    try {
      await assess.run()
      navigate(`/inspector/scans/${scanId}`)
    } catch {
      /* held on assess.error */
    }
  }

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow={storeName ? `${t('inspection.title')} #${id} · ${storeName}` : `${t('inspection.title')} #${id}`}
        title={t('capture.title')}
        subtitle="Describe the package, then photograph its panels. The engine runs on the front panel; the rest make the reading surer."
        actions={
          <div className="flex items-center gap-2">
            {insp.demo && <DemoChip />}
            <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate(`/inspector/inspections/${id}`)}>
              {t('common.back')}
            </Button>
          </div>
        }
      />

      {/* two-step marker */}
      <ol className="mb-6 flex items-center gap-3 text-caption" aria-label="Steps">
        {[
          { n: 1, label: 'Describe the package', on: true },
          { n: 2, label: 'Photograph the panels', on: phase === 'capture' },
        ].map((s, i) => (
          <li key={s.n} className="flex items-center gap-3">
            {i > 0 && <span className="h-px w-6 bg-divider" aria-hidden="true" />}
            <span className="flex items-center gap-2">
              <span
                className={cx(
                  'nn-mono grid h-6 w-6 place-items-center rounded-pill text-caption font-semibold',
                  s.on ? 'bg-accent text-accent-on' : 'bg-surface-2 text-ink-3'
                )}
              >
                {s.n}
              </span>
              <span className={cx('font-medium', s.on ? 'text-ink' : 'text-ink-3')}>{s.label}</span>
            </span>
          </li>
        ))}
      </ol>

      {insp.loading ? (
        <Card className="p-5">
          <Skeleton lines={5} />
        </Card>
      ) : insp.error ? (
        <Callout
          family="violation"
          title="This inspection could not be loaded"
          actions={
            <Button size="sm" onClick={insp.reload}>
              {t('common.retry')}
            </Button>
          }
        >
          {insp.error.message} A package can only be captured against a visit that exists and is
          still a draft.
        </Callout>
      ) : frozen ? (
        <Callout family="na" title="This visit is submitted and frozen" icon={ShieldAlert}>
          <p>
            A submitted inspection cannot take new packages — the signed record would no longer match
            what was assessed. Open the visit to read what was already captured.
          </p>
          <div className="mt-3">
            <Button size="sm" icon={ArrowRight} onClick={() => navigate(`/inspector/inspections/${id}`)}>
              Open the inspection
            </Button>
          </div>
        </Callout>
      ) : (
        <div className="space-y-6">
          {phase === 'describe' && (
            <>
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Package size={18} strokeWidth={1.8} className="text-ink-2" aria-hidden="true" />
                  <h2 className="text-body font-semibold text-ink">Package identity</h2>
                </div>
                <p className="mb-4 max-w-prose text-small text-ink-2">
                  Every field here is optional. The engine reads the declaration off the panel it is shown;
                  these details only label the record so a reviewer can find it later.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Commodity" optional hint="The generic name.">
                    {(props) => (
                      <Input {...props} value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="e.g. Refined wheat flour" />
                    )}
                  </Field>
                  <Field label="Brand" optional hint="As printed, if any.">
                    {(props) => (
                      <Input {...props} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. a brand name" />
                    )}
                  </Field>
                  <Field label="Category" optional hint="Food, cosmetic, cement, and so on.">
                    {(props) => (
                      <Input {...props} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Food" />
                    )}
                  </Field>
                  <Field label="Batch number" optional hint="If shown on the pack.">
                    {(props) => (
                      <Input {...props} value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="e.g. LOT-2291" />
                    )}
                  </Field>
                </div>
              </Card>

              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Ruler size={18} strokeWidth={1.8} className="text-ink-2" aria-hidden="true" />
                  <h2 className="text-body font-semibold text-ink">Panel geometry</h2>
                </div>
                <p className="mb-4 max-w-prose text-small text-ink-2">
                  This is how the engine turns pixels into millimetres. Give it the shape and either the
                  panel's own dimensions or the reference object in the frame. Without a scale, the height
                  checks read not-assessed rather than guess.
                </p>
                <div className="flex flex-col gap-1.5">
                  <span className="text-small font-medium text-ink">Panel shape</span>
                  <RadioCards name="shape" value={shape} onChange={setShape} options={SHAPES} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {(shape === 'rectangular' || shape === 'cylindrical') && (
                    <Field label="Height (mm)" hint="Between 1 and 2000.">
                      {(props) => (
                        <Input {...props} inputMode="decimal" value={heightMm} onChange={(e) => setHeightMm(e.target.value)} placeholder="e.g. 210" />
                      )}
                    </Field>
                  )}
                  {shape === 'rectangular' && (
                    <Field label="Width (mm)" hint="Between 1 and 2000.">
                      {(props) => (
                        <Input {...props} inputMode="decimal" value={widthMm} onChange={(e) => setWidthMm(e.target.value)} placeholder="e.g. 140" />
                      )}
                    </Field>
                  )}
                  {shape === 'cylindrical' && (
                    <Field label="Diameter (mm)" hint="Between 1 and 2000.">
                      {(props) => (
                        <Input {...props} inputMode="decimal" value={diameterMm} onChange={(e) => setDiameterMm(e.target.value)} placeholder="e.g. 65" />
                      )}
                    </Field>
                  )}
                  {shape === 'other' && (
                    <Field label="Total printable area (cm²)" hint="The whole surface a declaration could sit on.">
                      {(props) => (
                        <Input {...props} inputMode="decimal" value={areaCm2} onChange={(e) => setAreaCm2(e.target.value)} placeholder="e.g. 320" />
                      )}
                    </Field>
                  )}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Scale reference" hint={SCALE_SOURCES.find((s) => s.value === scaleSource)?.hint}>
                    {(props) => (
                      <Select {...props} value={scaleSource} onChange={(e) => setScaleSource(e.target.value)}>
                        {SCALE_SOURCES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <div className="flex items-end pb-1">
                    <Checkbox
                      label="Blow-moulded container"
                      hint="A moulded bottle or jar. The engine widens the height tolerance for these."
                      checked={blowMoulded}
                      onChange={(e) => setBlowMoulded(e.target.checked)}
                    />
                  </div>
                </div>

                {scaleSource === 'none' && (
                  <p className="mt-3 flex items-start gap-2 text-caption text-ink-2">
                    <X size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-review-text" aria-hidden="true" />
                    With no scale reference the height checks read not-assessed. Every other check is still assessed.
                  </p>
                )}

                {geomError && (
                  <Callout family="review" className="mt-4" title="This shape needs a little more">
                    {geomError}
                  </Callout>
                )}
                {createErr && createErr.status !== 409 && (
                  <Callout family="violation" className="mt-4" title="The package could not be saved">
                    {createErr.status === 507
                      ? 'This device is too low on storage to keep the evidence for a new package. Free some space and try again.'
                      : createErr.message || 'Something went wrong saving this package. Try again.'}
                    {fieldErrors && Object.keys(fieldErrors).length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-5">
                        {Object.entries(fieldErrors).map(([k, v]) => (
                          <li key={k}>
                            <span className="nn-mono">{k}</span>: {Array.isArray(v) ? v.join('; ') : String(v)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Callout>
                )}
                {queuedScan && (
                  <Callout family="review" className="mt-4" title="Queued on this device — will sync automatically">
                    No connection when you saved. The package and its scope answers are held in the
                    offline outbox and will be created with the same idempotency key when you are
                    back online.
                  </Callout>
                )}
              </Card>

              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Gauge size={18} strokeWidth={1.8} className="text-ink-2" aria-hidden="true" />
                  <h2 className="text-body font-semibold text-ink">Scope flags</h2>
                </div>
                <p className="mb-4 max-w-prose text-small text-ink-2">
                  These decide CHK02/11/12/13/14 and are saved via PATCH /scans/{'{id}'} right
                  after the package is created, before assessment. Leaving everything blank
                  means unknown — the checks read not-assessed, never pass.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Net quantity value" optional hint="Positive number, e.g. 500.">
                    {(props) => (
                      <Input {...props} inputMode="decimal" value={netQtyValue} onChange={(e) => setNetQtyValue(e.target.value)} placeholder="e.g. 500" />
                    )}
                  </Field>
                  <Field label="Net quantity unit" optional hint="Backend allow-list, lower-cased on send.">
                    {(props) => (
                      <Select {...props} value={netQtyUnit} onChange={(e) => setNetQtyUnit(e.target.value)}>
                        {QTY_UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Checkbox label="Imported package" hint="CHK11: declarations for imports." checked={isImported} onChange={(e) => setIsImported(e.target.checked)} />
                  <Checkbox label="Perishable" hint="CHK12: expiry/best-before duties." checked={isPerishable} onChange={(e) => setIsPerishable(e.target.checked)} />
                  <Checkbox label="Medical device" hint="CHK13: device-specific duties." checked={isMedical} onChange={(e) => setIsMedical(e.target.checked)} />
                  <Checkbox label="Tobacco product" hint="CHK14: tobacco warnings." checked={isTobacco} onChange={(e) => setIsTobacco(e.target.checked)} />
                </div>
                <div className="mt-4">
                  <Checkbox
                    label="Price sticker affixed"
                    hint="CHK02: only when a sticker covers or reduces the declared price."
                    checked={hasSticker}
                    onChange={(e) => setHasSticker(e.target.checked)}
                  />
                  {hasSticker && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Checkbox label="Sticker reduces the price" checked={stickerReduces} onChange={(e) => setStickerReduces(e.target.checked)} />
                      <Checkbox label="Sticker covers the original" checked={stickerCovers} onChange={(e) => setStickerCovers(e.target.checked)} />
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <Field label="E-commerce listing URL" optional hint="Fetched server-side for CHK15/16 via POST /scans/{id}/listing. Leave blank if none.">
                    {(props) => (
                      <Input {...props} inputMode="url" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} placeholder="https://…" />
                    )}
                  </Field>
                </div>
                {scopeMsg && (
                  <Callout family="review" className="mt-4" title="Scope note">
                    {scopeMsg}
                  </Callout>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-5">
                  <p className="flex items-center gap-1.5 text-caption text-ink-3">
                    <Info size={14} strokeWidth={1.8} aria-hidden="true" />
                    Save now, then photograph the panels.
                  </p>
                  <Button
                    variant="primary"
                    iconRight={ArrowRight}
                    onClick={onSave}
                    loading={createScan.pending}
                    disabled={Boolean(geomError)}
                    disabledReason={geomError || undefined}
                  >
                    Save package
                  </Button>
                </div>
              </Card>
            </>
          )}
          {phase === 'capture' && (
            <>
              <Callout family="pass" icon={Gauge} title="Package saved">
                {savedSummary?.checks_total != null
                  ? `The engine will run ${savedSummary.checks_total} checks once the front panel is captured.`
                  : 'Photograph the panels below. The front panel is the one the engine needs.'}
              </Callout>
              {scopeMsg && (
                <Callout family="review" title="Scope note">
                  {scopeMsg}
                </Callout>
              )}

              {camPanel && (
                <Card className="p-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-body font-semibold text-ink">
                      Photograph {t(`capture.${camPanel}`)}
                    </h3>
                    <p className="text-caption text-ink-3">
                      Camera only — there is no gallery path in this portal, the same rule the field app follows.
                    </p>
                  </div>
                  <CameraCapture
                    label={t(`capture.${camPanel}`)}
                    onCapture={(blob) => {
                      pickPanel(camPanel, blob)
                      setCamPanel(null)
                    }}
                    onCancel={() => setCamPanel(null)}
                  />
                </Card>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {PANELS.map((p) => (
                  <PanelTile
                    key={p.key}
                    label={t(`capture.${p.key}`)}
                    required={p.required}
                    state={panels[p.key]}
                    onPhotograph={() => setCamPanel(p.key)}
                    t={t}
                  />
                ))}
              </div>
              {!frontDone && (
                <p className="text-caption text-ink-2">
                  The front panel is required before the engine can assess. Back, side, MRP,
                  batch and other panels are optional, but each one makes the reading surer.
                </p>
              )}

              {assess.error && (
                <Callout family="violation" title="The assessment could not run">
                  {assess.error.message || 'Something went wrong. Try again once the front panel is captured.'}
                </Callout>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-5">
                <Button variant="ghost" icon={RotateCcw} onClick={startAnother}>
                  Save another package
                </Button>
                <Button
                  variant="primary"
                  iconRight={ArrowRight}
                  onClick={onAssess}
                  loading={assess.pending}
                  disabled={!frontDone || anyUploading}
                  disabledReason={
                    !frontDone
                      ? 'Capture the front panel first.'
                      : anyUploading
                        ? 'Wait for the upload to finish.'
                        : undefined
                  }
                >
                  {t('capture.assess')}
                </Button>
              </div>
            </>
          )}
          <Card className="p-5">
            <h2 className="text-body font-semibold text-ink">What this screen cannot do</h2>
            <ul className="mt-3 space-y-2 text-small text-ink-2">
              <li>
                It cannot tell you the result here. Assess opens the findings, where the verdict and every
                not-assessed reason are laid out check by check.
              </li>
              <li>
                It cannot vouch for a photograph. The server flags low quality, but it cannot prove an image
                is the panel it claims to be — that judgement stays with the officer.
              </li>
              <li>
                It cannot invent a scale. Without a declared size or a reference object in frame, the height
                checks read not-assessed rather than guess a millimetre.
              </li>
              <li>
                It cannot add a package to a submitted visit. A signed record is frozen; reopen the visit to
                read what was already captured.
              </li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}

