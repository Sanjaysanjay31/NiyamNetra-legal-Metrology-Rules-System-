/**
 * Inspectors — the roster, and the few account actions an administrator holds.
 *
 * Four things happen here, and each maps to exactly one endpoint the server
 * exposes: list officers (/admin/users), create one, update one, and release a
 * device binding (/admin/users/{id}/reset-install). Nothing else is offered,
 * because nothing else exists: there is no password reset for another user
 * (that officer changes their own), and there is no delete (an officer with
 * history is deactivated, not erased, so the audit chain keeps its references).
 *
 * Two honest gaps come straight from the response shape. UserOut carries no
 * email or phone, so although the create and update forms accept them, the list
 * cannot display them. And UserOut carries no device field, so this screen
 * cannot show whether an officer currently has a device bound — the release
 * action is therefore always available and simply says what it will do rather
 * than reflecting a state it cannot see. Both are stated at the foot of the
 * screen rather than left for someone to discover.
 *
 * Deactivation and device release are done through explicit, reasoned dialogs,
 * never a bare row toggle: locking an officer out or forcing a re-bind is a
 * decision that belongs in the audit trail with intent attached.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Filter, Info, MoreVertical, Pencil, Search, Smartphone, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDebounced, useDocumentTitle, useMutation, useResource } from '../lib/hooks'
import { users as usersFixture } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Pill,
  RadioCards,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from '../ui'

const ROLE_OPTIONS = [
  { value: 'inspector', label: 'Inspector', hint: 'Records inspections and captures packages in the field.' },
  { value: 'admin', label: 'Administrator', hint: 'Full portal access, including this roster and the audit trail.' },
]
const ROLE_LABEL = { admin: 'Administrator', inspector: 'Inspector' }

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const AREA_FALLBACK = ['Kakinada', 'Rajahmundry', 'Anakapalli', 'Visakhapatnam', 'Vijayawada', 'Guntur']

const PAGE_SIZE = 7

function joinedOn(u) {
  if (u?.joined_on) return u.joined_on
  if (u?.created_at) return u.created_at
  return null
}

function joinLabel(s) {
  if (!s) return '—'
  try {
    return format(parseISO(s), 'd MMM yyyy')
  } catch {
    return s
  }
}

export default function Inspectors() {
  const { t } = useI18n()
  useDocumentTitle(t('admin.users'))
  const toast = useToast()

  const list = useResource(() => endpoints.admin.users(), {
    fallback: usersFixture,
    label: t('admin.users'),
  })
  const rows = list.data ?? usersFixture

  /* Server-side accepts jurisdiction via /admin/users; area and status filtering
     here is applied on top so the URL is the source of truth, the table is what
     the user sees, and live results still narrow correctly. */
  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw, 200)
  const [area, setArea] = useState('all')
  const [status, setStatus] = useState('all')

  const [page, setPage] = useState(1)
  const [menuFor, setMenuFor] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [releaseUser, setReleaseUser] = useState(null)

  const areas = useMemo(() => {
    const set = new Set(AREA_FALLBACK)
    rows.forEach((u) => {
      if (u.jurisdiction) set.add(u.jurisdiction)
    })
    return Array.from(set).sort()
  }, [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((u) => {
      if (area !== 'all' && u.jurisdiction !== area) return false
      if (status === 'active' && !u.is_active) return false
      if (status === 'inactive' && u.is_active) return false
      if (!needle) return true
      return [u.full_name, u.employee_id, u.jurisdiction]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    })
  }, [rows, q, area, status])

  /* Reset to the first page when the filter result set shrinks past the
     current offset, so the footer count never lies. */
  useEffect(() => {
    const max = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    if (page > max) setPage(1)
  }, [filtered.length, page])

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const startIdx = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(filtered.length, page * PAGE_SIZE)

  function areaOf(u) {
    return u.jurisdiction || '—'
  }

  function inspectionsOf(u) {
    if (typeof u.inspections === 'number') return u.inspections
    if (typeof u.inspection_count === 'number') return u.inspection_count
    return 0
  }

  function applyFilters(e) {
    e?.preventDefault?.()
    setPage(1)
  }

  function resetFilters() {
    setQRaw('')
    setArea('all')
    setStatus('all')
    setPage(1)
  }

  function afterChange(message) {
    list.reload()
    toast.push({ family: 'pass', title: message })
  }

  return (
    <div className="nn-admin-page mx-auto max-w-[1200px]">
      {/* Breadcrumb + title + add action */}
      <nav className="mb-2 flex items-center gap-1 text-caption text-ink-3" aria-label="Breadcrumb">
        <Link to="/admin" className="hover:text-ink-2">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium text-ink-2">Inspectors</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">Inspectors</h1>
          <p className="mt-1 text-small text-ink-2">Field officers and administrators with portal access.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={UserPlus} onClick={() => setCreateOpen(true)}>
            Add Inspector
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="mt-5 p-4 sm:p-5">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[1fr_180px_180px_auto]"
        >
          <Field label="Search by Employee ID / Name">
            {(props) => (
              <Input
                {...props}
                icon={Search}
                value={qRaw}
                onChange={(e) => setQRaw(e.target.value)}
                placeholder="e.g. INS102 or Ravi"
              />
            )}
          </Field>
          <Field label="All Areas">
            {(props) => (
              <select
                {...props}
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="nn-select"
              >
                <option value="all">All Areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Status">
            {(props) => (
              <select
                {...props}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="nn-select"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" icon={Filter} className="w-full md:w-auto">
              Apply filters
            </Button>
            <button
              type="button"
              onClick={resetFilters}
              className="text-caption font-medium text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
            >
              Reset
            </button>
          </div>
        </form>
      </Card>

      {/* Table */}
      <Card className="mt-5 p-0">
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]" caption={`${filtered.length} inspector${filtered.length === 1 ? '' : 's'}.`}>
            <thead>
              <tr>
                <Th>Employee ID</Th>
                <Th>Name</Th>
                <Th>Area</Th>
                <Th align="right">Inspections</Th>
                <Th>Joined On</Th>
                <Th>Status</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="No inspectors match"
                      body="Adjust the search or filters to see officers in the roster."
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <span className="nn-mono text-small text-ink">{u.employee_id}</span>
                    </Td>
                    <Td>
                      <span className="block text-small font-medium text-ink">{u.full_name}</span>
                      <span className="text-caption text-ink-3">{ROLE_LABEL[u.role] ?? u.role}</span>
                    </Td>
                    <Td>{areaOf(u)}</Td>
                    <Td align="right">
                      <span className="nn-mono tabular-nums">{inspectionsOf(u)}</span>
                    </Td>
                    <Td>
                      <span className="text-small text-ink-2">{joinLabel(joinedOn(u))}</span>
                    </Td>
                    <Td>
                      {u.is_active ? (
                        <StatusBadge family="pass" label="Active" />
                      ) : (
                        <StatusBadge family="na" label="Inactive" />
                      )}
                    </Td>
                    <Td align="right">
                      <RowMenu
                        user={u}
                        open={menuFor === u.id}
                        onOpenChange={(open) => setMenuFor(open ? u.id : null)}
                        onEdit={() => {
                          setMenuFor(null)
                          setEditUser(u)
                        }}
                        onRelease={() => {
                          setMenuFor(null)
                          setReleaseUser(u)
                        }}
                      />
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-start justify-between gap-2 border-t border-divider px-4 py-3 text-caption text-ink-2 sm:flex-row sm:items-center">
          <p>
            Showing <span className="font-medium text-ink">{startIdx}</span>–
            <span className="font-medium text-ink">{endIdx}</span> of{' '}
            <span className="font-medium text-ink">{filtered.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              disabledReason="You are on the first page."
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-caption text-ink-2 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              disabledReason="You are on the last page."
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Callout family="info" className="mt-5" icon={Info} title="What the list does not show">
        User records carry no email, phone or device field, so the roster can only
        offer what the response shape carries. Account deactivation locks the
        officer out at the next sign-in; their history is preserved either way.
      </Callout>

      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false)
            afterChange('Inspector created')
          }}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onDone={() => {
            setEditUser(null)
            afterChange('Account updated')
          }}
        />
      )}
      {releaseUser && (
        <ReleaseDeviceModal
          user={releaseUser}
          onClose={() => setReleaseUser(null)}
          onDone={() => {
            setReleaseUser(null)
            afterChange('Device binding released')
          }}
        />
      )}
    </div>
  )
}

