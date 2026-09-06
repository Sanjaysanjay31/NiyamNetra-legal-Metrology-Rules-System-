/**
 * The offline outbox.
 *
 * An inspection happens in a market with one bar of signal and a shop owner
 * waiting. The portal must accept the whole inspection - store, packages,
 * photographs, signature - without a network, and then hand it over whenever the
 * connection returns. That is what this file does, on top of IndexedDB.
 *
 * Design notes that matter:
 *
 *  - Photographs are stored as Blobs in IndexedDB, not as base64 in
 *    localStorage. A single 4032x3024 JPEG is roughly 3 MB; base64 inflates it by
 *    a third and localStorage caps out around 5 MB in total. Three packages would
 *    exceed the quota and the failure mode is a thrown exception mid-inspection.
 *
 *  - Each queued item carries a `client_uuid` generated on the device. It is
 *    sent as the `Idempotency-Key` request HEADER (CORS-allowed in
 *    Backend/main.py), never as a body field: neither CreateInspectionRequest
 *    nor CreateScanRequest defines `client_uuid`, so a body field would be
 *    rejected or ignored. The header lets a submission that succeeded but whose
 *    response was lost on a dying connection be retried without creating a
 *    duplicate inspection against the same shop. Server-side dedup is not
 *    observed in the current backend beyond accepting the header, so the uuid
 *    is also the outbox's local identity (unique index) for exactly-once
 *    flush bookkeeping on this device.
 *
 *  - Flush is strictly sequential and stops at the first failure. Inspections
 *    have an order (create, then upload images, then assess, then submit) and
 *    firing them concurrently against a weak connection maximises the chance of
 *    a partial write. Slow and ordered beats fast and half-written.
 *
 *  - Nothing here is ever silently discarded. An item that fails permanently
 *    (422, 409) moves to `blocked` and stays visible so an officer can see it
 *    and decide; an item that fails transiently stays `pending` with its attempt
 *    count bumped. A queue that empties itself on error is indistinguishable
 *    from a queue that worked.
 */

import { openDB } from 'idb'
import { endpoints } from '../api/client'

const DB_NAME = 'niyamnetra'
const DB_VERSION = 1
const STORE = 'outbox'
const BLOBS = 'blobs'

let dbPromise = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
          s.createIndex('status', 'status')
          s.createIndex('created_at', 'created_at')
          s.createIndex('client_uuid', 'client_uuid', { unique: true })
        }
        if (!d.objectStoreNames.contains(BLOBS)) {
          d.createObjectStore(BLOBS, { keyPath: 'id', autoIncrement: true })
        }
      },
    })
  }
  return dbPromise
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  /* Older WebViews on field devices. Not cryptographically important - this is
     an idempotency key, not a secret. */
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/* --------------------------------------------------------------- listeners -- */

const listeners = new Set()

/** Subscribe to queue-depth changes. The header's sync badge uses this. */
export function onQueueChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function announce() {
  const summary = await queueSummary()
  for (const fn of listeners) {
    try {
      fn(summary)
    } catch {
      /* a broken subscriber must not stall the flush */
    }
  }
}

/* ----------------------------------------------------------------- writing -- */

/**
 * Store an image Blob and get back a handle to reference from a queued item.
 * Kept in a separate store so a queue read for the badge does not pull megabytes
 * of JPEG into memory just to count rows.
 */
export async function putBlob(blob, meta = {}) {
  const d = await db()
  const id = await d.add(BLOBS, { blob, ...meta })
  return { blobId: id, size: blob.size, type: blob.type, ...meta }
}

export async function getBlob(blobId) {
  const d = await db()
  const row = await d.get(BLOBS, blobId)
  return row?.blob ?? null
}

/**
 * Queue a complete inspection.
 *
 * @param payload  { inspection, scans: [{ scan, images: [{ blobId, panel }] }] }
 */
