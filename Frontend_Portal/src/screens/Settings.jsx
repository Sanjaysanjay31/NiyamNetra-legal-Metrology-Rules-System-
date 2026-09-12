/**
 * Settings — the one screen both roles share, so it must not assume either.
 *
 * Everything here is either a device-local preference (theme, accent, language)
 * or an account action the server actually exposes (change password, sign out).
 * It deliberately does NOT offer profile editing, role changes, or device
 * release: those are administrator actions decided on the server — a role is a
 * property of the account, and a device release is `admin.resetInstall`. An
 * inspector cannot perform them, and pretending otherwise here would be a
 * control the server would reject. The closing note names that boundary rather
 * than hiding it.
 *
 * The change-password form mirrors the server contract exactly: the old
 * password is at least 8 characters and the new one at least 12 (see
 * schemas.ChangePasswordRequest). It also enforces new === confirm, which the
 * server cannot check because the confirmation field never leaves the browser.
 * On success the server bumps `token_epoch`, which kills every refresh token
 * already issued; the current access token keeps working until it expires, so
 * this screen recommends — but does not force — a fresh sign-in.
 */

import { useState } from 'react'
import {
  KeyRound,
  Languages,
  LogOut,
  Palette,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n, LanguageSwitcher } from '../i18n'
import { useTheme, ThemeSwitcher, AccentPicker } from '../theme/ThemeContext'
import { endpoints } from '../api/client'
import { useDocumentTitle, useMutation } from '../lib/hooks'
import {
  Button,
  Callout,
  Card,
  Field,
  Input,
  MetaStat,
  PageHeader,
  SectionTitle,
  useToast,
} from '../ui'

/* One consistent row: a label and helper on the left, the control on the right,
   wrapping to a stack on narrow screens. Used for every preference so the eye
   has a single rhythm to follow down the Appearance card. */
