/**
 * The API client and the endpoint map, in one file.
 *
 * Two things about this file are load-bearing and should not be "simplified":
 *
 * 1. The access token lives in a module variable, set by AuthContext. It is
 *    never written to localStorage or sessionStorage. The refresh token is an
 *    httpOnly SameSite=Strict cookie that no JavaScript here can read, which is
 *    the entire point of the arrangement: an XSS in this bundle cannot walk away
 *    with a durable session.
 *
 * 2. There is exactly one refresh in flight at a time. When six requests fire
 *    on a dashboard mount and all six get 401, they await the *same* promise and
 *    then replay. Without the shared promise you get six concurrent refreshes,
 *    and because the backend rotates refresh tokens single-use, five of them
 *    fail and log the officer out mid-inspection. That bug is subtle, rare in
 *    development and constant on a slow connection.
 */

import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const DEMO_DATA = false

/* ---------------------------------------------------------------- token ---- */

let accessToken = null
let onSessionLost = null

export function setAccessToken(token) {
  accessToken = token ?? null
}
export function getAccessToken() {
  return accessToken
}
/** AuthContext registers a callback so a dead session clears the UI once. */
export function setSessionLostHandler(fn) {
  onSessionLost = fn
}

/* --------------------------------------------------------------- client ---- */