export async function enqueueInspection(payload) {
  const d = await db()
  const item = {
    kind: 'inspection',
    client_uuid: uuid(),
    payload,
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
  }
  const id = await d.add(STORE, item)
  await announce()
  return { ...item, id }
}

/**
 * Queue one scan (package) against an inspection that already exists on the
 * server. Used by Capture when the save or an image upload fails offline.
 *
 * Two shapes:
 *  - new scan: enqueueScan(inspectionId, scanBody, images, { scope,
 *    listingUrl }) — flush creates the scan, patches scope, attaches the
 *    listing, then uploads the images.
 *  - extra image for an existing scan: enqueueScan(inspectionId, null,
 *    images, { scanId }) — flush uploads straight to that scan id.
 *
 * @param inspectionId  server id of the existing draft inspection
 * @param scan          CreateScanRequest body (commodity_*, geometry), or null
 *                      when the scan already exists and only images are queued
 * @param images        [{ blobId, panel, name }] handles from putBlob
 * @param scope         optional scope-flag patch for PATCH /scans/{id}
 * @param listingUrl    optional e-commerce listing URL for POST .../listing
 * @param scanId        existing scan id when `scan` is null
 */
export async function enqueueScan(inspectionId, scan, images = [], { scope, listingUrl, scanId } = {}) {
  const d = await db()
  const item = {
    kind: 'scan',
    client_uuid: uuid(),
    payload: {
      inspectionId,
      scan,
      images,
      scope: scope ?? null,
      listingUrl: listingUrl ?? null,
      scanId: scanId ?? null,
    },
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
  }
  const id = await d.add(STORE, item)
  await announce()
  return { ...item, id }
}

export async function listQueue() {
  const d = await db()
  const rows = await d.getAll(STORE)
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function queueSummary() {
  const rows = await listQueue()
  return {
    pending: rows.filter((r) => r.status === 'pending').length,
    sending: rows.filter((r) => r.status === 'sending').length,
    blocked: rows.filter((r) => r.status === 'blocked').length,
    total: rows.length,
  }
}

/**
 * Remove an item. Only ever called after a confirmed server acknowledgement, or
 * explicitly by an officer who has read the failure and chosen to discard it.
 */
export async function removeItem(id) {
  const d = await db()
  const item = await d.get(STORE, id)
  const blobIds = collectBlobIds(item)
  const tx = d.transaction([STORE, BLOBS], 'readwrite')
  await tx.objectStore(STORE).delete(id)
  for (const b of blobIds) await tx.objectStore(BLOBS).delete(b)
  await tx.done
  await announce()
}

function collectBlobIds(item) {
  const ids = []
  for (const s of item?.payload?.scans ?? []) {
    for (const img of s.images ?? []) if (img.blobId != null) ids.push(img.blobId)
  }
  for (const img of item?.payload?.images ?? []) if (img.blobId != null) ids.push(img.blobId)
  return ids
}

async function patch(id, changes) {
  const d = await db()
  const item = await d.get(STORE, id)
  if (!item) return
  await d.put(STORE, { ...item, ...changes })
  await announce()
}

/** Move a blocked item back into the queue after an officer has corrected it. */
export async function retryItem(id) {
  await patch(id, { status: 'pending', last_error: null })
}

/* ---------------------------------------------------------------- flushing -- */

let flushing = false

/**
 * Send everything pending, oldest first, stopping at the first transient
 * failure. Safe to call often - a second concurrent call returns immediately
 * rather than double-sending.
 *
 * @returns { sent, blocked, remaining, stopped }
 */
export async function flushQueue({ onProgress } = {}) {
  if (flushing) return { sent: 0, blocked: 0, remaining: null, stopped: 'already-running' }
  flushing = true
  let sent = 0
  let blocked = 0
  let stopped = null

  try {
    const rows = (await listQueue()).filter((r) => r.status === 'pending')
    for (const item of rows) {
      await patch(item.id, { status: 'sending' })
      onProgress?.({ item, phase: 'start' })
      try {
        if (item.kind === 'scan') await sendScan(item, onProgress)
        else await sendInspection(item, onProgress)
        await removeItem(item.id)
        sent += 1
      } catch (err) {
        /* A 4xx that is not 401/408/429 means the server understood and refused.
           Retrying will refuse again, so the item is parked where a human can
           see it rather than looping forever behind a spinner. */
        const permanent =
          err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status)
        await patch(item.id, {
          status: permanent ? 'blocked' : 'pending',
          attempts: (item.attempts ?? 0) + 1,
          last_error: err.message ?? String(err),
        })
        if (permanent) {
          blocked += 1
          continue
        }
        stopped = err.offline ? 'offline' : 'error'
        break
      }
    }
  } finally {
    flushing = false
    await announce()
  }

  const summary = await queueSummary()
  return { sent, blocked, remaining: summary.pending, stopped }
}

