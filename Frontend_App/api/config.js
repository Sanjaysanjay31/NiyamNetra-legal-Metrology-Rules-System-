// Single source of truth for the backend base URL.
//
// WHY THIS FILE EXISTS: the URL used to be written in four places (.env,
// app.json extra, eas.json, and a hardcoded fallback in client.js) with three
// different values, so changing one of them appeared to do nothing. Everything
// now resolves through resolveApiBaseUrl() below.
//
// RESOLUTION ORDER
//   1. EXPO_PUBLIC_API_BASE_URL   — set in .env (dev) or eas.json (APK builds).
//                                   Wins whenever it is non-empty.
//   2. Auto-detect (dev only)     — reuse the host the JS bundle was loaded
//                                   from. On web that is window.location; on a
//                                   phone in Expo Go it is the Metro dev-server
//                                   host, i.e. your laptop's LAN IP. This means
//                                   a phone works with NO edits even when your
//                                   WiFi hands out a new IP.
//   3. FALLBACK_HOST below        — last resort. THE ONLY LINE TO HAND-EDIT.
import { Platform, NativeModules } from 'react-native';

export const API_PORT = 8000;

// Evidence floor shared with the backend (Backend config.py
// EVIDENCE_MIN_FREE_GB = 5.0). Capture is blocked below this; a harder
// 0.5GB floor blocks even when the constant cannot be imported.
export const EVIDENCE_MIN_FREE_GB = 5;
export const EVIDENCE_MIN_FREE_BYTES = EVIDENCE_MIN_FREE_GB * 1024 ** 3;

// EDIT HERE if auto-detect cannot apply (e.g. a production APK with no env var).
// This must be your laptop's CURRENT LAN IP (the WiFi IP your phone is on).
// Find it with: ipconfig  → look for "IPv4 Address" under your WiFi adapter.
// SINGLE SOURCE OF TRUTH for the fallback host: eas.json build profiles and
// .env only override via EXPO_PUBLIC_API_BASE_URL at build time — they never
// duplicate this IP. (See the comment block at the bottom of eas.json.)
const FALLBACK_HOST = '10.101.163.148';

// ---------------------------------------------------------------------------
// The three backends you test against. THESE TWO LINES ARE THE ONLY URLs TO
// HAND-EDIT in the whole app. No trailing slash on either.
export const LOCAL_API_URL = 'http://127.0.0.1:8000';
export const RENDER_API_URL = 'https://niyamnetra-backend.onrender.com';
// The third target, "LAN", is derived at runtime — see BACKEND_TARGETS below.
// ---------------------------------------------------------------------------

// Host the JS bundle itself came from — the one host we know is reachable.
function bundleHost() {
  try {
    if (Platform.OS === 'web') {
      return (typeof window !== 'undefined' && window.location && window.location.hostname) || null;
    }
    // Native: the Metro bundle URL carries the dev machine's LAN IP, e.g.
    // http://10.16.54.38:8081/index.bundle?platform=android
    let url = NativeModules && NativeModules.SourceCode && NativeModules.SourceCode.scriptURL;
    if (!url) {
      try {
        // eslint-disable-next-line global-require
        url = require('react-native/Libraries/Core/Devtools/getDevServer')().url;
      } catch { /* not available in a release build — expected */ }
    }
    if (typeof url === 'string') {
      const m = url.match(/^[a-z]+:\/\/([^/:]+)/i);
      if (m && m[1] && m[1] !== 'localhost' && m[1] !== '127.0.0.1') return m[1];
      if (m && m[1]) return m[1];
    }
  } catch { /* fall through to FALLBACK_HOST */ }
  return null;
}

