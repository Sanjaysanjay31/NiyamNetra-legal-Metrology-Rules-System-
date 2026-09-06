import React, { createContext, useContext, useState, useEffect } from 'react';
import { getItem, setItem, deleteItem } from './secureStore';
import { api, setAccessToken, applySavedBackend, onSessionExpired } from '../api/client';

const ACCESS_KEY = 'nn_access';

const AuthContext = createContext(null);

// Decode the (unverified, presentation-only) JWT payload. atob is missing on
// Hermes, and a malformed token must never crash startup — so manual base64
// fallback + try/catch, with an expiry check so a stale token reads logged-out.
function decodeRole(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    let json;
    if (typeof atob === 'function') {
      json = atob(padded);
    } else {
      // Minimal base64 decode for Hermes (ASCII JSON payload only).
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      let out = '';
      let i = 0;
      const clean = padded.replace(/[^A-Za-z0-9+/=]/g, '');
      while (i < clean.length) {
        const e1 = chars.indexOf(clean.charAt(i++));
        const e2 = chars.indexOf(clean.charAt(i++));
        const e3 = chars.indexOf(clean.charAt(i++));
        const e4 = chars.indexOf(clean.charAt(i++));
        const n = (e1 << 18) | (e2 << 12) | ((e3 & 63) << 6) | (e4 & 63);
        out += String.fromCharCode((n >> 16) & 255, (n >> 8) & 255, n & 255);
      }
      json = out.replace(/\0+$/, '');
    }
    const payload = JSON.parse(json);
    if (payload?.exp && payload.exp * 1000 < Date.now()) return null;
    return payload?.role ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // A second 401 (or a failed refresh) means the session is dead — the API
    // layer broadcasts it; drop role so the app routes back to Login.
    const off = onSessionExpired(() => {
      setRole(null);
      deleteItem(ACCESS_KEY);
    });
    (async () => {
      // try/finally guarantees isLoading is cleared even if storage or the
      // network call throws — otherwise the app hangs on a blank screen.
      try {
        // Restore the Local/LAN/Render choice BEFORE the first request, so a
        // saved target survives an app restart.
        await applySavedBackend();
        // Native has no cookie jar (the refresh cookie is web-only), so
        // silently rehydrate the last access token from SecureStore and set
        // the header before any screen renders. If it is expired the first
        // API call 401s and the interceptor routes to login — still safe.
        try {
          const saved = await getItem(ACCESS_KEY);
          if (saved) {
            setAccessToken(saved);
            const r = decodeRole(saved);
            if (r) {
              setRole(r);
              setIsLoading(false);
              // Best-effort refresh in the background to extend the session.
              api.post('/auth/refresh', undefined, { timeout: 30000 })
                .then(({ data }) => {
                  if (data?.access_token) {
                    setAccessToken(data.access_token);
                    setItem(ACCESS_KEY, data.access_token);
                    setRole(decodeRole(data.access_token));
                  }
                })
                .catch(() => {});
              return;
            }
          }
        } catch { /* fall through to refresh */ }
        // The refresh token is an httpOnly cookie set by POST /auth/login. On
        // the web build axios carries it automatically (withCredentials), so a
        // restarted tab resumes the session. On native there is no cookie jar,
        // so this call 401s and we fall through to the login screen — that is
        // the safe path, not an error.
        //
        // 30s timeout (was 4s): a Render free-tier service sleeps when idle
        // and the first request pays a 30-50s cold start. At 4s the very first
        // launch after idle always looked logged-out on a backend that was in
        // fact fine. The splash explains the wait (see App.js Splash).
        const { data } = await api.post('/auth/refresh', undefined, { timeout: 30000 });
        setAccessToken(data.access_token);
        setItem(ACCESS_KEY, data.access_token);
        // decode role from token payload without verification (presentation only)
        setRole(decodeRole(data.access_token));
      } catch {
        /* no valid session — fall through to the login screen */
      } finally {
        setIsLoading(false);
      }
    })();
    return off;
  }, []);

  const login = async (employee_id, password) => {
    const install_id = await getItem('nn_install_id') || undefined;
    const { data } = await api.post('/auth/login', { employee_id, password, install_id });
    setAccessToken(data.access_token);
    await setItem('nn_install_id', data.install_id);
    // Native session restore: the refresh cookie never reaches SecureStore
    // (httpOnly, web-only), so persist the access token for silent rehydrate
    // on boot (see the bootstrap effect above).
    await setItem(ACCESS_KEY, data.access_token);
    // The refresh token is only ever set as an httpOnly cookie by the server —
    // it is never written to SecureStore, which is the point of the cookie.
    setRole(decodeRole(data.access_token));
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    // nn_install_id is DEVICE identity, not session state — keep it so the
    // next login on this phone re-binds the same install record. Only the
    // in-memory token + role are cleared here (refresh cookie is cleared
    // server-side by /auth/logout).
    setAccessToken(null);
    await deleteItem(ACCESS_KEY);
    setRole(null);
  };

  return <AuthContext.Provider value={{ role, login, logout, isLoading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
