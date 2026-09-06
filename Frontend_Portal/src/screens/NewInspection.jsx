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
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Info,
  MapPin,
  Package,
  RotateCcw,
  Search,
  ShieldAlert,
  Store as StoreIcon,
  X,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDebounced, useDocumentTitle, useMutation, useResource } from '../lib/hooks'
import { enqueueInspection, flushQueue } from '../lib/queue'
import { stores as storesFixture } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  Checkbox,
  DemoChip,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pill,
  RadioCards,
  Skeleton,
  Textarea,
  cx,
  useToast,
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

const storeMatches = (s, q) => {
  if (!q) return true
  const hay = `${s.name ?? ''} ${s.city ?? ''} ${s.district ?? ''} ${s.pincode ?? ''}`.toLowerCase()
  return hay.includes(q.toLowerCase())
}

function newClientUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export default function NewInspection() {
  const { t } = useI18n()
  useDocumentTitle(t('inspection.new'))
  const navigate = useNavigate()
  const toast = useToast()
  const [queued, setQueued] = useState(false)

  const [storeId, setStoreId] = useState(null)
  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw.trim(), 250)
  const [transactionType, setTransactionType] = useState('retail_sale')
  const [notes, setNotes] = useState('')
  const [geo, setGeo] = useState({ status: 'idle' })
  const [confirmOutOfScope, setConfirmOutOfScope] = useState(false)

  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: storesFixture,
    label: t('inspection.store'),
  })

  /* Idempotency travels as the `Idempotency-Key` header (CORS-allowed), not
     as a body field: CreateInspectionRequest has no client_uuid. */
  const create = useMutation(({ body, key }) =>
    endpoints.inspections.create(body, { headers: { 'Idempotency-Key': key } })
  )
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
  const canCreate = Boolean(storeId) && !needsScopeAck

  async function onCreate() {
    if (!canCreate) return
    setQueued(false)
    const body = {
      store_id: storeId,
      transaction_type: transactionType,
      local_created_at: new Date().toISOString(),
      notes: notes.trim() || null,
    }
    if (geo.status === 'ok') {
      body.latitude = geo.lat
      body.longitude = geo.lon
      body.gps_accuracy_m = geo.accuracy
    }
    const key = newClientUuid()
    try {
      const created = await create.run({ body, key })
      const newId = created?.id ?? created?.inspection_id
      /* Drain anything else waiting in the outbox now that we are online. */
      flushQueue().catch(() => {})
      if (newId != null) navigate(`/inspector/inspections/${newId}/capture`)
      else navigate('/inspector/inspections')
    } catch (err) {
      /* Offline or unreachable: hold the whole inspection in the IndexedDB
         outbox and let the header badge (queueSummary) show it. Anything else
         stays on useMutation's error and is surfaced below. */
      if (err?.offline || err?.status === 0) {
        try {
          /* A fresh client_uuid is minted inside enqueueInspection for the
             retry; the direct attempt above never reached the server. */
          await enqueueInspection({ inspection: body, scans: [], submit: null })
          setQueued(true)
          toast.push({
            family: 'review',
            title: 'Saved on this device',
            body: 'No connection, so the inspection is queued and will sync when you are back online.',
          })
        } catch {
          /* enqueue failed: the original network error remains visible. */
        }
      }
    }
  }

  const lowDisk = err?.status === 507
  const genericError = err && err.status !== 422 && err.status !== 507

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow={t('nav.home')}
        title={t('inspection.new')}
        subtitle="Record where you are, what kind of transaction this is, and start capturing packages. Scope, geofence and the inspection date are settled by the server, not chosen here."
        actions={shops.demo ? <DemoChip /> : null}
      />

      {/* ---- A refusal that is about the device, not the visit. ---- */}
      {queued && (
        <Callout family="review" title="Queued on this device — will sync automatically" className="mb-6">
          No connection right now. The inspection is held in the offline outbox (see the sync
          badge in the header) and will be sent with the same idempotency key when you are back
          online, so it cannot be recorded twice.
        </Callout>
      )}
      {lowDisk && (
        <Callout
          family="violation"
          title="There is no room to store this evidence"
          icon={ShieldAlert}
          className="mb-6"
        >
          {err.message ||
            'The device is too low on free space to guarantee the photographs can be written. Free some space and try again — nothing was recorded.'}
        </Callout>
      )}
      {genericError && (
        <Callout
          family="violation"
          title="The inspection could not be created"
          className="mb-6"
          actions={
            <Button size="sm" onClick={onCreate} loading={create.pending}>
              {t('common.retry')}
            </Button>
          }
        >
          {err.message}
        </Callout>
      )}

      {/* ================= Step 1 — the shop ================= */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent-text">
            <StoreIcon size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-h2 text-ink">{t('inspection.store')}</h2>
            <p className="mt-1 max-w-prose text-caption text-ink-2">
              Choose the premises you are standing in. The list is every registered shop your office
              has recorded; it is not searched by commodity or brand.
            </p>

            <div className="mt-4">
              <Field
                label={t('inspection.storeSearch')}
                error={fieldErrors?.store_id}
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

            {/* the list itself */}
            {shops.loading ? (
              <div className="mt-4">
                <Skeleton lines={4} />
              </div>
            ) : shops.error ? (
              <Callout
                family="violation"
                title="The shop list could not be loaded"
                className="mt-4"
                actions={
                  <Button size="sm" onClick={shops.reload}>
                    {t('common.retry')}
                  </Button>
                }
              >
                {shops.error.message} Without it, a shop cannot be chosen and the inspection cannot
                be created.
              </Callout>
            ) : filtered.length === 0 ? (
              <div className="mt-4 rounded-card border border-divider bg-surface-2">
                <EmptyState
                  icon={StoreIcon}
                  title={q ? 'No shop matches that' : 'No shops are registered yet'}
                  body={
                    q
                      ? 'Clear the search, or ask an administrator to register this shop before recording a visit.'
                      : 'An administrator registers shops. Until one is added, an inspection has nowhere to attach.'
                  }
                  action={
                    q ? (
                      <Button size="sm" icon={RotateCcw} onClick={() => setQRaw('')}>
                        {t('common.clear')}
                      </Button>
                    ) : null
                  }
                />
              </div>
            ) : (
              <ul
                className="mt-4 flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-1"
                role="radiogroup"
                aria-label={t('inspection.store')}
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
                          'w-full min-h-touch rounded-sm border p-3 text-left',
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
                        <span className="mt-1 flex items-center gap-1 text-caption text-ink-3">
                          <MapPin size={12} strokeWidth={2} aria-hidden="true" />
                          {s.latitude != null && s.longitude != null
                            ? `Geofence ${s.geofence_radius_m ?? 150} m`
                            : 'No coordinates on record — geofence will read “unknown”'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {selected && (
              <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-2">
                <span className="nn-eyebrow">Selected</span>
                <span className="font-medium text-ink">{selected.name}</span>
              </p>
            )}

            {/* honest note: adding a shop is the admin's job */}
            <div className="nn-well mt-4 p-3">
              <p className="text-caption text-ink-2">
                <span className="font-semibold text-ink">{t('inspection.addStore')}?</span> Only an
                administrator can register a new shop, so it is not offered here. If the premises you
                are in is missing, note it and ask your office to add it — recording the visit
                against the wrong shop is worse than recording it a little later.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ================= Step 2 — the transaction ================= */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent-text">
            <Package size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-h2 text-ink">{t('inspection.transactionType')}</h2>
            <p className="mt-1 max-w-prose text-caption text-ink-2">
              This decides whether the packaged-commodity declaration duty applies at all. Only a
              retail sale, or a package made up in the buyer’s presence, is in scope; the rest are
              recorded and marked out of scope.
            </p>

            <div className="mt-4">
              <RadioCards
                name="transaction_type"
                value={transactionType}
                onChange={(v) => {
                  setTransactionType(v)
                  setConfirmOutOfScope(false)
                }}
                options={txOptions}
                columns={2}
              />
            </div>

            {fieldErrors?.transaction_type && (
              <p role="alert" className="mt-2 text-caption text-violation-text">
                {fieldErrors.transaction_type}
              </p>
            )}

            {inScope ? (
              <Callout family="pass" title="In scope" className="mt-4" icon={Info}>
                Chapter II applies. Every package you capture on this visit will be assessed against
                the declaration rules.
              </Callout>
            ) : (
              <Callout family="review" title="This will be recorded out of scope" className="mt-4">
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
            )}
          </div>
        </div>
      </Card>

      {/* ================= Step 3 — location & time ================= */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent-text">
            <MapPin size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-h2 text-ink">{t('inspection.location')}</h2>
            <p className="mt-1 max-w-prose text-caption text-ink-2">
              Optional, and honest either way. The coordinates go to the server, which decides
              whether you were inside the shop’s geofence — that judgement is not made on this
              device.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                icon={MapPin}
                onClick={locate}
                loading={geo.status === 'locating'}
              >
                {geo.status === 'ok' ? 'Update my location' : 'Use my current location'}
              </Button>
              {geo.status === 'ok' && (
                <Pill family="pass">{t('inspection.locationAccuracy', { m: Math.round(geo.accuracy ?? 0) })}</Pill>
              )}
            </div>

            {geo.status === 'ok' && (
              <p className="nn-mono mt-3 text-caption text-ink-3">
                {geo.lat.toFixed(5)}, {geo.lon.toFixed(5)}
              </p>
            )}
            {(geo.status === 'error' || geo.status === 'unsupported') && (
              <Callout family="na" className="mt-3" icon={Info}>
                {geo.status === 'unsupported'
                  ? 'This device does not expose a location to the browser. The inspection can still be recorded; the geofence will read “unknown”.'
                  : geo.message}
              </Callout>
            )}

            <ul className="mt-4 flex flex-col gap-2 text-caption text-ink-2">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-pill bg-ink-3" aria-hidden="true" />
                <span>
                  <span className="font-medium text-ink">Unknown</span> is not the same as inside. A
                  visit with no fix is recorded as unknown, never quietly placed at the shop.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-pill bg-ink-3" aria-hidden="true" />
                <span>
                  <span className="font-medium text-ink">Outside</span> the geofence does not block
                  the visit. It is recorded with the distance, for whoever reviews it to weigh.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-pill bg-ink-3" aria-hidden="true" />
                <span>
                  A browser cannot tell a real fix from a simulated one, so this screen does not
                  claim either way. The field app on a managed handset can, and does.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </Card>

      {/* ================= Step 4 — notes ================= */}
      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="text-h2 text-ink">{t('inspection.notes')}</h2>
        <p className="mt-1 max-w-prose text-caption text-ink-2">
          Anything about the visit that the photographs will not carry. The representative’s
          signature is recorded later, when you submit — not here.
        </p>
        <div className="mt-4">
          <Field label={t('inspection.notes')} optional error={fieldErrors?.notes}>
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
      </Card>

      {/* ================= Action row ================= */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-5">
        <Button variant="ghost" onClick={() => navigate('/inspector/inspections')}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          iconRight={ArrowRight}
          onClick={onCreate}
          loading={create.pending}
          disabled={!canCreate}
          disabledReason={
            !storeId
              ? 'Choose the shop you are standing in first.'
              : needsScopeAck
                ? 'Acknowledge that an out-of-scope visit produces no compliance result.'
                : undefined
          }
        >
          Create and start capturing
        </Button>
      </div>

      {/* ---- The honest boundary. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="text-h2 text-ink">What this screen cannot do</h2>
        <p className="mt-1 max-w-prose text-caption text-ink-2">
          Named rather than faked, so a missing feature never reads as a broken one.
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {[
            [
              'It cannot register a new shop',
              'POST /stores is an administrator’s route; an inspector calling it receives 403. Adding a shop is deliberately not a field action.',
            ],
            [
              'It cannot place a visit into scope',
              'Scope follows the transaction type on the server. Marking a wholesale visit as retail to force a verdict is exactly the move the split is designed to prevent.',
            ],
            [
              'It cannot decide the geofence',
              'The device offers coordinates; the server compares them to the shop and returns inside, outside or unknown. This screen reports its own accuracy, nothing more.',
            ],
            [
              'It cannot record a signature',
              'A representative’s signature is part of submitting the finished visit, not of opening it. That step lives on the inspection’s own page.',
            ],
          ].map(([title, body]) => (
            <li key={title} className="border-l-2 border-divider pl-3">
              <p className="text-small font-semibold text-ink">{title}</p>
              <p className="mt-0.5 max-w-prose text-caption text-ink-2">{body}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