/** Three-dot menu anchored to a button; closes on outside click or Escape. */
function RowMenu({ user, open, onOpenChange, onEdit, onRelease }) {
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onOpenChange(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${user.full_name}`}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-pill text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-44 origin-top-right rounded-card border border-divider bg-surface shadow-card"
        >
          <button
            type="button"
            role="menuitem"
            onClick={onEdit}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-small text-ink hover:bg-surface-2"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit account
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onRelease}
            className="flex w-full items-center gap-2 border-t border-divider px-3 py-2 text-left text-small text-ink hover:bg-surface-2"
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            Release device
          </button>
        </div>
      )}
    </div>
  )
}

/** Create. employee_id >= 3, full_name >= 2, password >= 12 — mirroring
    CreateUserRequest. A duplicate employee ID returns 409 with a plain message
    and no field map, so it is surfaced above the form. */
function CreateUserModal({ onClose, onDone }) {
  const { t } = useI18n()
  const [employeeId, setEmployeeId] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('inspector')
  const [jurisdiction, setJurisdiction] = useState('')
  const create = useMutation((body) => endpoints.admin.createUser(body))
  const fe = create.fieldErrors

  const canSubmit =
    employeeId.trim().length >= 3 && fullName.trim().length >= 2 && password.length >= 12 && !create.pending

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await create.run({
        employee_id: employeeId.trim(),
        full_name: fullName.trim(),
        password,
        role,
        jurisdiction: jurisdiction.trim() || null,
      })
      onDone()
    } catch {
      /* held in create.error */
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add an inspector"
      description="Creates a sign-in account. The officer sets no password themselves — you set an initial one, and they change it on first sign-in."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.pending} disabledReason="Saving in progress.">
            Cancel
          </Button>
          <Button
            icon={UserPlus}
            loading={create.pending}
            disabled={!canSubmit}
            disabledReason="Enter an employee ID, a name, and an initial password of at least 12 characters."
            onClick={onSubmit}
          >
            Create account
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {create.error && !fe && (
          <Callout family="violation" title="The account was not created">
            {create.error.status === 409 ? 'That employee ID is already in use.' : create.error.message}
          </Callout>
        )}
        <Field label="Employee ID" hint="The ID issued by your Legal Metrology office." error={fe?.employee_id} required>
          {(props) => (
            <Input
              {...props}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="LM-XX-0000"
            />
          )}
        </Field>
        <Field label="Full name" error={fe?.full_name} required>
          {(props) => <Input {...props} value={fullName} onChange={(e) => setFullName(e.target.value)} />}
        </Field>
        <Field label="Initial password" hint="At least 12 characters. The officer changes it on first sign-in." error={fe?.password} required>
          {(props) => (
            <Input {...props} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <div>
          <p className="nn-eyebrow">{t('admin.role')}</p>
          <RadioCards name="role" value={role} onChange={setRole} options={ROLE_OPTIONS} className="mt-2" />
        </div>
        <Field label={`${t('admin.jurisdiction')} (optional)`} error={fe?.jurisdiction}>
          {(props) => (
            <Input {...props} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="e.g. Pune City" />
          )}
        </Field>
      </form>
    </Modal>
  )
}

/**
 * Edit. Every field on UpdateUserRequest is optional, so this sends only what
 * actually changed — an untouched form produces an empty body and the server
 * records no change. `is_active` is the consequential one: clearing it locks the
 * officer out at the next sign-in, which is why it carries a spelled-out warning
 * rather than sitting as a bare switch in the roster row.
 */
function EditUserModal({ user, onClose, onDone }) {
  const { t } = useI18n()
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [role, setRole] = useState(user.role ?? 'inspector')
  const [jurisdiction, setJurisdiction] = useState(user.jurisdiction ?? '')
  const [isActive, setIsActive] = useState(user.is_active !== false)
  const update = useMutation((body) => endpoints.admin.updateUser(user.id, body))
  const fe = update.fieldErrors

  /* Only changed keys travel. Comparing against the row we were handed keeps the
     audit entry narrow: "role: inspector → admin", not a whole record rewrite. */
  const body = useMemo(() => {
    const next = {}
    const name = fullName.trim()
    const jur = jurisdiction.trim()
    if (name !== (user.full_name ?? '')) next.full_name = name
    if (role !== user.role) next.role = role
    if (jur !== (user.jurisdiction ?? '')) next.jurisdiction = jur || null
    if (isActive !== (user.is_active !== false)) next.is_active = isActive
    return next
  }, [fullName, role, jurisdiction, isActive, user])

  const changedCount = Object.keys(body).length
  const nameTooShort = fullName.trim().length > 0 && fullName.trim().length < 2
  const deactivating = isActive === false && user.is_active !== false
  const canSubmit = changedCount > 0 && !nameTooShort && fullName.trim().length >= 2 && !update.pending

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await update.run(body)
      onDone()
    } catch {
      /* held in update.error */
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.full_name}`}
      description={`Employee ID ${user.employee_id}. The employee ID and password cannot be changed here.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={update.pending} disabledReason="Saving in progress.">
            {t('common.cancel')}
          </Button>
          <Button
            icon={Pencil}
            loading={update.pending}
            disabled={!canSubmit}
            disabledReason={
              nameTooShort || fullName.trim().length < 2
                ? 'A full name of at least two characters is required.'
                : 'Change something first — nothing has been edited yet.'
            }
            onClick={onSubmit}
          >
            {update.pending ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {update.error && !fe && (
          <Callout family="violation" title="The account was not updated">
            {update.error.status === 404
              ? 'This account no longer exists. Close this and refresh the roster.'
              : update.error.message}
          </Callout>
        )}

        <Field
          label="Full name"
          error={fe?.full_name ?? (nameTooShort ? 'Use at least two characters.' : undefined)}
          required
        >
          {(props) => <Input {...props} value={fullName} onChange={(e) => setFullName(e.target.value)} />}
        </Field>

        <div>
          <p className="nn-eyebrow">{t('admin.role')}</p>
          <RadioCards name="edit-role" value={role} onChange={setRole} options={ROLE_OPTIONS} className="mt-2" />
        </div>

        <Field label={`${t('admin.jurisdiction')} (optional)`} error={fe?.jurisdiction}>
          {(props) => (
            <Input {...props} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="e.g. Pune City" />
          )}
        </Field>

        <div className="nn-well">
          <Checkbox
            label="Account is active"
            hint="An inactive account cannot sign in. History is kept either way — accounts are never deleted."
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          {deactivating && (
            <Callout family="review" title="This will lock the officer out" className="mt-3">
              They will be refused at the next sign-in, and any inspection left in draft stays in draft.
              Work already submitted is unaffected.
            </Callout>
          )}
        </div>

        <p className="text-caption text-ink-3">
          {changedCount === 0
            ? 'Nothing has changed yet.'
            : `${changedCount} ${changedCount === 1 ? 'field' : 'fields'} will be sent; the rest are left untouched.`}
        </p>
      </form>
    </Modal>
  )
}

/**
 * Release the device binding.
 *
 * One account is tied to one install. When a phone is lost, replaced or wiped,
 * the officer cannot sign in anywhere until that binding is cleared — and
 * clearing it is the one action here that could be abused, because it lets an
 * account move to a device nobody has seen. So the server insists on a reason of
 * at least ten characters and writes it into the audit chain as `install_reset`;
 * this dialog asks for that reason in those terms rather than as a formality.
 *
 * The response returns `install_id: null`, confirming the account is now
 * unbound. It does not say which device it was, because the roster never carried
 * that field in the first place.
 */
function ReleaseDeviceModal({ user, onClose, onDone }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const release = useMutation((r) => endpoints.admin.resetInstall(user.id, r))
  const fe = release.fieldErrors

  const trimmed = reason.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < 10
  const canSubmit = trimmed.length >= 10 && trimmed.length <= 500 && !release.pending

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await release.run(trimmed)
      onDone()
    } catch {
      /* held in release.error */
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Release this account from its device"
      description={`${user.full_name} · ${user.employee_id}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={release.pending} disabledReason="Releasing in progress.">
            {t('common.cancel')}
          </Button>
          <Button
            icon={Smartphone}
            loading={release.pending}
            disabled={!canSubmit}
            disabledReason="Write a reason of at least ten characters — it is recorded in the audit trail."
            onClick={onSubmit}
          >
            Release binding
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {release.error && !fe && (
          <Callout family="violation" title="The binding was not released">
            {release.error.status === 404
              ? 'This account no longer exists. Close this and refresh the roster.'
              : release.error.message}
          </Callout>
        )}

        <Callout family="info" title="What this does" icon={Info}>
          The next device this officer signs in on becomes the bound one. Until they sign in, the
          account is bound to nothing and cannot capture inspections. Anything already recorded on
          the old device and not yet synced will not reach the server.
        </Callout>

        <Field
          label="Reason"
          hint="At least 10 characters. Stored permanently in the audit trail beside your own name."
          error={fe?.reason ?? (tooShort ? 'Give at least 10 characters of reason.' : undefined)}
          required
        >
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="e.g. Handset lost on duty 28 Aug; replacement issued by the district office."
            />
          )}
        </Field>

        <p className="text-caption text-ink-3 tabular-nums">{trimmed.length} of 500 characters</p>
      </form>
    </Modal>
  )
}
