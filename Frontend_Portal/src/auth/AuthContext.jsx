/**
 * Authentication: the provider, the hook and the two route guards, together.
 *
 * The access token is held in React state and mirrored into the API client's
 * module variable. It is deliberately not persisted. The cost of that choice is
 * one extra request on every page load - the refresh below - and the benefit is
 * that a stolen bundle, a shared browser profile or an XSS payload has nothing
 * durable to take.
 *
 * `booting` exists to solve a specific and very visible bug: on a hard reload
 * the token is gone for a moment while the refresh is in flight. If the guards
 * treat "no token" as "not signed in", every reload bounces the officer to the
 * login screen and back. So the guards render nothing decisive until the one
 * mount-time refresh resolves.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { endpoints, setAccessToken, setSessionLostHandler } from '../api/client'
import { Callout, Spinner } from '../ui'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [installId, setInstallId] = useState(null)
  const [booting, setBooting] = useState(true)
  const [sessionEnded, setSessionEnded] = useState(false)
  const refreshTimer = useRef(null)
  /* True only during the initial mount-time refresh. A 401 there is the normal
     case for a first-time visitor (no refresh cookie yet) and must not raise
     the session-ended banner; only user-initiated or post-login refresh
     failures broadcast. */
  const mountingRef = useRef(true)

  const clear = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setInstallId(null)
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }, [])

  /* Refresh shortly before the access token expires, rather than waiting for a
     401. An officer who has been reading a findings list for an hour should not
     have their first click fail and retry - it looks like a flaky product even
     though the retry succeeds. 60s of headroom for clock skew and latency. */
  const scheduleRefresh = useCallback((expiresIn) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    const ms = Math.max((expiresIn ?? 3600) - 60, 30) * 1000
    refreshTimer.current = setTimeout(async () => {
      try {
        const data = await endpoints.auth.refresh()
        setAccessToken(data.access_token)
        setUser(data.user)
        scheduleRefresh(data.expires_in)
      } catch {
        clear()
        setSessionEnded(true)
      }
    }, ms)
  }, [clear])

  useEffect(() => {
    setSessionLostHandler(() => {
      /* Suppress the banner for the initial mount refresh attempt: a 401
         there means "never signed in", not "signed out from under you". */
      if (mountingRef.current) return
      clear()
      setSessionEnded(true)
    })
  }, [clear])

  /* One refresh on mount. A 401 here is the normal case for a first-time
     visitor and is not an error worth surfacing. */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await endpoints.auth.refresh()
        if (!alive) return
        setAccessToken(data.access_token)
        setUser(data.user)
        setInstallId(data.install_id)
        scheduleRefresh(data.expires_in)
      } catch {
        /* no valid refresh cookie: not signed in */
      } finally {
        mountingRef.current = false
        if (alive) setBooting(false)
      }
    })()
    return () => {
      alive = false
      mountingRef.current = false
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [scheduleRefresh])

  const login = useCallback(
    async (employeeId, password) => {
      const data = await endpoints.auth.login(employeeId, password)
      setAccessToken(data.access_token)
      setUser(data.user)
      setInstallId(data.install_id)
      setSessionEnded(false)
      scheduleRefresh(data.expires_in)
      return data.user
    },
    [scheduleRefresh]
  )

  const logout = useCallback(async () => {
    try {
      await endpoints.auth.logout()
    } catch {
      /* Clearing locally matters more than the server acknowledging it. */
    }
    clear()
    setSessionEnded(false)
  }, [clear])

  const value = useMemo(
    () => ({
      user,
      installId,
      booting,
      sessionEnded,
      dismissSessionEnded: () => setSessionEnded(false),
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      login,
      logout,
    }),
    [user, installId, booting, sessionEnded, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                      */
/* -------------------------------------------------------------------------- */

function BootScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={24} label="Restoring your session" />
        <p className="nn-eyebrow">Restoring session</p>
      </div>
    </div>
  )
}

export function ProtectedRoute({ children }) {
  const { isAuthenticated, booting } = useAuth()
  const location = useLocation()
  if (booting) return <BootScreen />
  if (!isAuthenticated) {
    /* `from` is carried so that after signing in the officer lands where they
       were going, not on a generic home screen. */
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}

/**
 * Admin-only. Renders a stated refusal rather than redirecting silently: an
 * inspector who followed a link to an admin page should be told the page exists
 * and is not theirs, not bounced somewhere else with no explanation.
 */
export function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, booting } = useAuth()
  const location = useLocation()
  if (booting) return <BootScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-[560px] p-6">
        <Callout family="review" title="This section is for administrator accounts">
          Your account is signed in as an inspector. Section access is a property of the
          account and is decided by the server; nothing on this device changes it. If you
          need access, ask an administrator to update your role.
        </Callout>
      </div>
    )
  }
  return children
}

/** The reverse guard: a signed-in officer should not see the login screen. */
export function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isAdmin, booting } = useAuth()
  if (booting) return <BootScreen />
  if (isAuthenticated) return <Navigate to={isAdmin ? '/admin' : '/inspector'} replace />
  return children
}
