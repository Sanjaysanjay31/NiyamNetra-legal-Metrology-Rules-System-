import axios from 'axios';
import { API_BASE_URL, BACKEND_TARGETS, getCustomUrl, loadCustomUrl, loadSavedTarget, saveCustomUrl, saveTarget, targetOf, warnIfCookieHostMismatch } from './config';

let accessToken = null;
export const setAccessToken = (t) => { accessToken = t; };

// Last cookie-host mismatch warning (web only), refreshed whenever the target
// changes. The login screen reads it so the trap is visible in the UI instead
// of only in the console — see warnIfCookieHostMismatch in ./config.
let cookieWarning = null;
export const getCookieWarning = () => cookieWarning;

// Dependency-free idempotency-key generator. Earlier this file did
// `await import('react-native-uuid')` — a package that is neither installed
// nor declared in package.json, so the dynamic import threw and *every* POST/
// PATCH/PUT rejected before it left the device. (The uuid value wasn't even
// used.) A UUID v4 built from Math.random needs no dependency and is more than
// enough for a de-duplication token.
function idempotencyKey() {
  return 'nn-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const api = axios.create({
  baseURL: API_BASE_URL,          // resolved in api/config.js — do not hardcode here
  // 30s, not 15s: a Render free-tier service is spun down when idle and the
  // first request after that pays a 30-50s cold start. At 15s the very first
  // login of a demo failed with "cannot reach the backend" on a backend that
  // was in fact fine. Session restore does NOT use this default — it passes
  // timeout: 4000, because that one request gates the splash screen.
  timeout: 30000,
  // The refresh token is an httpOnly cookie. On the web build the browser only
  // stores and sends it when the request is credentialed, so without this the
  // Expo web preview logs in and then loses the session on every reload and on
  // every silent 401 refresh. Ignored by React Native's networking on device,
  // so it is safe to set unconditionally.
  withCredentials: true,
});

// Point the app at a different backend at runtime (handy when testing on a
// phone without rebuilding). Returns the URL now in force.
export function setApiBaseUrl(url) {
  api.defaults.baseURL = String(url || '').trim().replace(/\/+$/, '');
  return api.defaults.baseURL;
}
export const getApiBaseUrl = () => api.defaults.baseURL;

/** The saved custom address, or null — so the login screen can pre-fill it. */
export const getSavedCustomUrl = () => getCustomUrl();

/** 'local' | 'render' — which backend requests are currently going to. */
export const getBackendTarget = () => targetOf(api.defaults.baseURL);

/** Switch backend and remember the choice for the next launch.
 *  For 'custom', pass the typed address as the second argument; it is
 *  validated and persisted before the switch, and rejected (no-op) if it
 *  cannot be turned into a URL. */
export async function switchBackend(name, url) {
  const t = BACKEND_TARGETS[name];
  if (!t) return getApiBaseUrl();
  if (name === 'custom' && url !== undefined) {
    const saved = await saveCustomUrl(url);
    if (!saved) return getApiBaseUrl();      // unusable input, stay put
  }
  const next = setApiBaseUrl(t.resolve());
  await saveTarget(name);
  cookieWarning = warnIfCookieHostMismatch(next);
  if (__DEV__) console.log('[NiyamNetra] backend →', name, next);
  return next;
}

/**
 * Re-apply the saved target on boot. Called once from AuthContext before the
 * session-restore request, so a saved target survives a restart.
 * Never throws: a storage failure just leaves the env/auto-detected URL.
 */
export async function applySavedBackend() {
  try {
    // Custom URL first: the 'custom' target's resolve() reads this cache, so
    // hydrating it after the switch would resolve to the LAN fallback instead.
    await loadCustomUrl();
    const saved = await loadSavedTarget();
    if (saved && BACKEND_TARGETS[saved]) setApiBaseUrl(BACKEND_TARGETS[saved].resolve());
  } catch { /* keep the resolved default */ }
  cookieWarning = warnIfCookieHostMismatch(getApiBaseUrl());
  return getApiBaseUrl();
}

// One line in the Metro/browser console confirming where requests are going —
// the fastest way to tell "wrong URL" apart from "backend not running".
if (__DEV__) console.log('[NiyamNetra] API base URL =', api.defaults.baseURL);

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  // Idempotency-Key for every write 11 §2.4
  if (['post', 'patch', 'put'].includes(cfg.method)) {
    cfg.headers['Idempotency-Key'] = cfg.headers['Idempotency-Key'] || idempotencyKey();
  }
  return cfg;
});

let refreshing = null;
api.interceptors.response.use(null, async (err) => {
  const orig = err.config;
  if (err.response?.status === 401 && !orig._retried) {
    if (!refreshing) {
      refreshing = api.post('/auth/refresh').then(r => {
        setAccessToken(r.data.access_token);
        return r.data.access_token;
      }).catch(e => { throw e; }).finally(() => { refreshing = null; });
    }
    try {
      const tok = await refreshing;
      orig._retried = true;
      orig.headers.Authorization = `Bearer ${tok}`;
      return api(orig);
    } catch {
      // route to login handled by AuthContext
    }
  }
  return Promise.reject(err);
});
