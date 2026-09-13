/**
 * Shared hooks, in one file.
 *
 * The most important one is `useResource`. It exists because fourteen screens
 * each needed the same four pieces of state, and because the demo fallback has
 * to be implemented once, in one place, with the "Demo data" chip attached to
 * the same state that made the substitution. If a screen could opt into fixture
 * data without also surfacing the chip, an illustrative figure would eventually
 * be read as an inspection record - which 08 SS4.1 forbids outright.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ---------------------------------------------------------------- motion --- */

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = (e) => setReduced(e.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

/* -------------------------------------------------------------- connection -- */

/**
 * `navigator.onLine` is famously optimistic: it reports true for a device
 * attached to a wifi network with no route to the internet, which is exactly the
 * situation in a market with a captive portal. So the value here is treated as a
 * hint and corrected by request outcomes - a failed request marks us offline,
 * and the browser's own `online` event or a successful request marks us back.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/* ---------------------------------------------------------------- fetching -- */

/**
 * @param fetcher  async () => data. Must be stable or listed in `deps`.
 * @param options  { deps, enabled, label }
 *
 * Returns { data, error, loading, demo: false, reload }.
 */
export function useResource(fetcher, { deps = [], enabled = true, label } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled, demo: false })
  const [nonce, setNonce] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setState({ data: undefined, error: null, loading: false, demo: false })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    ;(async () => {
      try {
        const data = await fetcher()
        if (cancelled || !alive.current) return
        setState({ data, error: null, loading: false, demo: false })
      } catch (err) {
        if (cancelled || !alive.current) return
        setState({ data: undefined, error: err, loading: false, demo: false })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}

/** A mutation with its own pending and error state, so a form can disable itself. */
export function useMutation(fn) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)

  const run = useCallback(
    async (...args) => {
      setPending(true)
      setError(null)
      try {
        return await fn(...args)
      } catch (err) {
        setError(err)
        throw err
      } finally {
        setPending(false)
      }
    },
    [fn]
  )

  return { run, pending, error, fieldErrors: error?.fields ?? null, reset: () => setError(null) }
}

/* ------------------------------------------------------------------ misc ---- */

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · NiyamNetra` : 'NiyamNetra Portal'
  }, [title])
}

/** Close on outside click. Used by the header's user menu. */
export function useDismissOnOutside(ref, onDismiss, active = true) {
  useEffect(() => {
    if (!active) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onDismiss()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, onDismiss, active])
}

/**
 * A persisted preference. Only ever used for display choices - a collapsed rail,
 * a chosen tab, a table density. Never for a token, a role or a finding.
 */
export function useLocalPref(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(`nn.${key}`)
      return raw === null ? initial : JSON.parse(raw)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(`nn.${key}`, JSON.stringify(value))
    } catch {
      /* preference will not persist; nothing else breaks */
    }
  }, [key, value])
  return [value, setValue]
}

/** Sort state for a table column, with the direction toggling on re-click. */
export function useSort(initialKey, initialDir = 'asc') {
  const [sort, setSort] = useState({ key: initialKey, dir: initialDir })
  const toggle = useCallback((key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }, [])
  const compare = useMemo(() => {
    const { key, dir } = sort
    const sign = dir === 'asc' ? 1 : -1
    return (a, b) => {
      const av = a?.[key]
      const bv = b?.[key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * sign
    }
  }, [sort])
  return { sort, toggle, compare }
}
