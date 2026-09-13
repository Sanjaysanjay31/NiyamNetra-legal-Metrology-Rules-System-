/**
 * Entry point.
 *
 * Provider order is not arbitrary:
 *
 *   ErrorBoundary   outermost, so a crash inside any provider still renders a
 *                   readable page instead of a white screen. A field officer
 *                   with a blank screen has no way to report what happened.
 *   ThemeProvider   sets data-theme/data-accent on <html>. Nothing below it
 *                   should render before the attributes are correct, and
 *                   index.html has already applied them pre-paint.
 *   I18nProvider    the boot screen and the error page both need `t`.
 *   ToastProvider   above the router, so a toast survives navigation. A "queued
 *                   inspection sent" message must not vanish because the officer
 *                   moved to another screen while it was in flight.
 *   BrowserRouter   above AuthProvider, because the route guards call
 *                   useLocation to remember where the officer was heading.
 *   AuthProvider    innermost of the providers; App consumes it.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme/ThemeContext'
import { ToastProvider } from './ui'
import './index.css'

/**
 * The last line of defence. Deliberately plain: it uses inline styles and the
 * CSS variables directly rather than the component library, because the thing
 * that crashed may well be the component library.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    /* Logged, not sent anywhere. There is no third-party error service in this
       stack and adding one would put inspection screenshots and store names on
       someone else's server. */
    console.error('[NiyamNetra] unhandled error', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--nn-bg, #f8fafc)',
          color: 'var(--nn-text, #0f172a)',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <p
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--nn-text-3, #64748b)',
            }}
          >
            Unexpected error
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 12px' }}>
            The portal stopped unexpectedly
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--nn-text-2, #475569)' }}>
            Nothing you had already submitted is affected. Anything captured but not yet
            sent is still held on this device and will sync when you reload and reconnect.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              overflowX: 'auto',
              fontSize: 12,
              background: 'var(--nn-surface-sunken, #f1f5f9)',
              color: 'var(--nn-text-2, #475569)',
            }}
          >
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              height: 48,
              padding: '0 24px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 600,
              background: 'var(--nn-navy, #0f2a44)',
              color: '#ffffff',
            }}
          >
            Reload the portal
          </button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <BrowserRouter>
              <AuthProvider>
                <ThemeProvider>
                  <App />
                </ThemeProvider>
              </AuthProvider>
            </BrowserRouter>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
