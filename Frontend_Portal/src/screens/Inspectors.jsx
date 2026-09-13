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

import { useMemo, useState } from 'react'
import { Info, Pencil, Search, Smartphone, UserPlus } from 'lucide-react'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDebounced, useDocumentTitle, useMutation, useResource } from '../lib/hooks'
import {
  Button,
  Callout,
  Card,
  Checkbox,
  DemoChip,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pill,
  RadioCards,
  SectionTitle,
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

export default function Inspectors() {
  const { t } = useI18n()
  useDocumentTitle(t('admin.users'))
  const toast = useToast()

  const list = useResource(() => endpoints.admin.users(), {
    label: t('admin.users'),
  })
  const rows = list.data ?? []

  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw, 200)
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [releaseUser, setReleaseUser] = useState(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((u) =>
      [u.full_name, u.employee_id, u.jurisdiction]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    )
  }, [rows, q])

  const active = rows.filter((u) => u.is_active).length

  function afterChange(message) {
    list.reload()
    toast.push({ family: 'pass', title: message })
  }

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={t('nav.inspectors')}
        title={t('admin.users')}
        subtitle="Everyone who can sign in, with the account actions the server allows an administrator to take."
        actions={
          <div className="flex items-center gap-2">
            {list.demo && <DemoChip />}
            <Button icon={UserPlus} onClick={() => setCreateOpen(true)}>
              {t('admin.addUser')}
            </Button>
          </div>
        }
      />

      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-small text-ink-2">
            <span className="tabular-nums font-medium text-ink">{active}</span> active of{' '}
            <span className="tabular-nums">{rows.length}</span>{' '}
            {rows.length === 1 ? 'account' : 'accounts'}
          </p>
          <div className="w-full sm:max-w-xs">
            <Field label={t('common.search')} hint="Filters this list in the browser by name, ID or jurisdiction.">
              {(props) => (
                <Input
                  {...props}
                  icon={Search}
                  value={qRaw}
                  onChange={(e) => setQRaw(e.target.value)}
                  placeholder="Name, employee ID, jurisdiction"
                />
              )}
            </Field>
          </div>
        </div>

        <div className="mt-5">
          {filtered.length === 0 ? (
            <EmptyState
              title={q.trim() ? 'No matches' : t('common.empty')}
              body={q.trim() ? 'No account matches that search.' : 'No accounts exist yet.'}
            />
          ) : (
            <Table caption={`${filtered.length} of ${rows.length} accounts.`}>
              <thead>
                <tr>
                  <Th>Officer</Th>
                  <Th>{t('admin.role')}</Th>
                  <Th>{t('admin.jurisdiction')}</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <span className="block text-small font-medium text-ink">{u.full_name}</span>
                      <span className="nn-mono text-caption text-ink-3">{u.employee_id}</span>
                    </Td>
                    <Td>{ROLE_LABEL[u.role] ?? u.role}</Td>
                    <Td>{u.jurisdiction || <span className="text-ink-3">—</span>}</Td>
                    <Td>
                      <Pill family={u.is_active ? 'pass' : 'na'}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Pill>
                    </Td>
                    <Td align="right">
                      <div className="inline-flex items-center gap-2">
                        <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditUser(u)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" icon={Smartphone} onClick={() => setReleaseUser(u)}>
                          Release device
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      {/* ---- The honest boundary. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <SectionTitle>What this roster cannot show or do</SectionTitle>
        <ul className="mt-3 space-y-2 text-small text-ink-2">
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            Email and phone are accepted when creating or editing an account, but the roster response
            does not return them, so they cannot be listed here.
          </li>
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            Whether an officer currently has a device bound is not part of the account record, so the
            release action is always offered rather than reflecting a live binding.
          </li>
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            There is no way to set another officer's password, and no delete: an officer with history
            is deactivated, keeping every audit reference intact.
          </li>
        </ul>
      </Card>

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
          <Button variant="ghost" onClick={onClose} disabled={create.pending}>
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
          <Button variant="ghost" onClick={onClose} disabled={update.pending}>
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
          <Button variant="ghost" onClick={onClose} disabled={release.pending}>
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




