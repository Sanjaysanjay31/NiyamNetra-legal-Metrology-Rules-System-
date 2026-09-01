import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Network from 'expo-network';
import { api } from '../api/client';
import { loadQueue, markSynced, purgeSynced, queueSize } from './queue';

const SyncContext = createContext({ pending: 0, isSyncing: false, syncNow: async () => {}, lastSync: null });
export const useSync = () => useContext(SyncContext);

/**
 * Connectivity check that cannot throw. expo-network is not reliable on the web
 * build, and an unguarded reject here used to surface as an unhandled rejection
 * on a screen that showed nothing — so web uses navigator.onLine instead.
 */
async function isOnline() {
  try {
    if (Platform.OS === 'web') {
      return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    }
    const st = await Network.getNetworkStateAsync();
    return !!st.isConnected;
  } catch {
    return false;
  }
}

export function SyncProvider({ children }) {
  const [pending, setPending] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  // A ref, not the state value: syncNow is held by a 30s interval, and reading
  // isSyncing from a stale closure let two passes overlap.
  const busy = useRef(false);

  const refreshCount = useCallback(async () => {
    try { setPending(await queueSize()); } catch { /* queue unavailable (web) */ }
  }, []);

  const syncNow = useCallback(async () => {
    if (busy.current) return;
    let toSync = [];
    try {
      const q = await loadQueue();
      toSync = q.filter((x) => !x.is_synced);
    } catch {
      return; // no queue on this platform
    }
    if (toSync.length === 0) { await refreshCount(); return; }

    busy.current = true;
    setIsSyncing(true);
    try {
      // Oldest first, one at a time, exponential backoff. 11 §2.4
      for (const item of toSync) {
        let delay = 1000;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (item.type === 'inspection') {
              // POST /inspections — no trailing slash. With a slash Starlette
              // answers 307 and the redirected request needs its own CORS
              // preflight for Idempotency-Key on the web build.
              await api.post(
                '/inspections',
                { ...item.body, local_created_at: item.createdAt },
                { headers: { 'Idempotency-Key': item.id } },
              );
              await markSynced(item.id);
            } else if (item.type === 'scan') {
              // Not implemented on purpose. A scan is created at
              // POST /inspections/{inspection_id}/scans, so it needs the parent
              // inspection's SERVER id, and the queue only holds a local id.
              // Until queue.js stores a localId→remoteId mapping there is no
              // correct request to send, so the item is left queued rather than
              // posted to a path that does not exist.
            }
            break;
          } catch {
            if (attempt === 2) break;
            await new Promise((r) => setTimeout(r, delay));
            delay *= 2;
          }
        }
      }
      try { await purgeSynced(); } catch { /* best effort */ }
      await refreshCount();
      setLastSync(new Date().toISOString());
    } finally {
      busy.current = false;
      setIsSyncing(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      isOnline().then((ok) => { if (ok) syncNow(); }).catch(() => {});
    });
    const interval = setInterval(() => {
      isOnline().then((ok) => { if (ok) syncNow(); }).catch(() => {});
    }, 30000);
    return () => { sub.remove(); clearInterval(interval); };
  }, [refreshCount, syncNow]);

  return (
    <SyncContext.Provider value={{ pending, isSyncing, syncNow, refreshCount, lastSync }}>
      {children}
    </SyncContext.Provider>
  );
}
