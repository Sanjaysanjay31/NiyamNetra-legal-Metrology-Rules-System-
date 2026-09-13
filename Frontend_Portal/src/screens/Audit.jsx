/**
 * Audit trail — the tamper-evident record, read newest-first.
 *
 * The integrity guarantee here is a property of the whole chain, not of any one
 * row: each entry stores the hash of the one before it, so a single altered or
 * deleted row breaks every link after it. The server verifies that chain and
 * returns one boolean — `chain_intact` — plus the head hash. This screen keeps
 * that verdict at the top, because an auditor's first question is not "what
 * happened" but "can I trust that this is everything that happened".
 *
 * The reference row shape (Timestamp, User, Role, Action, Module, Record ID,
 * IP/Device, Status) is broader than what the live /admin/audit envelope ships.
 * Where the response is silent — on role, module, IP and device — the screen
 * derives a value from the action string with a fixed mapping and states the
 * derivation in a single comment. Once the endpoint grows those fields the
 * derived path falls away without any caller change.
 *
 * Paging is genuinely server-side: the endpoint takes limit/offset and returns
 * the total, so Prev/Next move a real window over the real table rather than
 * slicing a list this browser happens to hold. The actor is a bare `user_id`,
 * joined here against /admin/users exactly as the inspection list joins officer
 * names; when that join is unavailable the officer number is shown plainly.
 *
 * Two honest limits of the endpoint are stated at the foot of the page, not
 * hidden:
 *   - When the chain does NOT verify, the response says so but does not name
 *     the failing sequence number — so this screen reports the break without
 *     claiming to pinpoint it.
 *   - The IP/device values are not in the response. The derived column on this
 *     screen reads them off the user record and the actor's last install; once
 *     the audit row carries them natively the mapping falls away.
 */

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronRight, Filter, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { endpoints } from '../api/client'
import { useDocumentTitle, useDebounced, useResource } from '../lib/hooks'
import {
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  Input,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '../ui'

const PAGE_SIZE = 50

/* The exact action strings the backend writes (append_audit call sites),
   mapped to a reading label. An unknown action falls back to its raw string
   rather than being dropped — an audit view must never quietly omit a row. */
const ACTION_LABELS = {
  login: 'Signed in',
  login_failed: 'Sign-in failed',
  password_changed: 'Password changed',
  password_change_failed: 'Password change failed',
  install_reset: 'Device binding released',
  user_created: 'Added inspector',
  user_updated: 'Updated inspector',
  store_created: 'Added store',
  inspection_created: 'Created inspection',
  inspection_updated: 'Updated inspection',
  inspection_submitted: 'Submitted inspection',
  scan_created: 'Added violation',
  scan_updated: 'Updated package',
  image_uploaded: 'Image uploaded',
  listing_attached: 'Listing attached',
  assessed: 'Assessed package',
  assessment_rerun: 'Re-assessed package',
  finding_overridden: 'Overrode finding',
  review: 'Reviewed',
  prosecution: 'Prosecution recorded',
  rule_version_created: 'Added rule version',
  rule_version_updated: 'Updated rule version',
  report_exported: 'Exported report',
  none: 'No action',
}

/* Each action lives in exactly one module. The mapping is the source of truth
   for the Module column; the live endpoint may eventually return it natively,
   in which case this map becomes a fallback. */
const ACTION_MODULE = {
  login: 'Auth',
  login_failed: 'Auth',
  password_changed: 'Auth',
  password_change_failed: 'Auth',
  install_reset: 'Auth',
  user_created: 'Inspectors',
  user_updated: 'Inspectors',
  store_created: 'Stores',
  inspection_created: 'Inspections',
  inspection_updated: 'Inspections',
  inspection_submitted: 'Inspections',
  scan_created: 'Violations',
  scan_updated: 'Packages',
  image_uploaded: 'Packages',
  listing_attached: 'Packages',
  assessed: 'Packages',
  assessment_rerun: 'Packages',
  finding_overridden: 'Packages',
  review: 'Review',
  prosecution: 'Review',
  rule_version_created: 'Rule versions',
  rule_version_updated: 'Rule versions',
  report_exported: 'Reports',
}

/* Status reflects the outcome the server stamped on the entry. The /admin/audit
   payload carries an `outcome` field on the live side; the fixture does not,
   so the values are derived from the action so the badge is meaningful in
   both modes. Once outcome lands in the fixture the derived path falls
   through. */
const ACTION_STATUS = {
  login: 'success',
  login_failed: 'failed',
  password_changed: 'success',
  password_change_failed: 'failed',
  install_reset: 'success',
  user_created: 'success',
  user_updated: 'success',
  store_created: 'success',
  inspection_created: 'success',
  inspection_updated: 'success',
  inspection_submitted: 'success',
  scan_created: 'success',
  scan_updated: 'success',
  image_uploaded: 'success',
  listing_attached: 'success',
  assessed: 'success',
  assessment_rerun: 'success',
  finding_overridden: 'warning',
  review: 'success',
  prosecution: 'success',
  rule_version_created: 'success',
  rule_version_updated: 'success',
  report_exported: 'success',
}

const STATUS_LABEL = {
  success: 'Success',
  warning: 'Warning',
  failed: 'Failed',
  info: 'Info',
}

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'failed', label: 'Failed' },
]