/**
 * The order below is the contract, not a preference: an image cannot be attached
 * to a scan that does not exist, and a scan must be assessed before the
 * inspection is submitted, because submission freezes the record.
 */
function idemHeaders(clientUuid) {
  return { headers: { 'Idempotency-Key': clientUuid } }
}

async function uploadImages(scanId, images, item, onProgress) {
  for (const img of images ?? []) {
    const blob = await getBlob(img.blobId)
    if (!blob) continue
    const file = new File([blob], img.name ?? `${img.panel}.jpg`, {
      type: blob.type || 'image/jpeg',
    })
    await endpoints.scans.uploadImage(
      scanId,
      file,
      img.panel,
      (fraction) => onProgress?.({ item, phase: 'upload', panel: img.panel, fraction }),
      idemHeaders(`${item.client_uuid}:${img.panel}`)
    )
  }
}

async function sendInspection(item, onProgress) {
  const { inspection, scans = [] } = item.payload

  const created = await endpoints.inspections.create(
    { ...inspection },
    idemHeaders(item.client_uuid)
  )
  const inspectionId = created.id

  for (const entry of scans) {
    const scanUuid = uuid()
    const scan = await endpoints.inspections.createScan(
      inspectionId,
      entry.scan,
      idemHeaders(scanUuid)
    )
    if (entry.scope) await endpoints.scans.updateScan(scan.id, entry.scope)
    if (entry.listingUrl) await endpoints.scans.attachListing(scan.id, entry.listingUrl)
    await uploadImages(scan.id, entry.images, item, onProgress)
    await endpoints.scans.assess(scan.id)
    onProgress?.({ item, phase: 'scan-done', scanId: scan.id })
  }

  if (item.payload.submit) {
    await endpoints.inspections.submit(inspectionId, item.payload.submit)
  }
  return inspectionId
}

async function sendScan(item, onProgress) {
  const { inspectionId, scan, images = [], scope, listingUrl, scanId: existingScanId } = item.payload
  let scanId = existingScanId
  if (scanId == null) {
    const created = await endpoints.inspections.createScan(
      inspectionId,
      scan,
      idemHeaders(item.client_uuid)
    )
    scanId = created?.scan_id ?? created?.id
  }
  if (scope) await endpoints.scans.updateScan(scanId, scope)
  if (listingUrl) await endpoints.scans.attachListing(scanId, listingUrl)
  await uploadImages(scanId, images, item, onProgress)
  onProgress?.({ item, phase: 'scan-done', scanId })
  return scanId
}

/**
 * Flush when the connection returns and once on start-up. Registered by the app
 * shell so it happens whichever screen the officer is on.
 */
export function startAutoFlush({ onResult } = {}) {
  const run = async () => {
    const summary = await queueSummary()
    if (summary.pending === 0) return
    const result = await flushQueue()
    onResult?.(result)
  }
  window.addEventListener('online', run)
  /* A visibility change catches the case the browser never fired `online` -
     common when a device wakes from sleep on a different network. */
  const onVisible = () => {
    if (document.visibilityState === 'visible') run()
  }
  document.addEventListener('visibilitychange', onVisible)
  run()
  return () => {
    window.removeEventListener('online', run)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