export function resolveApiBaseUrl() {
  // Metro inlines this at build time; an unset var becomes undefined.
  const explicit = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = bundleHost();
  if (host) return `http://${host}:${API_PORT}`;
  return `http://${FALLBACK_HOST}:${API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

// ---------------------------------------------------------------------------
// Local ⇄ LAN ⇄ Render switching, at runtime.
//
// The env var is inlined into the bundle at build time, so changing .env means
// restarting Metro — and an installed APK cannot be changed at all. Instead the
// chosen target is saved in storage and applied on boot, so switching backends
// is one tap on the login screen with no rebuild.
//
// Why three and not two: 127.0.0.1 means "this device". It reaches your backend
// from the web preview running on the same laptop, but from a phone it points at
// the phone itself and can never work — that is what LAN is for.
// --- custom target ---------------------------------------------------------
// Why this exists: the LAN address is auto-detected from the Metro dev server.
// That works in Expo Go, but an installed APK has no dev server, so it falls
// back to FALLBACK_HOST — a hardcoded IP from whatever network the app was
// built on. A home router hands out a different range (192.168.x.x) than a
// campus one (10.x.x.x), so the baked-in address is wrong the moment the
// network changes. Typing the laptop's address on the login screen fixes that
// without a rebuild.
const CUSTOM_KEY = 'nn_backend_custom';
let customUrl = null;                    // in-memory cache, hydrated on boot

/**
 * Accept what a person actually types — "192.168.1.7", "192.168.1.7:8000",
 * "http://192.168.1.7:8000/" — and return a usable base URL, or null if it
 * cannot be one. Missing scheme becomes http, missing port becomes 8000.
 * Parsed by regex, not `new URL`: Hermes' URL polyfill does not implement the
 * hostname/port getters reliably.
 */
export function normalizeBackendUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  // The host charset is restricted on purpose: a permissive [^/:?#] class
  // happily turned "!!!" into "http://!!!:8000", i.e. a saved address that can
  // never connect. IPv4/IPv6/hostname only.
  const m = /^(https?):\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9][A-Za-z0-9.\-]*)(?::(\d+))?/i.exec(s);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const host = m[2];
  if (/\.$|\.\./.test(host)) return null;          // "10.0.0." / "10..0.1"
  if (m[3] !== undefined) {
    const n = Number(m[3]);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  }
  const port = m[3] || (scheme === 'https' ? '' : String(API_PORT));
  return `${scheme}://${host}${port ? `:${port}` : ''}`;
}

export const getCustomUrl = () => customUrl;

/** Hydrate the cache from storage. Never throws. */
export async function loadCustomUrl() {
  try {
    const { getItem } = await import('../auth/secureStore');
    customUrl = normalizeBackendUrl(await getItem(CUSTOM_KEY));
  } catch { customUrl = null; }
  return customUrl;
}

/** Validate, cache and persist a typed address. Returns the URL, or null. */
export async function saveCustomUrl(input) {
  const url = normalizeBackendUrl(input);
  if (!url) return null;
  customUrl = url;
  try {
    const { setItem } = await import('../auth/secureStore');
    await setItem(CUSTOM_KEY, url);
  } catch { /* keep it for this session at least */ }
  return url;
}

export const BACKEND_TARGETS = {
  local: {
    label: 'Local',
    hint: '127.0.0.1 · this PC',
    resolve: () => LOCAL_API_URL,
  },
  lan: {
    label: 'LAN',
    hint: 'Phone on same WiFi',
    resolve: () => `http://${bundleHost() || FALLBACK_HOST}:${API_PORT}`,
  },
  render: {
    label: 'Render',
    hint: 'Deployed',
    resolve: () => RENDER_API_URL,
  },
  custom: {
    label: 'Custom',
    hint: 'Type the address',
    // Falls back to the LAN guess until an address has been saved, so picking
    // this target can never leave the app with no baseURL at all.
    resolve: () => getCustomUrl() || `http://${bundleHost() || FALLBACK_HOST}:${API_PORT}`,
  },
};

const TARGET_KEY = 'nn_backend_target';
const TARGET_NAMES = Object.keys(BACKEND_TARGETS);

/** Which target a URL corresponds to, for highlighting the active button. */
export function targetOf(url) {
  const u = String(url || '');
  if (customUrl && u === customUrl) return 'custom';
  if (u.startsWith(RENDER_API_URL)) return 'render';
  if (u === LOCAL_API_URL) return 'local';
  return 'lan';
}

/** Read the saved choice. Returns a target name or null (never throws). */
export async function loadSavedTarget() {
  const { getItem } = await import('../auth/secureStore');
  const v = await getItem(TARGET_KEY);
  return TARGET_NAMES.includes(v) ? v : null;
}

export async function saveTarget(name) {
  const { setItem } = await import('../auth/secureStore');
  await setItem(TARGET_KEY, name);
}

/**
 * On the web build the refresh-token cookie is SameSite, and the browser treats
 * "localhost" and "127.0.0.1" as DIFFERENT sites. So a preview served from
 * http://localhost:8081 talking to http://127.0.0.1:8000 will log in and then
 * lose the session on reload, for a reason nothing in the UI explains. Warn
 * instead of silently misbehaving.
 */
export function warnIfCookieHostMismatch(baseUrl) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const apiHost = new URL(baseUrl).hostname;
    const pageHost = window.location.hostname;
    if (apiHost === pageHost) return null;
    const msg =
      `[NiyamNetra] Page is on "${pageHost}" but the API is on "${apiHost}". ` +
      `The browser treats these as different sites, so the refresh cookie will ` +
      `not persist your session across reloads. Open the preview at ` +
      `http://${apiHost}:8081 (or pick a target whose host matches) to fix it.`;
    if (__DEV__) console.warn(msg);
    return msg;
  } catch {
    return null;
  }
}