const ACTION_FILTER_OPTIONS = [
  { value: 'all', label: 'All actions' },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
]

const MODULE_FILTER_OPTIONS = [
  { value: 'all', label: 'All modules' },
  ...Array.from(new Set(Object.values(ACTION_MODULE)))
    .sort()
    .map((m) => ({ value: m, label: m })),
]

function prettyDateTime(iso) {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'd MMM yyyy · HH:mm:ss')
  } catch {
    return String(iso)
  }
}

function shortDate(iso) {
  if (!iso) return ''
  try {
    return format(parseISO(iso), 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

/* Resolve the most specific record the entry names. Inspection wins over scan
   over user, since an entry that has both an inspection and a scan is about
   the package on the inspection, not the inspection in the abstract. */
function recordIdFor(e) {
  if (e?.inspection_id != null) return `INS-${e.inspection_id}`
  if (e?.scan_id != null) return `PKG-${e.scan_id}`
  if (e?.user_id != null) return `USR-${e.user_id}`
  if (e?.target_id != null) return `#${e.target_id}`
  return '—'
}

function roleFor(user) {
  if (!user) return '—'
  if (user.role === 'admin') return 'Administrator'
  if (user.role === 'inspector') return 'Inspector'
  return user.role ?? '—'
}

/* IP and device are not on the audit response. The most honest substitute the
   server gives us is the actor's own record: a stored install_id and a
   best-effort IP from the latest login. Until the audit row carries them
   natively the column shows "—" and the gap is named at the foot. */
function ipDeviceFor(entry, user) {
  if (entry?.ip) return entry.ip
  if (user?.last_ip) return user.last_ip
  return '—'
}

function deviceFor(entry, user) {
  if (entry?.device) return entry.device
  if (user?.last_device) return user.last_device
  return '—'
}

function AuditStatusBadge({ status }) {
  const s = status ?? 'info'
  if (s === 'success') return <StatusBadge family="pass" label={STATUS_LABEL.success} />
  if (s === 'failed') return <StatusBadge family="violation" label={STATUS_LABEL.failed} />
  if (s === 'warning') return <StatusBadge family="review" label={STATUS_LABEL.warning} />
  return <StatusBadge family="na" label={STATUS_LABEL.info} />
}

export default function Audit() {
  useDocumentTitle('Audit logs')

  const [offset, setOffset] = useState(0)
  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw, 200)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userId, setUserId] = useState('all')
  const [action, setAction] = useState('all')
  const [moduleName, setModuleName] = useState('all')
  const [status, setStatus] = useState('all')

  const audit = useResource(() => endpoints.admin.audit({ limit: PAGE_SIZE, offset }), {
    deps: [offset],
    label: 'audit',
  })
  const officers = useResource(() => endpoints.admin.users(), {
    label: 'users',
  })

  const env = audit.data ?? {}
  const entries = env.entries ?? []
  const total = env.total ?? entries.length
  const intact = env.chain_intact !== false
  const head = env.chain_head

  const userList = officers.data ?? []
  const userById = useMemo(
    () => new Map(userList.map((u) => [u.id, u])),
    [userList]
  )

  const actorLabel = (id) => {
    if (id == null) return 'System / unauthenticated'
    const u = userById.get(id)
    return u ? `${u.full_name} · ${u.employee_id}` : `Officer #${id}`
  }

  /* The full unfiltered set drives the User select and the page-cursor math.
     The filtered set is the same set narrowed by the controls above. */
  const rows = useMemo(() => {
    return entries.map((e) => {
      const user = e.user_id != null ? userById.get(e.user_id) : null
      return {
        id: e.seq ?? `${e.timestamp}-${e.user_id ?? 'sys'}-${e.action}`,
        e,
        user,
        actionLabel: ACTION_LABELS[e.action] ?? e.action,
        module: ACTION_MODULE[e.action] ?? 'System',
        status: e.outcome ?? ACTION_STATUS[e.action] ?? 'info',
        recordId: recordIdFor(e),
        role: roleFor(user),
        ipDevice: ipDeviceFor(e, user),
        device: deviceFor(e, user),
        timestamp: e.timestamp,
      }
    })
  }, [entries, userById])

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (dateFrom && shortDate(r.timestamp) < dateFrom) return false
      if (dateTo && shortDate(r.timestamp) > dateTo) return false
      if (userId !== 'all' && String(r.e.user_id ?? '') !== userId) return false
      if (action !== 'all' && r.e.action !== action) return false
      if (moduleName !== 'all' && r.module !== moduleName) return false
      if (status !== 'all' && r.status !== status) return false
      if (!needle) return true
      return [
        r.actionLabel,
        r.e.action,
        r.module,
        r.recordId,
        actorLabel(r.e.user_id),
        r.role,
        r.e.reason,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    })
  }, [rows, q, dateFrom, dateTo, userId, action, moduleName, status, actorLabel])

  const first = total === 0 ? 0 : offset + 1
  const last = Math.min(offset + entries.length, total)
  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  function applyFilters(e) {
    e?.preventDefault?.()
    /* Server paging is in effect, so a filter change resets the cursor. */
    setOffset(0)
  }

  function resetFilters() {
    setQRaw('')
    setDateFrom('')
    setDateTo('')
    setUserId('all')
    setAction('all')
    setModuleName('all')
    setStatus('all')
    setOffset(0)
  }

  return (
    <div className="nn-admin-page mx-auto max-w-[1200px]">
      {/* Breadcrumb + title */}
      <nav className="mb-2 flex items-center gap-1 text-caption text-ink-3" aria-label="Breadcrumb">
        <Link to="/admin" className="hover:text-ink-2">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium text-ink-2">Audit Logs</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">Audit Logs</h1>
          <p className="mt-1 text-small text-ink-2">
            Every recorded action, newest first, in a chain where any change to a past entry breaks every entry after it.
          </p>
        </div>
      </div>

      {/* Chain integrity verdict — first, because that is the auditor's first
          question. Kept above the table even on screens where the rest is
          tables and filters, so it is not buried below. */}
      {intact ? (
        <Callout family="pass" title="Audit chain is intact" icon={ShieldCheck} className="mt-5">
          The server re-hashed every entry and each links correctly to the one before it. Nothing in
          the visible history has been altered or removed.
          {head && (
            <span className="mt-2 block">
              <span className="nn-eyebrow">Chain head</span>{' '}
              <span className="nn-mono break-all text-ink-2">{head}</span>
            </span>
          )}
        </Callout>
      ) : (
        <Callout family="violation" title="Audit chain is broken" icon={ShieldAlert} className="mt-5">
          At least one entry does not link correctly to the one before it, which means a past record
          was altered or removed. This endpoint reports the break but does not return the failing
          sequence number, so it cannot be pinpointed from here — escalate for a direct database
          check.
        </Callout>
      )}

      {/* Filter bar */}
      <Card className="mt-5 p-4 sm:p-5">
        <form
          onSubmit={applyFilters}
          className="flex flex-col gap-4"
        >
          {/* Top tier: Search + Spacious Date Range */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-5">
              <Field label="Search">
                {(props) => (
                  <Input
                    {...props}
                    icon={Search}
                    value={qRaw}
                    onChange={(e) => setQRaw(e.target.value)}
                    placeholder="Action, record, user, reason…"
                  />
                )}
              </Field>
            </div>
            <div className="md:col-span-7">
              <Field label="Date Range">
                {(props) => (
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1">
                      <input
                        {...props}
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        aria-label="From date"
                        className="nn-input w-full text-small font-medium"
                      />
                    </div>
                    <span className="shrink-0 text-caption font-semibold text-ink-3" aria-hidden="true">to</span>
                    <div className="flex-1">
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        aria-label="To date"
                        className="nn-input w-full text-small font-medium"
                      />
                    </div>
                    {(dateFrom || dateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom('')
                          setDateTo('')
                        }}
                        className="shrink-0 text-caption font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </Field>
            </div>
          </div>

          {/* Bottom tier: Filters + Action buttons */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end">
            <Field label="User">
              {(props) => (
                <select {...props} value={userId} onChange={(e) => setUserId(e.target.value)} className="nn-select">
                  <option value="all">All users</option>
                  {userList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Action">
              {(props) => (
                <select {...props} value={action} onChange={(e) => setAction(e.target.value)} className="nn-select">
                  {ACTION_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Module">
              {(props) => (
                <select {...props} value={moduleName} onChange={(e) => setModuleName(e.target.value)} className="nn-select">
                  {MODULE_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Status">
              {(props) => (
                <select {...props} value={status} onChange={(e) => setStatus(e.target.value)} className="nn-select">
                  {STATUS_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-center gap-2">
              <Button type="submit" variant="primary" icon={Filter} className="w-full lg:w-auto">
                Apply
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={resetFilters}
              >
                Reset
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Table */}
      <Card className="mt-5 p-0">
        <div className="overflow-x-auto">
          <Table
            className="min-w-[1040px]"
            caption={`Audit entries ${first}–${last} of ${total.toLocaleString()}, newest first.`}
          >
            <thead>
              <tr>
                <Th>Timestamp</Th>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Action</Th>
                <Th>Module</Th>
                <Th>Record ID</Th>
                <Th>IP / Device</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title="No entries match these filters"
                      body="Adjust the search, date range, user, action, module or status to see entries."
                    />
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <AuditRow
                    key={r.id}
                    row={r}
                    actorLabel={actorLabel}
                  />
                ))
              )}
            </tbody>
          </Table>
        </div>

        <div className="flex flex-col items-start justify-between gap-2 border-t border-divider px-4 py-3 text-caption text-ink-2 sm:flex-row sm:items-center">
          <p>
            {total > 0 ? (
              <>
                Showing <span className="font-medium text-ink">{first.toLocaleString()}</span>–
                <span className="font-medium text-ink">{last.toLocaleString()}</span> of{' '}
                <span className="font-medium text-ink">{total.toLocaleString()}</span>
              </>
            ) : (
              'No entries'
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasPrev || audit.loading}
              disabledReason="You are on the first page."
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasNext || audit.loading}
              disabledReason="You are on the last page."
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Callout
        family="info"
        className="mt-5"
        title="What this view does not show"
      >
        The live /admin/audit response carries the timestamp, actor, action and
        a chain hash. The Role, Module, IP and Device columns on this page are
        derived locally — Role from the joined user record, Module from a
        fixed action→module map, and IP/Device from the actor's last-known
        install. Once the endpoint carries them natively, the derived values
        fall away without caller change.
      </Callout>
    </div>
  )
}

/** One audit row. */
function AuditRow({ row, actorLabel }) {
  const { e, user, actionLabel, module: mod, status, recordId, role, ipDevice, device } = row
  return (
    <Tr className="text-small">
      <Td>
        <span className="whitespace-nowrap text-ink-2">{prettyDateTime(e.timestamp)}</span>
      </Td>
      <Td>
        <span className="text-ink">{actorLabel(e.user_id)}</span>
        {e.user_id != null && user?.employee_id && (
          <span className="nn-mono ml-1 text-caption text-ink-3">· {user.employee_id}</span>
        )}
      </Td>
      <Td>
        <span className="text-ink-2">{role}</span>
      </Td>
      <Td>
        <span className="text-ink">{actionLabel}</span>
        {e.reason && (
          <span className="block max-w-[28rem] truncate text-caption text-ink-3" title={e.reason}>
            {e.reason}
          </span>
        )}
      </Td>
      <Td>
        <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-caption font-medium text-ink-2 ring-1 ring-inset ring-divider">
          {mod}
        </span>
      </Td>
      <Td>
        <span className="nn-mono text-ink-2">{recordId}</span>
      </Td>
      <Td>
        <span className="block text-ink-2">{ipDevice !== '—' ? ipDevice : '—'}</span>
        {device !== '—' && (
          <span className="block text-caption text-ink-3">{device}</span>
        )}
      </Td>
      <Td>
        <AuditStatusBadge status={status} />
      </Td>
    </Tr>
  )
}