function PrefRow({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-body font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 max-w-sm text-caption text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const ROLE_LABEL = { admin: 'Administrator', inspector: 'Inspector' }

export default function Settings() {
  const { t } = useI18n()
  const { user, installId, logout } = useAuth()
  const { mode } = useTheme()
  const toast = useToast()
  useDocumentTitle(t('nav.settings'))

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={t('nav.settings')}
        title={t('nav.settings')}
        subtitle="Preferences on this device, and the account actions available to you."
      />

      {/* ---- Appearance: entirely device-local. Nothing here is sent to the
           server or recorded against an inspection. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <SectionTitle caption="Saved on this device only — it never affects a finding or a record.">
          <span className="inline-flex items-center gap-2">
            <Palette size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
            {t('theme.label')}
          </span>
        </SectionTitle>

        <div className="mt-2 divide-y divide-divider">
          <PrefRow
            label="Theme"
            hint={mode === 'system' ? t('theme.systemHint') : 'Light or dark, held only in this browser.'}
          >
            <ThemeSwitcher />
          </PrefRow>

          <PrefRow
            label={t('theme.accent')}
            hint="A visual tint for controls. It never stands in for a verdict — those colours are fixed."
          >
            <AccentPicker label={t('theme.accent')} />
          </PrefRow>

          <PrefRow
            label={
              <span className="inline-flex items-center gap-2">
                <Languages size={16} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
                Language
              </span>
            }
            hint="Changes the interface text. Findings and citations keep the wording the server sends."
          >
            <LanguageSwitcher />
          </PrefRow>
        </div>
      </Card>

      {/* ---- Account: read-only. Every value below is decided by the server. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <SectionTitle caption="Set by your Legal Metrology office. To change any of these, ask an administrator.">
          <span className="inline-flex items-center gap-2">
            <UserRound size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
            Account
          </span>
        </SectionTitle>

        {user ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetaStat label="Full name" value={user.full_name} />
            <MetaStat label={t('auth.employeeId')} value={<span className="nn-mono">{user.employee_id}</span>} />
            <MetaStat label="Role" value={ROLE_LABEL[user.role] ?? user.role} />
            <MetaStat
              label="Jurisdiction"
              value={user.jurisdiction || '—'}
              title={user.jurisdiction ? undefined : 'No jurisdiction is set on this account.'}
            />
          </div>
        ) : (
          <p className="mt-4 text-small text-ink-2">Account details are unavailable.</p>
        )}
      </Card>

      <ChangePasswordCard toast={toast} />

      {/* ---- This device: install binding and the sign-out action. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <SectionTitle caption="This account is tied to one device. Only an administrator can move it.">
          <span className="inline-flex items-center gap-2">
            <Smartphone size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
            This device
          </span>
        </SectionTitle>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="nn-eyebrow">Install ID</p>
            <p className="nn-mono mt-1 truncate text-small text-ink-2" title={installId || undefined}>
              {installId || 'Not bound on this session'}
            </p>
            <p className="mt-2 max-w-md text-caption text-ink-3">{t('auth.deviceBound')}</p>
          </div>
          <Button variant="ghost" icon={LogOut} onClick={() => logout()} className="shrink-0">
            {t('nav.signOut')}
          </Button>
        </div>
      </Card>

      {/* ---- The honest boundary. What this screen cannot do, and where those
           actions actually live. ---- */}
      <Callout family="info" title="What settings cannot change" icon={ShieldCheck} className="mt-6">
        Your name, employee ID, role, and jurisdiction are held by the server and edited by an
        administrator, not here. Releasing this account from its device — after a lost or replaced
        phone — is also an administrator action. Contact your Legal Metrology office for either.
      </Callout>
    </div>
  )
}

/**
 * The change-password form, kept in its own component so its transient state —
 * three fields and a success flag — does not sit in the parent and force the
 * whole screen to re-render on every keystroke.
 */
function ChangePasswordCard({ toast }) {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const change = useMutation((oldPw, newPw) => endpoints.auth.changePassword(oldPw, newPw))

  /* Client-side mirrors of the server rules, plus the confirm match the server
     cannot see. These gate the button and feed inline messages; the server
     stays the source of truth and its errors override anything here. */
  const tooShort = next.length > 0 && next.length < 12
  const mismatch = confirm.length > 0 && next !== confirm
  const sameAsOld = next.length > 0 && current.length > 0 && next === current
  const canSubmit =
    current.length >= 8 && next.length >= 12 && next === confirm && next !== current && !change.pending

  const newError =
    change.fieldErrors?.new_password ??
    (tooShort ? 'Use at least 12 characters.' : sameAsOld ? 'Choose a password different from the current one.' : undefined)
  const confirmError = mismatch ? 'This does not match the new password.' : undefined

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await change.run(current, next)
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.push({
        family: 'pass',
        title: 'Password changed',
        body: 'Other devices signed in with this account are now signed out. This device stays signed in.',
      })
    } catch {
      /* useMutation holds the error; the callout below renders it. */
    }
  }

  return (
    <Card className="mt-6 p-5 sm:p-6">
      <SectionTitle caption="At least 12 characters. Changing it signs out every other device on this account.">
        <span className="inline-flex items-center gap-2">
          <KeyRound size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
          {t('auth.changePassword')}
        </span>
      </SectionTitle>

      {done && !change.pending && (
        <Callout family="pass" title="Password updated" className="mt-4">
          Your password has changed. This device is still signed in; to rotate its session too, sign
          out and back in.
        </Callout>
      )}

      {/* A wrong current password comes back as a 400 with a plain message and
          no field map, so it is surfaced here rather than under an input. */}
      {change.error && !change.fieldErrors && (
        <Callout family="violation" title="Could not change the password" className="mt-4">
          {change.error.message}
        </Callout>
      )}

      <form onSubmit={onSubmit} className="mt-4 flex max-w-sm flex-col gap-4" noValidate>
        <Field label={t('auth.currentPassword')} error={change.fieldErrors?.old_password} required>
          {(props) => (
            <Input
              {...props}
              type="password"
              name="current-password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value)
                if (done) setDone(false)
              }}
            />
          )}
        </Field>

        <Field label={t('auth.newPassword')} hint="12 characters or more." error={newError} required>
          {(props) => (
            <Input
              {...props}
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => {
                setNext(e.target.value)
                if (done) setDone(false)
              }}
            />
          )}
        </Field>

        <Field label={t('auth.confirmPassword')} error={confirmError} required>
          {(props) => (
            <Input
              {...props}
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                if (done) setDone(false)
              }}
            />
          )}
        </Field>

        <Button
          type="submit"
          icon={KeyRound}
          loading={change.pending}
          disabled={!canSubmit}
          disabledReason="Enter your current password and a new one of at least 12 characters, typed the same twice."
          className="mt-1 self-start"
        >
          {change.pending ? t('common.saving') : t('auth.changePassword')}
        </Button>
      </form>
    </Card>
  )
}


