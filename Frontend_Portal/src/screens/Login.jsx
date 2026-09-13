/**
 * Login.
 *
 * What this screen deliberately does NOT have, and why each absence is a
 * decision rather than an omission:
 *
 *   No role selector.      Role is a property of the account, decided by the
 *                          server. A dropdown offering "Inspector / Admin" on a
 *                          login form implies the choice is the user's, which is
 *                          both false and an invitation to try the other one.
 *   No statistics.         "12,480 packages checked nationwide" is the kind of
 *                          number that gets screenshotted and quoted. Every
 *                          figure on this screen would be invented, so there are
 *                          none. The left panel explains the four results
 *                          instead - true, and more useful to a first-time user.
 *   No email field.        The backend's LoginRequest takes `employee_id`. A
 *                          Legal Metrology officer has an employee number where
 *                          they may not have a work mailbox. (08 SS4.1 shows an
 *                          email field; the contract wins, and the difference is
 *                          flagged rather than quietly reconciled.)
 *   No "remember me".      The session is a refresh cookie the server controls.
 *                          A checkbox suggesting the device will hold the
 *                          session longer than the server allows would be a lie.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Hash, Lock, WifiOff } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDocumentTitle, useOnlineStatus } from '../lib/hooks'
import { Button, Callout, Eyebrow, Field, Input, cx } from '../ui'

const RULES_AS_AT = import.meta.env.VITE_RULES_AS_AT ?? '2026-07-01'
const ENGINE_VERSION = import.meta.env.VITE_ENGINE_VERSION ?? '2.0.0'

/* The four outcomes, in the words the product uses everywhere else. This panel
   is the one place a new officer learns that "not assessed" is a real answer and
   not a loading state - which is the single most important idea in the product. */
const OUTCOMES = [
  {
    key: 'compliant',
    label: 'Success',
    body: 'Every check that could be assessed on the captured evidence passed.',
    tone: 'var(--nn-pass-graphic)',
    glyph: '✓',
  },
  {
    key: 'violation',
    label: 'Violation',
    body: 'A declaration duty was not met, with the provision and the measurement stated.',
    tone: 'var(--nn-violation-graphic)',
    glyph: '✕',
  },
  {
    key: 'not_assessed',
    label: 'Not assessed',
    body: 'The evidence did not settle it. Neither a pass nor a violation, and never silently either.',
    tone: 'var(--nn-na-graphic)',
    glyph: '?',
  },
  {
    key: 'out_of_scope',
    label: 'Out of scope',
    body: 'The Rules do not reach this package, so no declaration duty arises against it.',
    tone: 'var(--nn-na-graphic)',
    glyph: '—',
  },
]

