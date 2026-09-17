import { useEffect } from 'react';
import { AppState } from 'react-native';
import { ALLOW_SCREEN_CAPTURE } from '../api/config';

// ============================================================================
// Screen-capture / screen-recording policy for the field app.
// ============================================================================
// WHY THIS FILE EXISTS
//
// The app used to call expo-screen-capture's `preventScreenCaptureAsync()` on
// the capture surfaces. On Android that sets FLAG_SECURE on the Activity
// window — and FLAG_SECURE is an ACTIVITY-WIDE flag, not a per-screen one. Once
// set, every frame a screen recorder captures of this window is black until the
// flag is cleared or the app is force-stopped. The "clear on unmount" cleanup
// never ran when navigating inside a tab navigator, so the flag leaked: the
// whole app — including the Login screen after logout — recorded as a black
// screen, and several OEM screen recorders (MIUI/ColorOS/Funtouch) surfaced the
// system toast "cannot record this content due to security reasons".
//
// THE RULE NOW
//
// Nothing in this app sets FLAG_SECURE. Every surface re-asserts the *cleared*
// state on mount, on app resume, and on every navigation change, so a leftover
// flag from an older build of this app, from a future dependency, or from a
// still-mounted screen cannot survive. `ALLOW_SCREEN_CAPTURE` in api/config.js
// is the single switch: set it to false and every call here becomes a no-op,
// which is the deliberate opt-in to blocking screenshots/recording again.
//
// Native belt-and-braces lives in plugins/withAllowScreenCapture.js, which
// clears the flag in MainActivity itself.
// ============================================================================

let ScreenCapture = null;
try { ScreenCapture = require('expo-screen-capture'); } catch { ScreenCapture = null; }

// Every tag this codebase has ever passed to preventScreenCaptureAsync(). The
// module keeps a private `activeTags` Set and only clears the real FLAG_SECURE
// once that Set is empty, so each known tag has to be released explicitly —
// see node_modules/expo-screen-capture/src/ScreenCapture.ts.
const SCREEN_CAPTURE_KEYS = ['default', 'camera', 'session', 'evidence'];

/**
 * Clear Android FLAG_SECURE / iOS capture protection for this app.
 *
 * Never throws: screen-capture policy must not be able to take a screen down
 * (the module is a no-op on web and can be missing in a dev client).
 *
 * @returns {Promise<boolean>} true when capture was (re-)allowed.
 */
export async function allowScreenCapture() {
  if (!ALLOW_SCREEN_CAPTURE) return false;
  if (!ScreenCapture?.allowScreenCaptureAsync) return false;
  try {
    for (const key of SCREEN_CAPTURE_KEYS) {
      // Sequential on purpose: each call mutates the module's tag Set, and the
      // native clear only happens for the call that empties it.
      // eslint-disable-next-line no-await-in-loop
      await ScreenCapture.allowScreenCaptureAsync(key);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-assert the allow-capture policy for as long as the owner is mounted, and
 * again every time the app returns to the foreground.
 */
export function useAllowScreenCapture() {
  useEffect(() => {
    allowScreenCapture();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') allowScreenCapture();
    });
    return () => { try { sub.remove(); } catch { /* already torn down */ } };
  }, []);
}

export default useAllowScreenCapture;
