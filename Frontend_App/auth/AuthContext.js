import React, { createContext, useContext, useState, useEffect } from 'react';
import { getItem, setItem, deleteItem } from './secureStore';
import { api, setAccessToken, applySavedBackend } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // try/finally guarantees isLoading is cleared even if storage or the
      // network call throws — otherwise the app hangs on a blank screen.
      try {
        // Restore the Local/LAN/Render choice BEFORE the first request, so a
        // saved target survives an app restart.
        await applySavedBackend();
        // The refresh token is an httpOnly cookie set by POST /auth/login. On
        // the web build axios carries it automatically (withCredentials), so a
        // restarted tab resumes the session. On native there is no cookie jar,
        // so this call 401s and we fall through to the login screen — that is
        // the safe path, not an error.
        //
        // Short timeout on purpose: this request gates the splash screen, and
        // the client default of 15s meant a backend that is simply not running
        // held the app on a blank screen for 15 seconds with no explanation.
        const { data } = await api.post('/auth/refresh', undefined, { timeout: 4000 });
        setAccessToken(data.access_token);
        // decode role from token payload without verification (presentation only)
        const payload = JSON.parse(atob(data.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        setRole(payload.role);
      } catch {
        /* no valid session — fall through to the login screen */
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (employee_id, password) => {
    const install_id = await getItem('nn_install_id') || undefined;
    const { data } = await api.post('/auth/login', { employee_id, password, install_id });
    setAccessToken(data.access_token);
    await setItem('nn_install_id', data.install_id);
    // The refresh token is only ever set as an httpOnly cookie by the server —
    // it is never written to SecureStore, which is the point of the cookie.
    const payload = JSON.parse(atob(data.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    setRole(payload.role);
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    setAccessToken(null);
    await deleteItem('nn_refresh');
    await deleteItem('nn_install_id');
    setRole(null);
  };

  return <AuthContext.Provider value={{ role, login, logout, isLoading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
