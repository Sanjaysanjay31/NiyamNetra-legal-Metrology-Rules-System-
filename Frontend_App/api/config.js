// ============================================================================
// NIYAMNETRA BACKEND CONFIGURATION (EDIT HERE BEFORE RUNNING)
// ============================================================================
// 1. Target mode: 'lan' for local laptop on Wi-Fi, or 'render' for cloud backend
export const ACTIVE_BACKEND = 'lan'; // 'lan' | 'render'

// 2. Your Laptop Wi-Fi IPv4 Address (find by running `ipconfig` in terminal)
// NOTE: this laptop has VMware adapters too (192.168.32.1 / 192.168.52.1) — the
// Wi-Fi adapter is the one to use, and it CHANGES with every network, so re-run
// `ipconfig` after switching Wi-Fi and update this line.
export const LAPTOP_WIFI_IP = '192.168.101.72';

// 3. Backend port
export const API_PORT = 8000;

// 4. Render Cloud Deployed Backend URL (no trailing slash)
export const RENDER_API_URL = 'https://niyamnetra-backend.onrender.com';
// ============================================================================

import { Platform, NativeModules } from 'react-native';

export const EVIDENCE_MIN_FREE_GB = 5;
export const EVIDENCE_MIN_FREE_BYTES = EVIDENCE_MIN_FREE_GB * 1024 ** 3;
export const LOCAL_API_URL = 'http://127.0.0.1:8000';

// ---------------------------------------------------------------------------
// Screen capture / recording policy for the field app.
// ---------------------------------------------------------------------------
// true  = screenshots and screen recording always work (the SIH demo is
//         recorded, so this is the shipping setting). Nothing in the app sets
//         Android FLAG_SECURE while this is true — see
//         hooks/useAllowScreenCapture.js and plugins/withAllowScreenCapture.js.
// false = deliberate opt-in to blocking capture: on Android the app would be
//         recorded as a black screen and OEM recorders show "cannot record due
//         to security reasons". Never set this for a demo build.
export const ALLOW_SCREEN_CAPTURE = true;

// Host resolution for LAN mode
function resolveHost() {
  if (Platform.OS === 'web') {
    return (typeof window !== 'undefined' && window.location && window.location.hostname) || '127.0.0.1';
  }
  return LAPTOP_WIFI_IP;
}

export function resolveApiBaseUrl() {
  // If EXPO_PUBLIC_API_BASE_URL is set in .env or eas.json, it takes highest precedence
  const explicit = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  // In production / standalone APK release builds, default to cloud Render backend
  // In development mode (__DEV__), default according to ACTIVE_BACKEND ('lan' on Wi-Fi)
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  if (!isDev || ACTIVE_BACKEND === 'render') {
    return RENDER_API_URL;
  }

  // LAN mode (dev): use LAPTOP_WIFI_IP for phone, 127.0.0.1 for local web preview
  const host = resolveHost();
  return `http://${host}:${API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

// ---------------------------------------------------------------------------
// Runtime target resolution & storage helpers (keeps backward compatibility)
const CUSTOM_KEY = 'nn_backend_custom';
let customUrl = null;

export function normalizeBackendUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  const m = /^(https?):\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9][A-Za-z0-9.\-]*)(?::(\d+))?/i.exec(s);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const host = m[2];
  if (/\.$|\.\./.test(host)) return null;
  if (m[3] !== undefined) {
    const n = Number(m[3]);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  }
  const port = m[3] || (scheme === 'https' ? '' : String(API_PORT));
  return `${scheme}://${host}${port ? `:${port}` : ''}`;
}

export const getCustomUrl = () => customUrl;

export async function loadCustomUrl() {
  try {
    const { getItem } = await import('../auth/secureStore');
    customUrl = normalizeBackendUrl(await getItem(CUSTOM_KEY));
  } catch { customUrl = null; }
  return customUrl;
}

export async function saveCustomUrl(input) {
  const url = normalizeBackendUrl(input);
  if (!url) return null;
  customUrl = url;
  try {
    const { setItem } = await import('../auth/secureStore');
    await setItem(CUSTOM_KEY, url);
  } catch { /* session fallback */ }
  return url;
}

export const BACKEND_TARGETS = {
  lan: {
    label: 'Wi-Fi (Laptop)',
    hint: 'Local server on Wi-Fi',
    resolve: () => `http://${resolveHost()}:${API_PORT}`,
  },
  render: {
    label: 'Cloud (Render)',
    hint: 'Deployed Render cloud',
    resolve: () => RENDER_API_URL,
  },
  local: {
    label: 'Local (This PC)',
    hint: 'Localhost on this device',
    resolve: () => LOCAL_API_URL,
  },
  custom: {
    label: 'Custom URL',
    hint: 'User-provided backend address',
    resolve: () => customUrl || `http://${resolveHost()}:${API_PORT}`,
  },
};

const TARGET_KEY = 'nn_backend_target';
export const TARGET_NAMES = ['lan', 'render', 'local', 'custom'];

export function targetOf(url) {
  const u = String(url || '');
  if (u.startsWith(RENDER_API_URL)) return 'render';
  if (u.startsWith(LOCAL_API_URL)) return 'local';
  if (customUrl && u.startsWith(customUrl)) return 'custom';
  return 'lan';
}

export async function loadSavedTarget() {
  // The backend is PINNED to ACTIVE_BACKEND (top of this file). The on-screen
  // server-target switcher was removed from the login screen, so a stale
  // 'lan' choice saved on a phone must never silently take over the URL.
  // Point ACTIVE_BACKEND at 'lan' to test against a laptop backend again.
  return ACTIVE_BACKEND;
}

export async function saveTarget(name) {
  const { setItem } = await import('../auth/secureStore');
  await setItem(TARGET_KEY, name);
}

export function warnIfCookieHostMismatch(baseUrl) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const apiHost = new URL(baseUrl).hostname;
    const pageHost = window.location.hostname;
    if (apiHost === pageHost) return null;
    return `[NiyamNetra] Page is on "${pageHost}" but API is on "${apiHost}".`;
  } catch {
    return null;
  }
}
