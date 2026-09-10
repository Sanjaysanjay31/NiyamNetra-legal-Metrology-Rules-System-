// offline/queue.js — Expo file-system queue. Never AsyncStorage + base64. 11 §2.4
import { Platform } from 'react-native';
// The classic FileSystem API moved to 'expo-file-system/legacy' in SDK 54
// (the default export is the new Directory/File/Paths API).
import * as FileSystem from 'expo-file-system/legacy';

// On web there is no file system (FileSystem.documentDirectory is null), and the
// app is used for browser preview only — the offline capture queue is a phone
// feature. Web callers persist to localStorage instead of silently dropping.
const isWeb = Platform.OS === 'web';
const WEB_KEY = 'nn_queue_web';

// NOTE: FileSystem.documentDirectory is null on web AND is only valid after
// the native module loads, so DIR/MANIFEST must be resolved lazily inside
// each function (evaluating them at import time crashes the web build).
// Never compute them at module scope.
function pendingDir() {
  return FileSystem.documentDirectory + 'pending/';
}

function manifestPath() {
  return pendingDir() + 'manifest.json';
}

// Monotonic counter backing BOTH file names and queue ids, so two items
// created in the same millisecond never collide (timestamps alone collide
// under burst capture and random suffixes can theoretically repeat).
let monotonic = 0;
function nextSeq() {
  monotonic += 1;
  return `${Date.now()}-${monotonic}`;
}
function uniqueName(prefix) {
  return `${prefix}-${nextSeq()}.jpg`;
}
function newId(prefix) {
  return `${prefix}-${nextSeq()}`;
}

// Ensure dir exists
async function ensureDir() {
  const DIR = pendingDir();
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

// ---- web localStorage fallback (preview only — nothing is silently lost) ---
function loadWebQueue() {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_KEY);
    if (!raw) return [];
    const q = JSON.parse(raw);
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}
function saveWebQueue(q) {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(q));
  } catch { /* quota — best effort */ }
}

// Manifest is array of { id, type, inspectionId, scanId, fileUris[], files[],
// incompleteFiles?, body, result?, createdAt, is_synced, syncError? }
export async function loadQueue() {
  if (isWeb) return loadWebQueue();
  await ensureDir();
  const MANIFEST = manifestPath();
  const info = await FileSystem.getInfoAsync(MANIFEST);
  if (!info.exists) return [];
  const raw = await FileSystem.readAsStringAsync(MANIFEST);
  try {
    const q = JSON.parse(raw);
    return Array.isArray(q) ? q : [];
  } catch { return []; }
}

export async function saveQueue(q) {
  if (isWeb) {
    saveWebQueue(q);
    return;
  }
  await ensureDir();
  await FileSystem.writeAsStringAsync(manifestPath(), JSON.stringify(q));
}

// Copy helper shared by both enqueue paths. Panels travel WITH the uri so the
// sync pass can upload each file to POST /scans/{id}/images with its panel
// label instead of guessing.
async function copyIntoPending(uris, panels, idPrefix) {
  const DIR = isWeb ? null : pendingDir();
  const files = [];
  const incompleteFiles = [];
  const list = uris || [];
  for (let i = 0; i < list.length; i++) {
    const uri = list[i];
    const panel = (panels && panels[i]) || `extra-${i + 1}`;
    if (isWeb) {
      // No filesystem on web: keep the original uri (blob/object URL) plus
      // the panel label so the sync pass still knows what to upload.
      files.push({ uri, panel });
      continue;
    }
    const dest = DIR + uniqueName(idPrefix);
    try {
      await FileSystem.copyAsync({ from: uri, to: dest });
      files.push({ uri: dest, panel });
    } catch (e) {
      console.warn('[queue] copy failed, marking incomplete:', uri, e?.message || e);
      incompleteFiles.push(uri);
    }
  }
  return { files, incompleteFiles };
}

