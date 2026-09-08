/**
 * InspectorProfile — Official profile and credential view for the field officer.
 *
 * Displays government credentials, jurisdictional assignment, assigned enforcement
 * sector in Hyderabad North, registered device binding, and security controls
 * including password change and session termination.
 */

import { useState } from 'react'
import {
  ShieldCheck,
  UserRound,
  Building2,
  MapPin,
  Smartphone,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  Calendar,
  CheckCircle2,
  FileCheck2,
  Award,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDocumentTitle, useMutation } from '../lib/hooks'
import { endpoints } from '../api/client'
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

function StatusPill({ children, variant = 'pass' }) {
  const styles = {
    pass: 'bg-pass-fill text-pass-text border-pass-border',
    info: 'bg-info-fill text-info-text border-info-border',
    violation: 'bg-violation-fill text-violation-text border-violation-border',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold border ${
        styles[variant] || styles.pass
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

export default function InspectorProfile() {
  const { user, installId, logout } = useAuth()
  const toast = useToast()
  useDocumentTitle('Officer Profile — NiyamNetra')

  const displayName = user?.full_name || 'Inspector One'
  const displayId = user?.employee_id || 'LM-TG-1042'
  const displayJurisdiction = user?.jurisdiction || 'Hyderabad North'

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Legal Metrology Department"
        title="Officer Profile"
        subtitle="Credentials, jurisdictional assignments, and security settings for this enforcement terminal."
      />

      {/* ---- Profile Hero Card ---- */}
      <Card className="mt-6 p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy text-xl font-bold tracking-wider text-saffron-on-navy shadow-sm ring-4 ring-rail/10">
              IO
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-h2 font-bold text-ink">{displayName}</h2>
                <StatusPill variant="pass">Active Enforcement Officer</StatusPill>
              </div>
              <p className="nn-mono mt-1 text-caption text-ink-3">
                Officer ID: <span className="font-semibold text-ink-2">{displayId}</span>
              </p>
              <p className="mt-1 text-small text-ink-2">
                Legal Metrology Inspector (Senior Grade) • Government of Telangana
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-caption text-ink-3">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-saffron" aria-hidden="true" />
                  {displayJurisdiction} (Zone 4)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={14} aria-hidden="true" />
                  Appointed: 14 January 2024
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-row gap-2 sm:flex-col sm:items-end">
            <Button
              variant="outline"
              icon={LogOut}
              onClick={() => logout()}
              className="text-violation-text hover:bg-violation-fill"
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Quick Enforcement Metrics */}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-divider pt-6 sm:grid-cols-4">
          <div className="rounded-md bg-surface-2 p-3 text-center">
            <p className="nn-eyebrow text-ink-3">Total Inspections</p>
            <p className="nn-mono text-h2 font-bold text-ink">128</p>
            <p className="text-[11px] text-ink-3">Recorded to date</p>
          </div>
          <div className="rounded-md bg-surface-2 p-3 text-center">
            <p className="nn-eyebrow text-ink-3">Compliant</p>
            <p className="nn-mono text-h2 font-bold text-pass-text">94</p>
            <p className="text-[11px] text-pass-text">73.4% rate</p>
          </div>
          <div className="rounded-md bg-surface-2 p-3 text-center">
            <p className="nn-eyebrow text-ink-3">Violations Noticed</p>
            <p className="nn-mono text-h2 font-bold text-violation-text">27</p>
            <p className="text-[11px] text-violation-text">Notices issued</p>
          </div>
          <div className="rounded-md bg-surface-2 p-3 text-center">
            <p className="nn-eyebrow text-ink-3">Assigned Units</p>
            <p className="nn-mono text-h2 font-bold text-saffron">6</p>
            <p className="text-[11px] text-ink-3">Retail & wholesale</p>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---- Station & Officer Details ---- */}
        <Card className="p-5 sm:p-6">
          <SectionTitle caption="Official identity registered with the State Legal Metrology Department.">
            <span className="inline-flex items-center gap-2">
              <Building2 size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
              Department & Station
            </span>
          </SectionTitle>

          <div className="mt-4 space-y-3 divide-y divide-divider text-small">
            <div className="pt-2 first:pt-0">
              <p className="nn-eyebrow">Department</p>
              <p className="mt-0.5 font-medium text-ink">
                Department of Legal Metrology, Government of Telangana
              </p>
            </div>
            <div className="pt-3">
              <p className="nn-eyebrow">Zonal Office</p>
              <p className="mt-0.5 font-medium text-ink">
                Musheerabad Zonal Headquarters, Hyderabad — 500020
              </p>
            </div>
            <div className="pt-3">
              <p className="nn-eyebrow">Official Email</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-medium text-ink">
                <Mail size={14} className="text-ink-3" />
                inspector1.lm@telangana.gov.in
              </p>
            </div>
            <div className="pt-3">
              <p className="nn-eyebrow">Official Contact</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-medium text-ink">
                <Phone size={14} className="text-ink-3" />
                +91 94401 02845
              </p>
            </div>
            <div className="pt-3">
              <p className="nn-eyebrow">Reporting Authority</p>
              <p className="mt-0.5 font-medium text-ink">
                Joint Controller of Legal Metrology (Enforcement), Hyderabad Zone
              </p>
            </div>
          </div>
        </Card>

        {/* ---- Jurisdictional Boundaries ---- */}
        <Card className="p-5 sm:p-6">
          <SectionTitle caption="Territorial jurisdiction under the Legal Metrology Act, 2009.">
            <span className="inline-flex items-center gap-2">
              <MapPin size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
              Jurisdiction & Sector
            </span>
          </SectionTitle>

          <div className="mt-4 space-y-3 divide-y divide-divider text-small">
            <div className="pt-2 first:pt-0">
              <p className="nn-eyebrow">Assigned Circle</p>
              <p className="mt-0.5 font-medium text-ink">
                Hyderabad North Zone — Sector 4
              </p>
            </div>
            <div className="pt-3">
              <p className="nn-eyebrow">Covered Localities</p>
              <p className="mt-0.5 text-ink-2">
                Begumpet, Secunderabad Station Road, Malkajgiri, Ranigunj Commercial Belt, General Bazaar
              </p>
            </div>
            <div className="pt-3">
              <p className="nn-eyebrow">Statutory Authority</p>
              <p className="mt-0.5 text-ink-2">
                Standards of Weights & Measures (Packaged Commodities) Rules, 2011 (Rules 4, 6, 7, 8, 9, 10, 11, 13, 14, 18, 23).
              </p>
            </div>
            <div className="pt-3">
              <p className="nn-eyebrow">Assigned Inspection Quota</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-medium text-ink">September 2026 Progress</span>
                <span className="nn-mono font-semibold text-pass-text">20 / 25 completed (80%)</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-pass" style={{ width: '80%' }} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ---- Device & Security Binding ---- */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <SectionTitle caption="Cryptographic terminal authorization for official inspection records.">
            <span className="inline-flex items-center gap-2">
              <Smartphone size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
              Authorized Mobile Terminal
            </span>
          </SectionTitle>

          <div className="mt-4 space-y-3 text-small">
            <div className="flex items-center justify-between rounded-md bg-surface-2 p-3">
              <div>
                <p className="font-medium text-ink">Field Scanning Device</p>
                <p className="text-caption text-ink-3">Samsung Galaxy XCover Pro (Enforcement Model)</p>
              </div>
              <StatusPill variant="pass">Paired</StatusPill>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
              <MetaStat
                label="Terminal Install ID"
                value={<span className="nn-mono text-xs">{installId || 'inst-tg-north-1042'}</span>}
              />
              <MetaStat
                label="Keystore Security"
                value="Hardware TPM 2.0"
              />
              <MetaStat
                label="Clock Skew Threshold"
                value="< 1.2s against UTC"
              />
              <MetaStat
                label="Geofence Accuracy"
                value="Dual-Band GNSS (±3m)"
              />
            </div>
          </div>
        </Card>

        {/* Change Password Card */}
        <InspectorPasswordForm toast={toast} />
      </div>

      {/* ---- Statutory Notice ---- */}
      <Callout family="info" title="Official Records & Integrity Notice" icon={ShieldCheck} className="mt-6">
        Every inspection report generated under Officer ID {displayId} is cryptographically sealed with
        SHA-256 digests and timestamped against the state master clock. Modifications to recorded violations
        or shop verification data require authorization from the State Metrology Review Board.
      </Callout>
    </div>
  )
}

