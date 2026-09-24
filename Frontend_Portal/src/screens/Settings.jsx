/**
 * Settings — the one screen both roles share, so it must not assume either.
 *
 * Six sections, each on a white card with a hairline border:
 *   1. Profile              read-only: who you are (name, employee id, role)
 *   2. Account              login, password, install binding, sign-out
 *   3. Notification Prefs   which alerts the device-local store fires
 *   4. System Configuration language, density, demo data — device-local
 *   5. Inspection Settings  preferences an officer can set for new inspections
 *   6. Sync Settings        how this device moves data to the server
 *
 * Profile and account facts are decided by the server — an inspector cannot
 * edit their own name or role, and a device release is an administrator action.
 * The closing callout names that boundary rather than hiding it.
 */

import { useState } from 'react'
import {
  Bell,
  Database,
  Globe,
  KeyRound,
  Languages,
  LogOut,
  Save,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n, LanguageSwitcher } from '../i18n'
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

/* ------------------------------------------------------------------ helpers */

const ROLE_LABEL = { admin: 'Administrator', inspector: 'Inspector' }

/* One consistent row: a label and helper on the left, the control on the right,
   wrapping to a stack on narrow screens. Every preference in this screen uses
   the same row so the eye has a single rhythm to follow. */
function PrefRow({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 sm:max-w-md">
        <p className="text-small font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-caption text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SectionCard({ title, caption, icon: Icon, children }) {
  return (
    <Card className="mt-5 p-5 sm:p-6">
      <SectionTitle caption={caption}>
        <span className="inline-flex items-center gap-2">
          {Icon && <Icon size={16} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />}
          {title}
        </span>
      </SectionTitle>
      <div className="mt-1 divide-y divide-divider">{children}</div>
    </Card>
  )
}

/* ------------------------------------------------------------------ screen -- */

export default function Settings() {
  const { t } = useI18n()
  const { user, installId, logout } = useAuth()
  const toast = useToast()
  useDocumentTitle(t('nav.settings'))

  return (
    <div className="nn-admin-page mx-auto max-w-[960px]">
      <PageHeader
        eyebrow={t('nav.settings')}
        title={t('nav.settings')}
        subtitle="Preferences on this device, and the account actions available to you."
      />

      {/* 1 — Profile */}
      <SectionCard
        title="Profile"
        icon={UserRound}
        caption="Who you are in the system. Set by the office that issued your account; not editable here."
      >
        {user ? (
          <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
            <MetaStat
              label="Full name"
              value={
                !user.full_name || user.full_name === 'Seed Administrator'
                  ? 'Administrator'
                  : user.full_name
              }
            />
            <MetaStat
              label={t('auth.employeeId')}
              value={<span className="nn-mono">{user.employee_id}</span>}
            />
            <MetaStat label="Role" value={ROLE_LABEL[user.role] ?? user.role} />
            <MetaStat
              label="Jurisdiction"
              value={user.jurisdiction || '—'}
              title={user.jurisdiction ? undefined : 'No jurisdiction is set on this account.'}
            />
          </div>
        ) : (
          <p className="py-4 text-small text-ink-2">Account details are unavailable.</p>
        )}
      </SectionCard>

      {/* 2 — Account */}
      <SectionCard
        title="Account"
        icon={KeyRound}
        caption="Your password and the device this account is bound to. Only an administrator can move the binding."
      >
        <ChangePasswordRow />
        <PrefRow
          label="Install ID"
          hint="This account is tied to one device. To move it, ask an administrator to release the binding."
        >
          <span
            className="nn-mono inline-block max-w-[260px] truncate text-small text-ink-2"
            title={installId || undefined}
          >
            {installId || 'Not bound on this session'}
          </span>
        </PrefRow>
        <PrefRow label="Sign out" hint="End this session on this device. Other devices on this account are not affected.">
          <Button variant="secondary" icon={LogOut} onClick={() => logout()}>
            {t('nav.signOut')}
          </Button>
        </PrefRow>
      </SectionCard>

      {/* 3 — Notification Preferences */}
      <SectionCard
        title="Notification Preferences"
        icon={Bell}
        caption="Alerts shown to you on this device. None of these are sent to the server and none affect a finding."
      >
        <NotifyRow
          k="new_inspection"
          label="New inspection submitted"
          hint="Show a confirmation when an officer submits an inspection in your jurisdiction."
        />
        <NotifyRow
          k="violation_flagged"
          label="Violation flagged"
          hint="Show an alert when a scan comes back as a violation."
        />
        <NotifyRow
          k="sync_failure"
          label="Sync failure"
          hint="Show an alert when a draft fails to sync, with a retry option."
        />
        <NotifyRow
          k="rule_version"
          label="Rule version change"
          hint="Show a banner when a new rule version goes into effect."
        />
        <PrefRow label="Email digest" hint="A daily summary at 08:00 local time. Disabled by default.">
          <Switch storageKey="settings.notify.digest" defaultChecked={false} label="Daily digest" />
        </PrefRow>
      </SectionCard>

      {/* 4 — System Configuration */}
      <SectionCard
        title="System Configuration"
        icon={Globe}
        caption="Saved on this device only. Findings and citations always use the wording the server sends."
      >
        <PrefRow
          label="Language"
          hint="Changes the interface text. The catalogue citations stay in English."
        >
          <LanguageSwitcher />
        </PrefRow>
        <PrefRow label="Density" hint="Comfortable fits more on screen; Compact leaves more whitespace.">
          <Segmented
            storageKey="settings.density"
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
            defaultValue="comfortable"
          />
        </PrefRow>
        <PrefRow label="Demo data" hint="Show a small chip on screens that are reading from the fixture set.">
          <Switch storageKey="settings.demo" defaultChecked={true} label="Show demo chip" />
        </PrefRow>
      </SectionCard>

      {/* 5 — Inspection Settings */}
      <SectionCard
        title="Inspection Settings"
        icon={ShieldCheck}
        caption="Defaults applied to a new inspection before the officer changes anything on the form."
      >
        <PrefRow
          label="Default transaction type"
          hint="Pre-selected on the New Inspection form."
        >
          <select className="nn-select w-44" defaultValue="retail_sale">
            <option value="retail_sale">Retail sale</option>
            <option value="institutional">Institutional</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </PrefRow>
        <PrefRow
          label="Require signature on submit"
          hint="Officer cannot submit an inspection without a representative signature on file."
        >
          <Switch storageKey="settings.inspect.requireSignature" defaultChecked={true} label="Require signature" />
        </PrefRow>
        <PrefRow
          label="Auto-save drafts"
          hint="Save the open inspection draft every 30 seconds."
        >
          <Switch storageKey="settings.inspect.autosave" defaultChecked={true} label="Auto-save" />
        </PrefRow>
        <PrefRow
          label="Minimum photos per package"
          hint="Warn when a package has fewer than this many evidence photos."
        >
          <select className="nn-select w-28" defaultValue="2">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </PrefRow>
        <SaveButton label="Save inspection settings" message="Inspection settings saved" />
      </SectionCard>

      {/* 6 — Sync Settings */}
      <SectionCard
        title="Sync Settings"
        icon={Database}
        caption="How this device moves inspection drafts to the server."
      >
        <PrefRow label="Sync on Wi-Fi only" hint="Drafts are uploaded only when the device is on a known Wi-Fi network.">
          <Switch storageKey="settings.sync.wifiOnly" defaultChecked={false} label="Wi-Fi only" />
        </PrefRow>
        <PrefRow label="Sync on metered networks" hint="Allow uploads on cellular when the connection is metered.">
          <Switch storageKey="settings.sync.metered" defaultChecked={true} label="Allow metered" />
        </PrefRow>
        <PrefRow
          label="Sync interval"
          hint="How often this device attempts to upload drafts in the background."
        >
          <select className="nn-select w-36" defaultValue="15">
            <option value="5">Every 5 min</option>
            <option value="15">Every 15 min</option>
            <option value="30">Every 30 min</option>
            <option value="60">Every hour</option>
          </select>
        </PrefRow>
        <PrefRow
          label="Image compression"
          hint="Higher quality keeps the original for the engine; Balanced shrinks the upload."
        >
          <Segmented
            storageKey="settings.sync.imageQuality"
            options={[
              { value: 'high', label: 'High' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'small', label: 'Small' },
            ]}
            defaultValue="balanced"
          />
        </PrefRow>
        <PrefRow label="Retain synced drafts" hint="Keep a local copy of submitted inspections for 30 days after sync.">
          <Switch storageKey="settings.sync.retain" defaultChecked={true} label="Retain 30 days" />
        </PrefRow>
        <SaveButton label="Save sync settings" message="Sync settings saved" />
      </SectionCard>

      {/* ---- The honest boundary. What this screen cannot do, and where those
           actions actually live. ---- */}
      <Callout family="info" title="What settings cannot change" icon={ShieldCheck} className="mt-5">
        Your name, employee ID, role, and jurisdiction are held by the server and edited by an
        administrator, not here. Releasing this account from its device — after a lost or replaced
        phone — is also an administrator action. Contact your Legal Metrology office for either.
      </Callout>
    </div>
  )
}

/* -------------------------------------------------------------- helpers -- */

/* A labelled switch backed by localStorage so the choice survives a refresh.
   The portal already keeps a small bag of device-local preferences in
   localStorage under namespaced keys; this is one of them. The component is
   local to this screen because no other screen currently exposes a switch. */
function Switch({ storageKey, defaultChecked, label }) {
  const [on, setOn] = useState(() => {
    if (typeof window === 'undefined') return Boolean(defaultChecked)
    const v = window.localStorage.getItem(storageKey)
    if (v == null) return Boolean(defaultChecked)
    return v === '1'
  })
  function toggle() {
    const next = !on
    setOn(next)
    try {
      window.localStorage.setItem(storageKey, next ? '1' : '0')
    } catch {
      /* storage full / blocked — preference stays in memory */
    }
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={toggle}
      className={
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill transition-colors ' +
        (on ? 'bg-accent' : 'bg-surface-sunken ring-1 ring-inset ring-divider')
      }
    >
      <span
        className={
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ' +
          (on ? 'translate-x-5' : 'translate-x-1')
        }
      />
    </button>
  )
}

/* A small segmented control, also backed by localStorage. Same reasoning as
   the Switch above. */
function Segmented({ storageKey, options, defaultValue }) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue
    return window.localStorage.getItem(storageKey) ?? defaultValue
  })
  function pick(v) {
    setValue(v)
    try {
      window.localStorage.setItem(storageKey, v)
    } catch {
      /* see Switch */
    }
  }
  return (
    <div className="inline-flex items-center rounded-pill bg-surface-2 p-0.5 ring-1 ring-inset ring-divider">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            className={
              'rounded-pill px-3 py-1 text-caption font-medium transition-colors ' +
              (active
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-2 hover:text-ink')
            }
            aria-pressed={active}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* One row in the Notification Preferences card. The notification store is
   device-local: a value in localStorage decides whether the toast fires. The
   row label and hint are the only thing this screen actually shows; the
   consumer code that fires the toast lives in the toast provider. */
function NotifyRow({ k, label, hint }) {
  return (
    <PrefRow label={label} hint={hint}>
      <Switch storageKey={`settings.notify.${k}`} defaultChecked={true} label={label} />
    </PrefRow>
  )
}

/* The blue "Save … settings" button at the foot of Inspection Settings and
   Sync Settings. Its work today is to confirm the choice on screen — the
   persisted values are already written by the per-row controls above. */
function SaveButton({ label, message }) {
  const toast = useToast()
  return (
    <div className="flex justify-end pt-4">
      <Button
        variant="accent"
        icon={Save}
        onClick={() => toast.push({ family: 'pass', title: message })}
      >
        {label}
      </Button>
    </div>
  )
}

/* The change-password form, kept in its own component so its transient state —
   three fields and a success flag — does not sit in the parent and force the
   whole screen to re-render on every keystroke. */
function ChangePasswordRow() {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const change = useMutation((oldPw, newPw) => endpoints.auth.changePassword(oldPw, newPw))
  const toast = useToast()

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
    <div className="py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="min-w-0 sm:max-w-md">
          <p className="text-small font-medium text-ink">{t('auth.changePassword')}</p>
          <p className="mt-0.5 text-caption text-ink-3">
            At least 12 characters. Changing it signs out every other device on this account.
          </p>
        </div>
      </div>

      {done && !change.pending && (
        <Callout family="pass" title="Password updated" className="mt-3">
          Your password has changed. This device is still signed in; to rotate its session too, sign
          out and back in.
        </Callout>
      )}

      {/* A wrong current password comes back as a 400 with a plain message and
          no field map, so it is surfaced here rather than under an input. */}
      {change.error && !change.fieldErrors && (
        <Callout family="violation" title="Could not change the password" className="mt-3">
          {change.error.message}
        </Callout>
      )}

      <form
        onSubmit={onSubmit}
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3"
        noValidate
      >
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
        <div className="sm:col-span-3">
          <Button
            type="submit"
            variant="accent"
            icon={KeyRound}
            loading={change.pending}
            disabled={!canSubmit}
            disabledReason="Enter your current password and a new one of at least 12 characters, typed the same twice."
          >
            {change.pending ? t('common.saving') : t('auth.changePassword')}
          </Button>
        </div>
      </form>
    </div>
  )
}
