/**
 * Localisation: the dictionary loader, the provider, the hook and the switcher,
 * in one file.
 *
 * Deliberately small. There is no i18n library here because the portal needs
 * three things - lookup by dotted key, `{{token}}` interpolation, and a fallback
 * to English - and a 40 kB dependency to get them would be the larger cost.
 *
 * The fallback rule is the important part. A missing Hindi key resolves to the
 * English string, never to the raw key. Showing `checks.notAssessedReason` on a
 * findings page in front of a shopkeeper is worse than showing English, and a
 * silently blank legal sentence is worse than both.
 */

import { createContext, useCallback, useContext, useMemo } from 'react'
import { useLocalPref } from '../lib/hooks'
import en from './en.json'
import hi from './hi.json'

const DICTS = { en, hi }

export const LOCALES = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'hi', label: 'हिन्दी', short: 'हि' },
]

const I18nContext = createContext(null)

function lookup(dict, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict)
}

function interpolate(str, vars) {
  if (!vars) return str
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] == null ? `{{${k}}}` : String(vars[k])))
}

export function I18nProvider({ children }) {
  const [locale, setLocale] = useLocalPref('locale', 'en')
  const active = DICTS[locale] ? locale : 'en'

  const t = useCallback(
    (key, vars) => {
      const hit = lookup(DICTS[active], key)
      if (typeof hit === 'string') return interpolate(hit, vars)
      const fallback = lookup(en, key)
      if (typeof fallback === 'string') return interpolate(fallback, vars)
      if (import.meta.env.DEV) {
        console.warn(`[i18n] missing key: ${key}`)
      }
      /* Last resort: the leaf of the key, humanised. Never the dotted path. */
      const leaf = key.split('.').pop() ?? key
      return leaf.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
    },
    [active]
  )

  const value = useMemo(
    () => ({ locale: active, setLocale, t, locales: LOCALES }),
    [active, setLocale, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

/** Convenience: `const t = useT()`. */
export function useT() {
  return useI18n().t
}

/**
 * The language switcher. A two-item segmented control rather than a dropdown -
 * with exactly two languages a select adds a click and hides the alternative.
 */
export function LanguageSwitcher({ className }) {
  const { locale, setLocale, t } = useI18n()
  return (
    <div
      role="radiogroup"
      aria-label={t('nav.settings')}
      className={['inline-flex rounded-pill border border-divider bg-surface p-0.5', className]
        .filter(Boolean)
        .join(' ')}
    >
      {LOCALES.map((l) => {
        const on = l.id === locale
        return (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setLocale(l.id)}
            title={l.label}
            className={[
              'min-w-[40px] rounded-pill px-2.5 py-1 text-caption font-semibold transition-colors duration-fast',
              on ? 'bg-accent text-accent-on' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            ].join(' ')}
          >
            {l.short}
          </button>
        )
      })}
    </div>
  )
}
