/**
 * InspectorProfile / InspectorSettings — The Inspector's Settings & Account Center.
 *
 * Implements a clean, simplified government settings experience:
 * 1. Page Header:
 *    - Eyebrow: 'SETTINGS' in saffron accent.
 *    - Heading: 'Settings'.
 *    - Subtitle: 'Manage your portal preferences and account settings.'
 * 2. Account Information:
 *    - Fetched live from /auth/me with fallback to authenticated session.
 *    - Inspector Name, Officer ID, Role, Assigned Jurisdiction, Email (if available).
 *    - Account Status: 'Active' / 'Inactive' badge.
 *    - Clean loading spinner / skeleton and error message states.
 * 3. Portal Preferences:
 *    - Theme / Appearance: Light / Dark mode toggle using existing ThemeContext.
 *    - Language: English / Hindi toggle using existing useI18n.
 *    - Notification preference: Inspection sync alert switch.
 * 4. Change Password:
 *    - Connected to existing backend API: endpoints.auth.changePassword.
 *    - Password strength verification (>= 12 chars, letter & digit).
 *    - Match validation, clear error messages, and success handling.
 * 5. Active Session & Security:
 *    - Active session confirmation and Sign Out action.
 *    - No technical clutter, no device hardware specs, no fake cryptographic details.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDocumentTitle, useLocalPref } from '../lib/hooks'
import { useTheme } from '../theme/ThemeContext'
import {
  Button,
  Callout,
  Card,
  Field,
  Input,
  Spinner,
  cx,
  useToast,
} from '../ui'

export default function InspectorProfile() {
  const { t, locale, setLocale } = useI18n()
  const { user: authUser, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  useDocumentTitle('Settings · NiyamNetra')

  // Live profile data from /auth/me
  const [profile, setProfile] = useState(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [profileError, setProfileError] = useState(null)

  const fetchProfile = useCallback(async () => {
    setIsLoadingProfile(true)
    setProfileError(null)
    try {
      const data = await endpoints.auth.me()
      setProfile(data)
    } catch (err) {
      // If offline or request fails, fallback gracefully to authenticated context
      if (authUser) {
        setProfile(authUser)
      } else {
        setProfileError(
          err?.response?.data?.detail || err?.message || 'Unable to retrieve account details.'
        )
      }
    } finally {
      setIsLoadingProfile(false)
    }
  }, [authUser])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Notification Preferences (device-local)
  const [notifySync, setNotifySync] = useLocalPref('pref.notify.sync', true)

  // Change Password Form State
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [passwordError, setPasswordError] = useState(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Merged user object
  const currentUser = profile || authUser
  const displayName = currentUser?.full_name || 'Inspector'
  const displayId = currentUser?.employee_id || '—'
  const displayJurisdiction = currentUser?.jurisdiction || 'All Jurisdictions'
  const displayRole =
    currentUser?.role === 'inspector'
      ? 'Legal Metrology Inspector'
      : currentUser?.role === 'admin'
        ? 'Administrator'
        : currentUser?.role || 'Inspector'
  const displayEmail = currentUser?.email || null
  const isActive = currentUser?.is_active !== false

  // Handle real password update
  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    if (!oldPassword) {
      setPasswordError('Please enter your current password.')
      return
    }

    if (newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters long.')
      return
    }

    const hasLetter = /[A-Za-z]/.test(newPassword)
    const hasDigit = /[0-9]/.test(newPassword)
    if (!hasLetter || !hasDigit) {
      setPasswordError('New password must contain at least one letter and one number.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }

    setIsUpdating(true)
    try {
      await endpoints.auth.changePassword(oldPassword, newPassword)
      setPasswordSuccess(true)
      toast.push({
        family: 'pass',
        title: 'Password Updated',
        body: 'Your account password has been updated successfully.',
      })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to update password. Please check your current password.'
      setPasswordError(msg)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSignOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-[960px] pb-14">
      {/* ------------------------------------------------------------------ */}
      {/* 1. PAGE HEADER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-b border-divider pb-5">
        <p className="nn-eyebrow text-saffron">SETTINGS</p>
        <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">
          Settings
        </h1>
        <p className="mt-1 text-small text-ink-2">
          Manage your portal preferences and account settings.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {/* ------------------------------------------------------------------ */}
        {/* 2. ACCOUNT INFORMATION CARD                                        */}
        {/* ------------------------------------------------------------------ */}
        <Card className="p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy/10 text-navy dark:bg-accent-soft dark:text-accent-text">
                <User size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-[16px] font-bold text-ink">Account Information</h2>
                <p className="text-[12px] text-ink-3">Official credentials registered for your account</p>
              </div>
            </div>

            {/* Account Status Badge */}
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-pass-border bg-pass-fill px-3 py-1 text-[11px] font-semibold text-pass-text">
                <CheckCircle size={12} strokeWidth={2.4} aria-hidden="true" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
                <AlertCircle size={12} strokeWidth={2.4} aria-hidden="true" />
                Inactive
              </span>
            )}
          </div>

          {/* Loading / Error States */}
          {isLoadingProfile && !currentUser && (
            <div className="flex items-center justify-center gap-2 py-8 text-small text-ink-3">
              <Spinner size="sm" />
              <span>Loading account information...</span>
            </div>
          )}

          {profileError && !currentUser && (
            <div className="py-4">
              <Callout family="violation" title="Unable to load account information">
                {profileError}
              </Callout>
              <div className="mt-3">
                <Button variant="secondary" icon={RefreshCw} onClick={fetchProfile}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          {currentUser && (
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <p className="text-caption font-medium text-ink-3">Inspector Name</p>
                <p className="mt-1 text-[15px] font-semibold text-ink">{displayName}</p>
              </div>

              <div>
                <p className="text-caption font-medium text-ink-3">Inspector ID</p>
                <p className="nn-mono mt-1 text-[15px] font-semibold text-ink">{displayId}</p>
              </div>

              <div>
                <p className="text-caption font-medium text-ink-3">Role</p>
                <p className="mt-1 text-[15px] font-medium text-ink">{displayRole}</p>
              </div>

              <div>
                <p className="text-caption font-medium text-ink-3">Assigned Region / Jurisdiction</p>
                <p className="mt-1 flex items-center gap-1.5 text-[15px] font-medium text-ink">
                  <MapPin size={14} className="text-saffron shrink-0" aria-hidden="true" />
                  {displayJurisdiction}
                </p>
              </div>

              {/* Email (only displayed if genuinely available) */}
              {displayEmail && (
                <div className="sm:col-span-2">
                  <p className="text-caption font-medium text-ink-3">Email</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[14px] text-ink-2">
                    <Mail size={14} className="text-ink-3 shrink-0" aria-hidden="true" />
                    {displayEmail}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* 3. PORTAL PREFERENCES CARD                                         */}
        {/* ------------------------------------------------------------------ */}
        <Card className="p-6 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-divider pb-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Palette size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-ink">Portal Preferences</h2>
              <p className="text-[12px] text-ink-3">Customize display theme and local portal behavior</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col divide-y divide-divider text-small">
            {/* Theme Preference */}
            <div className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-ink">Theme / Appearance</p>
                <p className="text-caption text-ink-3">
                  Choose between the light government theme and soft slate dark mode.
                </p>
              </div>

              <div className="inline-flex rounded-lg border border-divider bg-surface p-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',
                    theme === 'light'
                      ? 'bg-navy text-ink-inverse shadow-xs'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  )}
                >
                  <Sun size={14} aria-hidden="true" />
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',
                    theme === 'dark'
                      ? 'bg-[#1e293b] text-white shadow-xs'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  )}
                >
                  <Moon size={14} aria-hidden="true" />
                  Dark
                </button>
              </div>
            </div>

            {/* Language Preference */}
            <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-ink">Portal Language</p>
                <p className="text-caption text-ink-3">
                  Select your preferred interface language.
                </p>
              </div>

              <div className="inline-flex rounded-lg border border-divider bg-surface p-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => setLocale('en')}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',
                    locale === 'en'
                      ? 'bg-navy text-ink-inverse shadow-xs'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  )}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLocale('hi')}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',
                    locale === 'hi'
                      ? 'bg-navy text-ink-inverse shadow-xs'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  )}
                >
                  हिन्दी (Hindi)
                </button>
              </div>
            </div>

            {/* Notification Preference */}
            <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-ink">Inspection Sync Alerts</p>
                <p className="text-caption text-ink-3">
                  Display toast confirmations when inspections synchronize with the server.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notifySync}
                onClick={() => setNotifySync(!notifySync)}
                className={cx(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                  notifySync ? 'bg-navy' : 'bg-surface-3'
                )}
              >
                <span
                  className={cx(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    notifySync ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* 4. CHANGE PASSWORD CARD                                            */}
        {/* ------------------------------------------------------------------ */}
        <Card className="p-6 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-divider pb-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <KeyRound size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-ink">Change Password</h2>
              <p className="text-[12px] text-ink-3">Update your portal login password</p>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="mt-5 flex flex-col gap-4">
            {passwordSuccess && (
              <Callout family="pass" title="Password updated successfully">
                Your password has been changed. Other sessions signed in with this account have been
                logged out.
              </Callout>
            )}

            {passwordError && (
              <Callout family="violation" title="Password update failed">
                {passwordError}
              </Callout>
            )}

            {/* Current Password */}
            <Field label="Current Password" required>
              {(props) => (
                <div className="relative">
                  <Input
                    {...props}
                    type={showOld ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => {
                      setOldPassword(e.target.value)
                      if (passwordSuccess) setPasswordSuccess(false)
                    }}
                    placeholder="Enter your current password"
                    className="pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOld(!showOld)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
                    aria-label={showOld ? 'Hide password' : 'Show password'}
                  >
                    {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              )}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* New Password */}
              <Field
                label="New Password"
                hint="Minimum 12 characters, with at least one letter and one number."
                required
              >
                {(props) => (
                  <div className="relative">
                    <Input
                      {...props}
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value)
                        if (passwordSuccess) setPasswordSuccess(false)
                      }}
                      placeholder="At least 12 characters"
                      className="pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
                      aria-label={showNew ? 'Hide password' : 'Show password'}
                    >
                      {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                )}
              </Field>

              {/* Confirm New Password */}
              <Field label="Confirm New Password" required>
                {(props) => (
                  <div className="relative">
                    <Input
                      {...props}
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        if (passwordSuccess) setPasswordSuccess(false)
                      }}
                      placeholder="Repeat new password"
                      className="pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                )}
              </Field>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                icon={Lock}
                loading={isUpdating}
                disabled={!oldPassword || !newPassword || !confirmPassword}
                disabledReason="Please fill in all password fields."
              >
                Update Password
              </Button>
            </div>
          </form>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* 5. SESSION & SECURITY CARD                                         */}
        {/* ------------------------------------------------------------------ */}
        <Card className="p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <ShieldCheck size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-[16px] font-bold text-ink">Active Session</h2>
                <p className="mt-0.5 text-small text-ink-2">
                  Signed in as <span className="font-semibold text-ink">{displayName}</span> ({displayId})
                </p>
                <p className="mt-0.5 text-caption text-ink-3">
                  To end your inspection session on this terminal, click Sign Out below.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              icon={LogOut}
              onClick={handleSignOut}
              className="self-start border-violation-border text-violation-text hover:bg-violation-fill sm:self-auto"
            >
              Sign Out
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
