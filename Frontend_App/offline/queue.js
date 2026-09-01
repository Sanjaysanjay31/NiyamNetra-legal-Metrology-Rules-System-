// offline/queue.js — Expo file-system queue. Never AsyncStorage + base64. 11 §2.4
import { Platform } from 'react-native';
// The classic FileSystem API moved to 'expo-file-system/legacy' in SDK 54
// (the default export is the new Directory/File/Paths API).
import * as FileSystem from 'expo-file-system/legacy';

// On web there is no file system (FileSystem.documentDirectory is null), and the
// app is used for browser preview only — the offline capture queue is a phone
// feature. Guard every entry point so web callers get a harmless no-op instead
// of a crash.
const isWeb = Platform.OS === 'web';

const DIR = FileSystem.documentDirectory + 'pending/';
const MANIFEST = DIR + 'manifest.json';

// Ensure dir exists
async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

// Manifest is array of { id, type, inspectionId, scanId, fileUris[], body, createdAt, is_synced }
export async function loadQueue() {
  if (isWeb) return [];
  await ensureDir();
  const info = await FileSystem.getInfoAsync(MANIFEST);
  if (!info.exists) return [];
  const raw = await FileSystem.readAsStringAsync(MANIFEST);
  try { return JSON.parse(raw); } catch { return []; }
}

export async function saveQueue(q) {
  if (isWeb) return;
  await ensureDir();
  await FileSystem.writeAsStringAsync(MANIFEST, JSON.stringify(q));
}

// Enqueue a new inspection+scan atomically. Returns id.
export async function enqueueInspection({ store_id, transaction_type, latitude, longitude, scans }) {
  const q = await loadQueue();
  const id = `insp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const local_created_at = new Date().toISOString();
  // Copy each image file into pending dir as file:// reference (never base64)
  const fileUris = [];
  for (const s of scans || []) {
    for (const uri of s.panelUris || []) {
      const dest = DIR + `${id}-${Date.now()}.jpg`;
      try { await FileSystem.copyAsync({ from: uri, to: dest }); fileUris.push(dest); } catch {}
    }
  }
  q.push({ id, type: 'inspection', body: { store_id, transaction_type, latitude, longitude, local_created_at }, fileUris, createdAt: local_created_at, is_synced: false });
  await saveQueue(q);
  return id;
}

// Enqueue a scan with panels
export async function enqueueScan(inspectionLocalId, { commodity_generic, batch_number, geometry, panelUris, is_imported, is_perishable, is_tobacco }) {
  const q = await loadQueue();
  const id = `scan-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const fileUris = [];
  for (const uri of panelUris || []) {
    const dest = DIR + `${id}-${Date.now()}-${Math.random()}.jpg`;
    try { await FileSystem.copyAsync({ from: uri, to: dest }); fileUris.push(dest); } catch {}
  }
  q.push({ id, type: 'scan', parentId: inspectionLocalId, body: { commodity_generic, batch_number, geometry, is_imported, is_perishable, is_tobacco }, fileUris, createdAt: new Date().toISOString(), is_synced: false });
  await saveQueue(q);
  return id;
}

export async function markSynced(id) {
  const q = await loadQueue();
  const idx = q.findIndex(x => x.id === id);
  if (idx >= 0) { q[idx].is_synced = true; await saveQueue(q); }
}

// Remove synced items and delete their files after server confirmed sha256
export async function purgeSynced() {
  const q = await loadQueue();
  const remaining = [];
  for (const item of q) {
    if (item.is_synced) {
      for (const uri of item.fileUris || []) {
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
      }
    } else remaining.push(item);
  }
  await saveQueue(remaining);
}

export async function getFreeDiskStorageAsync() {
  try { return await FileSystem.getFreeDiskStorageAsync(); } catch { return null; }
}

export async function queueSize() {
  const q = await loadQueue();
  return q.filter(x => !x.is_synced).length;
}
