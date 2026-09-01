/**
 * Theme: light / dark / system, plus an optional accent.
 *
 * Everything the theme needs is in this one file - the provider, the hook, the
 * mode switcher and the accent picker - because they are a single concern and
 * splitting them across four files only means four files to keep in agreement.
 *
 * The mechanism is deliberately not Tailwind's `dark:` variant. Flipping
 * `data-theme` on <html> re-resolves every custom property at once, so a
 * component carries one set of classes and cannot be half-converted. index.html
 * runs the same resolution before first paint, so there is no light flash.
 *
 * Note what is stored: 'light' | 'dark' | 'system', not the resolved value. If
 * the resolved value were persisted, a user on 'system' who switched their OS
 * theme overnight would come back to yesterday's appearance.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'

const MODE_KEY = 'nn.theme'
const ACCENT_KEY = 'nn.accent'

export const THEME_MODES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
]

/* Four accents, each measured in both themes in theme/tokens.css. `swatch` is
   the light graphic tone, used for the picker chip itself. */
export const ACCENTS = [
  { id: 'teal', label: 'Netra Teal', swatch: '#0E7490', dark: '#22B8D4' },
  { id: 'saffron', label: 'Saffron', swatch: '#D97706', dark: '#F59E0B' },
  { id: 'indigo', label: 'Indigo', swatch: '#7C3AED', dark: '#A78BFA' },
  { id: 'green', label: 'Evergreen', swatch: '#047857', dark: '#10B981' },
]

const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStored(key, allowed, fallback) {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v) ? v : fallback
  } catch {
    return fallback // private mode, or storage disabled
  }
}

function prefersDark() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(DARK_QUERY).matches
    : false
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() =>
    readStored(MODE_KEY, ['light', 'dark', 'system'], 'system')
  )
  const [accent, setAccent] = useState(() =>
    readStored(
      ACCENT_KEY,
      ACCENTS.map((a) => a.id),
      'teal'
    )
  )
  const [systemDark, setSystemDark] = useState(prefersDark)

  /* Follow the OS while on 'system'. The listener is registered regardless of
     mode so that switching back to 'system' is instant rather than waiting for
     the next OS change. addEventListener is guarded: older Safari only has
     addListener. */
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = (e) => setSystemDark(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolved)
    /* colorScheme makes the browser's own chrome - scrollbars, form controls,
       the autofill overlay - match. Without it a dark page gets a white
       date-picker panel. */
    root.style.colorScheme = resolved
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0A1120' : '#0F2A44')
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      /* preference simply will not persist; the interface still works */
    }
  }, [mode, resolved])

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent)
    try {
      localStorage.setItem(ACCENT_KEY, accent)
    } catch {
      /* as above */
    }
  }, [accent])

  const cycle = useCallback(() => {
    setMode((m) => (m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light'))
  }, [])

  const value = useMemo(
    () => ({ mode, setMode, cycle, accent, setAccent, resolved, isDark: resolved === 'dark' }),
    [mode, cycle, accent, resolved]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

/* ---------------------------------------------------------------------------
   ThemeSwitcher - a three-way segmented control.
   A segmented control rather than a single toggle button, because 'system' is
   not a state a two-way toggle can express: a user on System cannot tell,
   from a sun/moon button, whether they are on Light or on System-resolving-light.
   Rendered as radios so a screen reader announces the group and the selection.
   --------------------------------------------------------------------------- */
export function ThemeSwitcher({ compact = false }) {
  const { mode, setMode } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-1 rounded-pill border border-divider bg-surface-2 p-1"
    >
      {THEME_MODES.map(({ id, label, icon: Icon }) => {
        const active = mode === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(id)}
            title={`${label} theme`}
            className={[
              'inline-flex min-h-touch items-center gap-2 rounded-pill px-3 text-small font-semibold',
              'transition-colors duration-fast ease-settle',
              active
                ? 'bg-accent text-accent-on shadow-card'
                : 'text-ink-3 hover:bg-surface hover:text-ink-2',
              compact ? 'min-h-[36px] px-2' : '',
            ].join(' ')}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            {!compact && <span>{label}</span>}
            {compact && <span className="sr-only-nn">{label}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------------------
   AccentPicker - four chips. The accent is presentation only; it never encodes
   a verdict, so choosing Saffron cannot be mistaken for "review". That is why
   the verdict families in tokens.css are fixed and are not derived from it.
   --------------------------------------------------------------------------- */
export function AccentPicker({ label = 'Accent' }) {
  const { accent, setAccent, isDark } = useTheme()
  return (
    <div>
      {label && <p className="nn-eyebrow mb-2">{label}</p>}
      <div role="radiogroup" aria-label="Accent colour" className="flex items-center gap-2">
        {ACCENTS.map((a) => {
          const active = accent === a.id
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setAccent(a.id)}
              title={a.label}
              className={[
                'relative grid h-11 w-11 place-items-center rounded-pill',
                'transition-transform duration-fast ease-settle hover:scale-105',
              ].join(' ')}
            >
              <span
                className="grid h-6 w-6 place-items-center rounded-pill"
                style={{
                  background: isDark ? a.dark : a.swatch,
                  /* The ring is drawn in the swatch's own colour at low alpha,
                     so the selected chip reads as selected without a second hue
                     entering the interface. */
                  boxShadow: active
                    ? `0 0 0 3px var(--nn-surface), 0 0 0 5px ${isDark ? a.dark : a.swatch}`
                    : 'none',
                }}
              >
                {active && (
                  <Check
                    size={14}
                    strokeWidth={2.4}
                    aria-hidden="true"
                    style={{ color: a.id === 'saffron' && !isDark ? '#0F172A' : '#FFFFFF' }}
                  />
                )}
              </span>
              <span className="sr-only-nn">{a.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
