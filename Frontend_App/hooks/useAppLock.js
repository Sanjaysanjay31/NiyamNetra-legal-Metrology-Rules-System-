import { useEffect } from 'react';
import { AppState } from 'react-native';

// Minimal background app-lock: when the app returns from background, ask for
// biometrics/PIN when expo-local-authentication is available. Graceful no-op
// everywhere else (web, missing enrolment, missing module) — security must
// never crash the app or lock the user out.
export function useAppLock({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    let LocalAuth = null;
    try {
      // eslint-disable-next-line global-require
      LocalAuth = require('expo-local-authentication');
    } catch {
      return undefined; // module unavailable — no-op
    }
    if (!LocalAuth?.hasHardwareAsync || !LocalAuth?.authenticateAsync) return undefined;
    let cancelled = false;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || cancelled) return;
      try {
        const [hasHw, enrolled] = await Promise.all([
          LocalAuth.hasHardwareAsync(),
          LocalAuth.isEnrolledAsync ? LocalAuth.isEnrolledAsync() : Promise.resolve(true),
        ]);
        if (!hasHw || !enrolled) return;
        await LocalAuth.authenticateAsync({
          promptMessage: 'Unlock NiyamNetra',
          cancelLabel: 'Cancel',
          disableDeviceFallback: false,
        });
        // A failed/cancelled auth keeps the app open but the session intact:
        // inspection evidence must never be held hostage by a biometric miss.
      } catch { /* graceful no-op */ }
    });
    return () => { cancelled = true; try { sub.remove(); } catch {} };
  }, [enabled]);
}
