/**
 * Login.
 *
 * Intentionally minimal: the title, the mark, and the form. Anything else
 * the user can learn by signing in.
 */

import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Hash, Lock, WifiOff } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDocumentTitle, useOnlineStatus } from '../lib/hooks'
import { Button, Callout, Field, Input } from '../ui'

function Mark({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* post */}
      <path d="M16 4.5v19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* top finial */}
      <circle cx="16" cy="4" r="1.2" fill="currentColor" />
      {/* horizontal beam */}
      <path d="M5 9.5h22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* pivot dot */}
      <circle cx="16" cy="9.5" r="1" fill="currentColor" />
      {/* left chain + pan */}
      <path
        d="M6 9.5l-2 6h6l-2-6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M3 17c0 1.7 1.6 3 3.5 3s3.5-1.3 3.5-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* right chain + pan */}
      <path
        d="M26 9.5l-2 6h6l-2-6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M23 17c0 1.7 1.6 3 3.5 3s3.5-1.3 3.5-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* base */}
      <path d="M11 26h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 28h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
    <div className="min-h-screen bg-canvas">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="nn-card w-full max-w-[560px] p-8 sm:p-12">
          <div className="mb-10 flex flex-col items-center gap-5 text-center">
            <span className="text-navy">
              <Mark size={84} />
            </span>
            <div>
              <p className="text-h1 font-bold tracking-[-0.01em] text-ink">NiyamNetra</p>
              <p className="nn-eyebrow mt-1 text-ink-3">{t('app.tagline')}</p>
            </div>
          </div>

          {sessionEnded && (
            <Callout family="review" title="Your session has ended" className="mb-5">
              {t('auth.sessionEnded')}
            </Callout>
          )}

          {!online && (
            <Callout family="review" title={t('common.offline')} icon={WifiOff} className="mb-5">
              Signing in needs a connection. Inspections already captured on this device are
              safe and will sync once you are back online.
            </Callout>
          )}

          {error && !fieldErrors && (
            <Callout family="violation" title="Could not sign in" className="mb-5">
              {error.message}
            </Callout>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
        </div>
      </section>
    </div>
  )
}
