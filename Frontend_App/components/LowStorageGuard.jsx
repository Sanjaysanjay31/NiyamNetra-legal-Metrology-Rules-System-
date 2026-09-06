import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
// Classic FileSystem API moved to 'expo-file-system/legacy' in SDK 54.
import * as FileSystem from 'expo-file-system/legacy';

// Single source for the floor: api/config.js mirrors the backend
// EVIDENCE_MIN_FREE_GB (5GB). Falls back to the literal when the import
// fails so storage checks never crash the app.
let EVIDENCE_MIN_FREE_BYTES = 5 * 1024 ** 3;
try {
  // eslint-disable-next-line global-require
  const cfg = require('../api/config');
  if (cfg?.EVIDENCE_MIN_FREE_BYTES) EVIDENCE_MIN_FREE_BYTES = cfg.EVIDENCE_MIN_FREE_BYTES;
} catch { /* keep the literal fallback */ }
export { EVIDENCE_MIN_FREE_BYTES };

// Re-check storage after every successful sync: syncing purges uploaded files,
// which is exactly when a low-storage warning may clear. LowStorageGuard is
// rendered INSIDE SyncProvider (see App.js), but imports it lazily so the two
// modules never form a hard import cycle at load time.
function useLastSyncTick() {
  try {
    // eslint-disable-next-line global-require
    const { useSync } = require('../offline/SyncProvider');
    return useSync()?.lastSync ?? null;
  } catch {
    return null;
  }
}

export function useStorageWarning() {
  const [warn, setWarn] = useState(null);
  const recheck = useCallback(async () => {
    try {
      const free = await FileSystem.getFreeDiskStorageAsync();
      if (free !== null && free !== undefined) {
        const gb = free / (1024 ** 3);
        if (gb < 0.5) setWarn(`Storage ${gb.toFixed(1)}GB — capture blocked. Sync now to free space.`);
        else if (gb < 2) setWarn(`Storage ${gb.toFixed(1)}GB — sync soon.`);
        else setWarn(null);
      }
    } catch { /* storage API unavailable — no warning */ }
  }, []);
  return [warn, recheck];
}

export default function LowStorageGuard({ children }) {
  const [warn, recheck] = useStorageWarning();
  const lastSync = useLastSyncTick();

  useEffect(() => { recheck(); }, [recheck]);
  // Storage frees up when a sync purges uploaded files — recheck then too.
  useEffect(() => { if (lastSync) recheck(); }, [lastSync, recheck]);

  // Never unmount children on low storage: the sync UI lives inside the
  // guarded tree, and hiding it deadlocks the user (no way to sync → no way
  // to free space → warning never clears). Render the banner ABOVE children.
  return (
    <View style={{ flex: 1 }}>
      {warn && (
        <View style={{ backgroundColor: '#FEF2F2', padding: 12 }}>
          <Text style={{ color: '#B91C1C', fontSize: 12 }}>{warn}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

// Standalone recheck for callers outside React render (e.g. after a manual
// purge). Returns the warning string, or null when storage is healthy.
export async function recheckStorage() {
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    if (free === null || free === undefined) return null;
    const gb = free / (1024 ** 3);
    if (gb < 0.5) return `Storage ${gb.toFixed(1)}GB — capture blocked. Sync now to free space.`;
    if (gb < 2) return `Storage ${gb.toFixed(1)}GB — sync soon.`;
    return null;
  } catch {
    return null;
  }
}