function InspectorPasswordForm({ toast }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const change = useMutation((oldPw, newPw) => endpoints.auth.changePassword(oldPw, newPw))

  const tooShort = next.length > 0 && next.length < 12
  const mismatch = confirm.length > 0 && next !== confirm
  const sameAsOld = next.length > 0 && current.length > 0 && next === current
  const canSubmit =
    current.length >= 8 && next.length >= 12 && next === confirm && next !== current && !change.pending

  const newError =
    change.fieldErrors?.new_password ??
    (tooShort ? 'Must be at least 12 characters.' : sameAsOld ? 'Must be different from old password.' : undefined)
  const confirmError = mismatch ? 'Passwords do not match.' : undefined

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
        title: 'Credentials updated',
        body: 'Your portal password has been changed successfully.',
      })
    } catch {
      // Handled by change.error
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle caption="Update portal login password. Minimum 12 characters required.">
        <span className="inline-flex items-center gap-2">
          <KeyRound size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
          Change Password
        </span>
      </SectionTitle>

      {done && !change.pending && (
        <Callout family="pass" title="Password updated" className="mt-4">
          Your credentials have been updated securely.
        </Callout>
      )}

      {change.error && !change.fieldErrors && (
        <Callout family="violation" title="Update failed" className="mt-4">
          {change.error.message}
        </Callout>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <Field label="Current Password" required>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="••••••••••••"
          />
        </Field>

        <Field label="New Password" required error={newError}>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="At least 12 characters"
          />
        </Field>

        <Field label="Confirm New Password" required error={confirmError}>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat new password"
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          icon={KeyRound}
          disabled={!canSubmit}
          disabledReason={
            current.length < 8
              ? 'Enter your current password (at least 8 characters).'
              : next.length < 12
              ? 'New password must be at least 12 characters.'
              : next === current
              ? 'New password must be different from current password.'
              : next !== confirm
              ? 'New password and confirmation must match.'
              : undefined
          }
          loading={change.pending}
          className="w-full"
        >
          Update Password
        </Button>
      </form>
    </Card>
  )
}