function Mark({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M2.5 16C6.6 9.8 11.1 6.7 16 6.7S25.4 9.8 29.5 16C25.4 22.2 20.9 25.3 16 25.3S6.6 22.2 2.5 16Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="4.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 1.8v3.4M16 26.8v3.4" stroke="var(--nn-saffron)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export default function Login() {
  const { login, sessionEnded, dismissSessionEnded } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const online = useOnlineStatus()
  useDocumentTitle(t('auth.signIn'))

  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const idRef = useRef(null)

  useEffect(() => {
    idRef.current?.focus()
  }, [])

  const from = location.state?.from?.pathname

  async function onSubmit(e) {
    e.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)
    try {
      const user = await login(employeeId.trim(), password)
      dismissSessionEnded()
      /* Navigate explicitly rather than leaning on the public-only guard, so an
         officer who followed a deep link lands on the page they asked for. */
      const target = from && from !== '/login' ? from : user.role === 'admin' ? '/admin' : '/inspector'
      navigate(target, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  const fieldErrors = error?.fields ?? null

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      {/* ------------------------------------------------------------ panel -- */}
      <section className="relative hidden overflow-hidden bg-brand px-10 py-12 text-ink-inverse lg:flex lg:flex-col lg:justify-between xl:px-16">
        {/* A single large watermark of the mark, cropped. Decoration that is
            still the product's own shape rather than a stock gradient blob. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-24 opacity-[0.07]"
        >
          <svg width="420" height="420" viewBox="0 0 32 32" fill="none">
            <path
              d="M2.5 16C6.6 9.8 11.1 6.7 16 6.7S25.4 9.8 29.5 16C25.4 22.2 20.9 25.3 16 25.3S6.6 22.2 2.5 16Z"
              stroke="#FFFFFF"
              strokeWidth="1.2"
            />
            <circle cx="16" cy="16" r="4.4" stroke="#FFFFFF" strokeWidth="1.2" />
          </svg>
        </span>

        <div className="relative">
          <div className="flex items-center gap-4">
            <span className="text-saffron-on-navy">
              <Mark />
            </span>
            <div>
              <p className="text-h1 font-bold tracking-[-0.01em]">NiyamNetra</p>
              <p className="nn-eyebrow text-[rgba(255,255,255,0.66)]">{t('app.tagline')}</p>
            </div>
          </div>

          <h1 className="mt-12 max-w-[24ch] text-display leading-[1.15]">
            Nineteen checks, in the order the Rules apply them.
          </h1>
          <p className="mt-4 max-w-prose text-body text-[rgba(255,255,255,0.82)]">
            Eighteen of them are assessable and count towards the result. The nineteenth is
            the Section 36 tier, derived from the rest, so it is shown and never counted.
          </p>
        </div>

        <div className="relative mt-12">
          <Eyebrow className="text-[rgba(255,255,255,0.6)]">Every scan ends in one of four states</Eyebrow>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {OUTCOMES.map((o) => (
              <li
                key={o.key}
                className="rounded-card border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.06)] p-4"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="nn-mono grid h-7 w-7 shrink-0 place-items-center rounded-pill border-2 text-[12px] font-bold"
                    style={{ borderColor: o.tone, color: o.tone }}
                    aria-hidden="true"
                  >
                    {o.glyph}
                  </span>
                  <span className="text-small font-semibold">{o.label}</span>
                </div>
                <p className="mt-2 text-caption leading-5 text-[rgba(255,255,255,0.74)]">{o.body}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <p className="nn-eyebrow text-[rgba(255,255,255,0.6)]">Rules as at</p>
              <p className="nn-mono text-small font-medium">{RULES_AS_AT}</p>
            </div>
            <div>
              <p className="nn-eyebrow text-[rgba(255,255,255,0.6)]">Engine</p>
              <p className="nn-mono text-small font-medium">{ENGINE_VERSION}</p>
            </div>
            <div>
              <p className="nn-eyebrow text-[rgba(255,255,255,0.6)]">Assessable checks</p>
              <p className="nn-mono text-small font-medium">18</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- form -- */}
      <section className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[400px]">
          {/* Compact brand for the single-column layout. */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="text-navy">
              <Mark size={34} />
            </span>
            <div>
              <p className="text-h2 font-bold text-ink">NiyamNetra</p>
              <p className="nn-eyebrow">{t('app.tagline')}</p>
            </div>
          </div>

          <Eyebrow>{t('auth.signIn')}</Eyebrow>
          <h2 className="mt-1.5 text-h1 text-ink">Sign in to the portal</h2>
          <p className="mt-2 text-small text-ink-2">
            Use the employee ID issued by your Legal Metrology office.
          </p>

          {sessionEnded && (
            <Callout family="review" title="Your session has ended" className="mt-5">
              {t('auth.sessionEnded')}
            </Callout>
          )}

          {!online && (
            <Callout family="review" title={t('common.offline')} icon={WifiOff} className="mt-5">
              Signing in needs a connection. Inspections already captured on this device are
              safe and will sync once you are back online.
            </Callout>
          )}

          {error && !fieldErrors && (
            <Callout family="violation" title="Could not sign in" className="mt-5">
              {error.message}
            </Callout>
          )}

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <Field
              label={t('auth.employeeId')}
              hint={t('auth.employeeIdHint')}
              error={fieldErrors?.employee_id}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  ref={idRef}
                  name="employee_id"
                  icon={Hash}
                  autoComplete="username"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="LM-XX-0000"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                />
              )}
            </Field>

            <Field label={t('auth.password')} error={fieldErrors?.password} required>
              {(props) => (
                <div className="relative">
                  <Input
                    {...props}
                    name="password"
                    icon={Lock}
                    type={reveal ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="pr-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {/* Reveal is a genuine accessibility feature on a phone
                      keyboard in bright sun, and it is the officer's own
                      password on their own screen. */}
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    aria-label={reveal ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-sm text-ink-3 hover:text-ink-2"
                  >
                    {reveal ? (
                      <EyeOff size={18} strokeWidth={1.8} aria-hidden="true" />
                    ) : (
                      <Eye size={18} strokeWidth={1.8} aria-hidden="true" />
                    )}
                  </button>
                </div>
              )}
            </Field>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={pending}
              iconRight={pending ? undefined : ArrowRight}
              disabled={!online || employeeId.trim() === '' || password === ''}
              disabledReason={
                !online
                  ? 'Signing in needs a connection.'
                  : 'Enter your employee ID and password.'
              }
              className="mt-2"
            >
              {pending ? t('auth.signingIn') : t('auth.signIn')}
            </Button>

          </form>

          <p className="mt-5 text-caption text-ink-3">{t('auth.deviceBound')}</p>

          {import.meta.env.DEV && <DevHint />}

          <div className="nn-rule-line my-7" />

          {/* Verbatim, and last. This sentence is the boundary of the product's
              authority and must not be paraphrased. */}
          <p className="max-w-prose text-caption leading-5 text-ink-3">{t('app.footer')}</p>

          <p className="mt-3 text-caption text-ink-3">
            Trouble signing in? Contact your administrator — password resets and device
            releases are done by them, not on this screen.{' '}
            <Link to="/settings" className="text-accent-text underline decoration-dotted">
              Account settings
            </Link>{' '}
            are available once you are signed in.
          </p>
        </div>
      </section>
    </div>
  )
}

/**
 * Development-only. Shows the employee IDs that Backend/seed.py creates - and
 * pointedly not a password, because seed.py reads SEED_PASSWORD from the
 * environment and refuses to run without it, precisely so no literal password
 * exists in the repository. Printing a guess here would undo that.
 */
function DevHint() {
  const rows = [
    ['LM-ADM-001', 'Seed Administrator', 'admin'],
    ['LM-TG-1042', 'Inspector One', 'inspector'],
    ['LM-TG-1043', 'Inspector Two', 'inspector'],
  ]
  return (
    <div className={cx('mt-6 rounded-card border border-info-border bg-info-fill p-4')}>
      <Eyebrow className="text-info-text">Development build only</Eyebrow>
      <p className="mt-1.5 text-caption text-info-text">
        Accounts created by <span className="nn-mono">Backend/seed.py</span>. The password is
        whatever <span className="nn-mono">SEED_PASSWORD</span> was set to when you seeded;
        it is not stored in the repository and is not shown here.
      </p>
      <ul className="mt-3 flex flex-col gap-1">
        {rows.map(([id, name, role]) => (
          <li key={id} className="flex items-baseline gap-2 text-caption text-info-text">
            <span className="nn-mono font-semibold">{id}</span>
            <span className="text-ink-3">·</span>
            <span>{name}</span>
            <span className="nn-mono text-[11px] uppercase tracking-wider text-ink-3">{role}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-ink-3">
        Seed emails use <span className="nn-mono">@example.test</span>, a reserved domain that
        cannot receive mail.
      </p>
    </div>
  )
}
