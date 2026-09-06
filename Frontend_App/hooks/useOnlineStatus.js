import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Network from 'expo-network';

export function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        if (Platform.OS === 'web') {
          if (mounted) setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
          return;
        }
        const s = await Network.getNetworkStateAsync();
        if (!mounted) return;
        // isInternetReachable is the stronger signal when present; fall back
        // to isConnected when the platform does not report reachability.
        const reachable = s?.isInternetReachable;
        setOnline(reachable != null ? !!s.isConnected && !!reachable : !!s.isConnected);
      } catch {
        if (mounted) setOnline(false);
      }
    };
    check();
    // Prefer the platform listener when available; otherwise poll at 15s
    // (5s polling kept the radio awake and drained battery for no benefit).
    let sub = null;
    let id = null;
    try {
      if (typeof Network.addNetworkStateListener === 'function') {
        sub = Network.addNetworkStateListener((s) => {
          if (!mounted) return;
          try {
            const reachable = s?.isInternetReachable;
            setOnline(reachable != null ? !!s.isConnected && !!reachable : !!s.isConnected);
          } catch {
            setOnline(false);
          }
        });
      }
    } catch {
      sub = null;
    }
    if (!sub) id = setInterval(check, 15000);
    return () => { mounted = false; try { sub?.remove?.(); } catch {} if (id) clearInterval(id); };
  }, []);
  return online;
}
