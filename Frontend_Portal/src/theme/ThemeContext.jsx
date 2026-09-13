import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Sun, Moon } from 'lucide-react'
import { cx } from '../ui'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const stored = localStorage.getItem('nn.theme')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed === 'dark' || parsed === 'light') return parsed
      }
      return 'light'
    } catch {
      return 'light'
    }
  })

  // Apply theme to DOM and persist
  useEffect(() => {
    try {
      localStorage.setItem('nn.theme', JSON.stringify(theme))
    } catch {
      /* ignore storage errors */
    }

    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // Update meta theme-color for browser address bars
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#151b26' : '#eef1f6')
    }
  }, [theme])

  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme === 'dark' ? 'dark' : 'light')
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const isDark = theme === 'dark'

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}

/**
 * Segmented Dark & Bright View toggle button placed in the top header.
 */
export function ThemeToggle({ className }) {
  const { isDark, setTheme } = useTheme()

  return (
    <div
      role="group"
      aria-label="Appearance view"
      className={cx(
        'flex h-9 items-center rounded-pill border border-divider bg-surface-2/60 p-0.5 shadow-xs',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-pressed={!isDark}
        title="Bright view"
        aria-label="Bright view"
        className={cx(
          'grid h-7 w-7 place-items-center rounded-pill transition-all duration-fast',
          !isDark
            ? 'bg-surface text-amber-500 shadow-xs ring-1 ring-divider/60'
            : 'text-ink-3 hover:text-ink'
        )}
      >
        <Sun
          size={14}
          strokeWidth={2}
          className={!isDark ? 'text-amber-500' : 'text-ink-3'}
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-pressed={isDark}
        title="Dark view"
        aria-label="Dark view"
        className={cx(
          'grid h-7 w-7 place-items-center rounded-pill transition-all duration-fast',
          isDark
            ? 'bg-surface text-sky-400 shadow-xs ring-1 ring-divider/60'
            : 'text-ink-3 hover:text-ink'
        )}
      >
        <Moon
          size={14}
          strokeWidth={2}
          className={isDark ? 'text-sky-400' : 'text-ink-3'}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