// Enqueue a new inspection+scan atomically. Returns id.
// store_id is REQUIRED (backend 404s without it); latitude/longitude/accuracy
// ride along for the geofence. `result` is a provisional local hint only
// (e.g. 'queued') — the server verdict is authoritative; the sync pass sorts
// provisional violations first when the flag is present.
export async function enqueueInspection({ store_id, transaction_type, latitude, longitude, gps_accuracy_m, scans, result, signature_status, notes, is_synced = false }) {
  const q = await loadQueue();
  const id = newId('insp');
  const local_created_at = new Date().toISOString();

  // Process all packages in the inspection session
  const processedScans = [];
  const allFiles = [];
  const allIncomplete = [];

  const scanList = Array.isArray(scans) && scans.length > 0 ? scans : [{}];
  for (let sIdx = 0; sIdx < scanList.length; sIdx++) {
    const s = scanList[sIdx];
    const sId = `${id}-scan-${sIdx + 1}`;
    const panelUris = s.panelUris || (s.panelPhotos ? Object.values(s.panelPhotos) : []);
    const panels = s.panels || (s.panelPhotos ? Object.keys(s.panelPhotos) : panelUris.map((_, i) => (
      ['front', 'back', 'mrp', 'batch'][i] || `extra-${i - 3}`
    )));
    const { files, incompleteFiles } = await copyIntoPending(panelUris, panels, sId);
    allFiles.push(...files);
    allIncomplete.push(...incompleteFiles);

    // Default compliant rectangular geometry if none provided (prevents 422 Unprocessable Entity)
    const geometry = s.geometry || {
      panel_shape: 'rectangular',
      panel_height_mm: 120.0,
      panel_width_mm: 80.0,
      is_blown_moulded: false,
      scale_source: 'declared',
    };

    processedScans.push({
      commodity_generic: s.commodity_generic || null,
      brand_name: s.brand_name || null,
      batch_number: s.batch_number || null,
      geometry,
      is_imported: s.is_imported,
      is_perishable: s.is_perishable,
      has_sticker: s.has_sticker,
      files,
      fileUris: files.map((f) => f.uri),
      incompleteFiles,
    });
  }

  q.push({
    id,
    type: 'inspection',
    body: { store_id, transaction_type, latitude, longitude, gps_accuracy_m, local_created_at, notes: notes || null },
    signature_status: signature_status || 'signed',
    notes: notes || null,
    scans: processedScans,
    // Keep top-level files & fileUris for backward compatibility
    files: allFiles,
    fileUris: allFiles.map((f) => f.uri),
    incompleteFiles: allIncomplete,
    createdAt: local_created_at,
    is_synced: Boolean(is_synced),
    ...(result ? { result } : {}),
  });
  await saveQueue(q);
  return id;
}

// Enqueue a scan with panels
export async function enqueueScan(inspectionLocalId, { commodity_generic, brand_name, batch_number, geometry, panelUris, panels, is_imported, is_perishable, is_tobacco, has_sticker, result, violationSuspected }) {
  const q = await loadQueue();
  const id = newId('scan');
  const geom = geometry || {
    panel_shape: 'rectangular',
    panel_height_mm: 120.0,
    panel_width_mm: 80.0,
    is_blown_moulded: false,
    scale_source: 'declared',
  };
  const { files, incompleteFiles } = await copyIntoPending(
    panelUris,
    panels || (panelUris || []).map((_, i) => (['front', 'back', 'mrp', 'batch'][i] || `extra-${i - 3}`)),
    id,
  );
  q.push({
    id,
    type: 'scan',
    parentId: inspectionLocalId,
    body: {
      commodity_generic,
      brand_name,
      batch_number,
      geometry: geom,
      is_imported,
      is_perishable,
      is_tobacco,
      has_sticker,
    },
    files,
    fileUris: files.map((f) => f.uri),
    incompleteFiles,
    createdAt: new Date().toISOString(),
    is_synced: false,
    ...(result ? { result } : {}),
    ...(violationSuspected ? { violationSuspected: true } : {}),
  });
  await saveQueue(q);
  return id;
}

export async function markSynced(id) {
  const q = await loadQueue();
  const idx = q.findIndex(x => x.id === id);
  if (idx >= 0) {
    q[idx].is_synced = true;
    delete q[idx].syncError;
    try {
      await saveQueue(q);
    } finally {
      // try/finally so a storage failure after the in-memory mark cannot
      // leave the caller believing the mark was persisted — the error still
      // propagates after the write was attempted.
    }
  }
}

// Mark an item as permanently failed (4xx dead-letter): it stays in the queue
// for inspection but is_syncing skips it. Never retried, never purged blindly.
export async function markFailed(id, error) {
  const q = await loadQueue();
  const idx = q.findIndex(x => x.id === id);
  if (idx >= 0) {
    q[idx].syncFailed = true;
    q[idx].syncError = String(error?.message || error || 'rejected by server').slice(0, 300);
    try {
      await saveQueue(q);
    } finally { /* mark attempted; propagate nothing */ }
  }
}

// Remove synced items and delete their files after the server confirms
// receipt. TODO: verify sha256 against the server before purging — current
// purge only confirms the POST succeeded, not byte-level integrity.
// Idempotent: safe to call on startup — any leftover is_synced rows (e.g.
// from a crash between markSynced and purge) are collected here.
export async function purgeSynced() {
  const q = await loadQueue();
  const remaining = [];
  for (const item of q) {
    if (item.is_synced && !item.syncFailed) {
      if (!isWeb) {
        const uris = (item.files || []).map((f) => f.uri).concat(item.fileUris || []);
        for (const uri of new Set(uris)) {
          try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
        }
      }
    } else remaining.push(item);
  }
  try {
    await saveQueue(remaining);
  } finally { /* purge attempted */ }
}

// On startup, collect any is_synced leftovers from a crash between
// markSynced and purgeSynced. Idempotent — call once at boot.
export async function purgeSyncedOnBoot() {
  try {
    await purgeSynced();
  } catch { /* best effort on boot */ }
}

export async function getFreeDiskStorageAsync() {
  try { return await FileSystem.getFreeDiskStorageAsync(); } catch { return null; }
}

export async function queueSize() {
  const q = await loadQueue();
  return q.filter(x => !x.is_synced && !x.syncFailed).length;
}