export const api = axios.create({
  baseURL: BASE,
  timeout: 20000,
  /* Sends the refresh cookie. Required on /auth/* and harmless elsewhere. */
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

/** Requests that must never trigger a refresh, or we recurse. */
const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/logout']

let refreshPromise = null

async function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then((r) => {
        setAccessToken(r.data.access_token)
        return r.data
      })
      .finally(() => {
        /* Cleared in `finally`, not in `then`: if it is only cleared on success
           a single network blip leaves a permanently rejected promise cached
           and every later request fails against it. */
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { response, config } = error
    if (!response || !config) return Promise.reject(normalise(error))

    const isAuthPath = NO_REFRESH.some((p) => (config.url ?? '').includes(p))
    if (response.status !== 401 || isAuthPath || config.__retried) {
      if (response.status === 401 && (isAuthPath || config.__retried)) {
        /* Second failure. The session is genuinely gone. */
        setAccessToken(null)
        onSessionLost?.()
      }
      return Promise.reject(normalise(error))
    }

    try {
      await refreshOnce()
    } catch {
      setAccessToken(null)
      onSessionLost?.()
      return Promise.reject(normalise(error))
    }

    config.__retried = true
    config.headers = { ...config.headers, Authorization: `Bearer ${accessToken}` }
    return api.request(config)
  }
)

/**
 * One error shape for the whole app, so no screen has to know that FastAPI puts
 * a string in `detail` sometimes and a list of validation objects other times.
 */
export class ApiError extends Error {
  constructor({ message, status, code, fields, offline }) {
    super(message)
    this.name = 'ApiError'
    this.status = status ?? 0
    this.code = code ?? null
    this.fields = fields ?? null
    this.offline = Boolean(offline)
  }
}

function normalise(error) {
  if (error instanceof ApiError) return error

  if (!error.response) {
    return new ApiError({
      message:
        error.code === 'ECONNABORTED'
          ? 'The request timed out. The connection may be slow.'
          : 'Could not reach the server. Work is saved on this device and will sync when the connection returns.',
      status: 0,
      offline: true,
    })
  }

  const { status, data } = error.response
  const detail = data?.detail

  /* 422: FastAPI's validation array. Flattened to field -> message so a form
     can put each message beside its own input rather than dumping JSON. */
  if (status === 422 && Array.isArray(detail)) {
    const fields = {}
    for (const d of detail) {
      const key = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : 'form'
      fields[key] = d.msg
    }
    return new ApiError({
      message: 'Some entries need correcting.',
      status,
      fields,
    })
  }

  const generic = {
    400: 'The request was not accepted.',
    401: 'Your session has ended. Sign in again.',
    403: 'Your account does not have access to this.',
    404: 'Not found.',
    409: 'That conflicts with an existing record.',
    413: 'The file is too large.',
    429: 'Too many attempts. Wait a moment and try again.',
    500: 'The server could not complete this. Nothing was recorded.',
    503: 'The service is temporarily unavailable.',
  }

  return new ApiError({
    message:
      (typeof detail === 'string' && detail) ||
      data?.message ||
      generic[status] ||
      `Request failed (${status}).`,
    status,
    code: data?.code,
  })
}

const unwrap = (p) => p.then((r) => r.data)

/* ------------------------------------------------------------ endpoints ---- */

/**
 * Every path the portal calls, in one object. Paths appear here and nowhere
 * else, so a backend rename is one edit rather than a grep across fourteen
 * screens. Mirrored from Backend/routers/*.
 *
 * Note: authentication is by **employee ID**, not email. 08 SS4.1 describes an
 * email field; the backend's LoginRequest takes `employee_id`, and a Legal
 * Metrology officer has an employee number where they may not have a work
 * mailbox. The contract wins. Flagged rather than silently reconciled.
 */
export const endpoints = {
  auth: {
    login: (employee_id, password) =>
      unwrap(api.post('/auth/login', { employee_id, password })),
    refresh: () => unwrap(api.post('/auth/refresh')),
    logout: () => unwrap(api.post('/auth/logout')),
    me: () => unwrap(api.get('/auth/me')),
    changePassword: (old_password, new_password) =>
      unwrap(api.post('/auth/change-password', { old_password, new_password })),
  },

  inspections: {
    stores: (params) => unwrap(api.get('/stores', { params })),
    list: (params) => unwrap(api.get('/inspections', { params })),
    get: (id) => unwrap(api.get(`/inspections/${id}`)),
    create: (body) => unwrap(api.post('/inspections', body)),
    submit: (id, body) => unwrap(api.post(`/inspections/${id}/submit`, body)),
    createScan: (id, body) => unwrap(api.post(`/inspections/${id}/scans`, body)),
  },

  scans: {
    list: (params) => unwrap(api.get('/scans', { params })),
    get: (id) => unwrap(api.get(`/scans/${id}`)),
    verify: (id) => unwrap(api.get(`/scans/${id}/verify`)),
    assess: (id, body) => unwrap(api.post(`/scans/${id}/assess`, body ?? {})),
    /* multipart: the browser must set its own boundary, so the JSON default
       Content-Type is removed rather than overwritten. */
    uploadImage: (id, file, panel, onProgress) => {
      const form = new FormData()
      form.append('file', file)
      form.append('panel', panel)
      return unwrap(
        api.post(`/scans/${id}/images`, form, {
          headers: { 'Content-Type': undefined },
          timeout: 60000,
          onUploadProgress: onProgress
            ? (e) => onProgress(e.total ? e.loaded / e.total : 0)
            : undefined,
        })
      )
    },
  },

  reports: {
    today: (params) => unwrap(api.get('/reports/today', { params })),
    calendar: (params) => unwrap(api.get('/reports/calendar', { params })),
    /* Blobs, not JSON. The caller creates the object URL and revokes it.
       /reports/today* is scoped to the caller's own user id even for an admin —
       routers/reports.py depends on require_inspector, which admits an admin but
       still filters on `user.id`. There is no parameter that widens it. */
    todayDocx: (params) =>
      api.get('/reports/today.docx', { params, responseType: 'blob' }).then((r) => r.data),
    todayPdf: (params) =>
      api.get('/reports/today.pdf', { params, responseType: 'blob' }).then((r) => r.data),
    /* Spreadsheet exports of the same daily report — one finding per row, for
       sorting/filtering/pivoting. Same auth scope as todayPdf/todayDocx. */
    todayXlsx: (params) =>
      api.get('/reports/today.xlsx', { params, responseType: 'blob' }).then((r) => r.data),
    todayCsv: (params) =>
      api.get('/reports/today.csv', { params, responseType: 'blob' }).then((r) => r.data),
    /* Range reports — one document for a month-of-work. Uses /reports/range.{fmt}
       where fmt is pdf|docx|xlsx|csv. These are the office-wide range documents
       that cover multiple inspectors (routers/reports.py:350-412). */
    rangePdf: (params) =>
      api.get('/reports/range.pdf', { params, responseType: 'blob' }).then((r) => r.data),
    rangeDocx: (params) =>
      api.get('/reports/range.docx', { params, responseType: 'blob' }).then((r) => r.data),
    rangeXlsx: (params) =>
      api.get('/reports/range.xlsx', { params, responseType: 'blob' }).then((r) => r.data),
    rangeCsv: (params) =>
      api.get('/reports/range.csv', { params, responseType: 'blob' }).then((r) => r.data),
    /* Per-inspection documents. These use get_current_user, not
       require_inspector, and check ownership themselves: an inspector may only
       fetch their own, an admin may fetch any. This is the only document route
       that can cover another officer's work (routers/reports.py:126-161). */
    inspectionDocx: (id) =>
      api
        .get(`/reports/inspections/${id}/docx`, { responseType: 'blob' })
        .then((r) => r.data),
    inspectionPdf: (id) =>
      api.get(`/reports/inspections/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
    inspectionXlsx: (id) =>
      api.get(`/reports/inspections/${id}/xlsx`, { responseType: 'blob' }).then((r) => r.data),
    inspectionCsv: (id) =>
      api.get(`/reports/inspections/${id}/csv`, { responseType: 'blob' }).then((r) => r.data),
  },

  admin: {
    dashboard: (params) => unwrap(api.get('/admin/dashboard', { params })),
    users: () => unwrap(api.get('/admin/users')),
    createUser: (body) => unwrap(api.post('/admin/users', body)),
    updateUser: (id, body) => unwrap(api.patch(`/admin/users/${id}`, body)),
    /* POST /admin/users/{id}/reset-install requires ResetInstallRequest.reason,
       10-500 characters (routers/admin.py:100). Sending no body returns 422, so
       the reason is a required argument here rather than an optional one. */
    resetInstall: (id, reason) =>
      unwrap(api.post(`/admin/users/${id}/reset-install`, { reason })),
    /* GET /admin/review-queue takes no parameters and returns {count: n}. The
       params argument is kept because the shell passes one; FastAPI ignores it. */
    reviewQueue: (params) => unwrap(api.get('/admin/review-queue', { params })),
    updateFinding: (findingId, body) =>
      unwrap(api.patch(`/admin/findings/${findingId}`, body)),
    audit: (params) => unwrap(api.get('/admin/audit', { params })),
    rules: () => unwrap(api.get('/admin/rules')),
  },

  health: () => unwrap(api.get('/health')),
}

/**
 * Download a blob the browser will not render inline. Kept here so no screen
 * hand-rolls object-URL lifecycle and leaks one per click.
 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
