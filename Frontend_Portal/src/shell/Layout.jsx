/**
 * The application shell: rail, header, appearance popover and the mobile drawer,
 * all in one file.
 *
 * One shell, every screen. Supports tailored branding, navigation, and header
 * controls for both Admin and Inspector portals.
 *
 * Three key design principles:
 * 1. The active rail item is marked by a 3px indicator and semibold text.
 * 2. The rail collapses smoothly on desktop while preserving muscle memory.
 * 3. Appearance controls provide instant, flash-free theme and accent customisation.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  ChevronLeft,
  ClipboardList,
  FileText,
  Gauge,
  HelpCircle,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Package,
  Palette,
  Scale,
  Settings as SettingsIcon,
  ShieldCheck,
  Store,
  Sun,
  TrendingUp,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { LanguageSwitcher, useI18n } from '../i18n'
import { useDismissOnOutside, useLocalPref, useOnlineStatus } from '../lib/hooks'
import { onQueueChange, queueSummary, startAutoFlush } from '../lib/queue'
import { useTheme, AccentPicker, ThemeSwitcher } from '../theme/ThemeContext'
import { IconButton, SyncBadge, cx, useToast } from '../ui'

const RULES_AS_AT = import.meta.env.VITE_RULES_AS_AT ?? '2026-07-01'
const ENGINE_VERSION = import.meta.env.VITE_ENGINE_VERSION ?? '2.0.0'

/* ------------------------------------------------------------------- marks --- */

/** Admin Emblem: Balance Scale */
function ScaleMark({ size = 28, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M16 4.5v19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="4" r="1.2" fill="currentColor" />
      <path d="M5 9.5h22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="9.5" r="1" fill="currentColor" />
      <path d="M6 9.5l-2 6h6l-2-6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M3 17c0 1.7 1.6 3 3.5 3s3.5-1.3 3.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M26 9.5l-2 6h6l-2-6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M23 17c0 1.7 1.6 3 3.5 3s3.5-1.3 3.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11 26h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 28h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** Inspector Emblem: Eye Caliper */
function CaliperMark({ size = 26, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M2.5 16C6.6 9.8 11.1 6.7 16 6.7S25.4 9.8 29.5 16C25.4 22.2 20.9 25.3 16 25.3S6.6 22.2 2.5 16Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="4.4" stroke="currentColor" strokeWidth="2" />
      <path d="M16 1.8v3.4M16 26.8v3.4" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

const Mark = CaliperMark

/* ------------------------------------------------------------------- nav ---- */

function navFor(role, t) {
  if (role === 'admin') {
    return [
      {
        heading: null,
        items: [
          { to: '/admin', label: t('nav.overview') || t('nav.dashboard') || 'Dashboard', icon: LayoutDashboard, end: true },
          { to: '/admin/inspections', label: t('nav.inspections') || 'Inspections', icon: ClipboardList },
          { to: '/admin/analytics', label: t('nav.analytics') || 'Analytics', icon: TrendingUp },
          { to: '/admin/review-queue', label: t('nav.reviewQueue') || 'Review queue', icon: ListChecks, badge: 'review' },
          { to: '/admin/reports', label: t('nav.reports') || 'Reports', icon: FileText },
        ],
      },
      {
        heading: 'Administration',
        items: [
          { to: '/admin/inspectors', label: t('nav.inspectors') || 'Inspectors', icon: Users },
          { to: '/admin/rules', label: t('nav.rules') || 'Rules', icon: BookOpen },
          { to: '/admin/audit', label: t('nav.audit') || 'Audit logs', icon: ShieldCheck },
          { to: '/settings', label: t('nav.settings') || 'Settings', icon: SettingsIcon },
        ],
      },
    ]
  }
  return [
    {
      heading: null,
      items: [
        { to: '/inspector', label: 'Home', icon: Home, end: true },
        { to: '/inspector/inspections', label: 'Inspections', icon: ClipboardList },
        { to: '/inspector/reports', label: 'Reports', icon: FileText },
        { to: '/inspector/violations', label: 'Violations', icon: AlertTriangle },
        { to: '/inspector/performance', label: 'My Performance', icon: Activity },
        { to: '/inspector/profile', label: 'Profile', icon: UserRound },
        { to: '/settings', label: 'Settings', icon: SettingsIcon },
      ],
    },
  ]
}

/* ------------------------------------------------------------------ brand --- */

function Brand({ collapsed, role }) {
  const isAdmin = role === 'admin'
  const destination = isAdmin ? '/admin' : '/inspector'

  if (collapsed) {
    return (
      <Link
        to={destination}
        className="flex h-16 items-center justify-center border-b border-white/10 text-white focus-visible:outline-offset-[-3px]"
      >
        {isAdmin ? <ScaleMark size={24} className="text-white" /> : <CaliperMark size={24} className="text-white" />}
        <span className="sr-only-nn">NiyamNetra</span>
      </Link>
    )
  }

  return (
    <Link
      to={destination}
      className="flex h-16 items-center gap-2.5 border-b border-white/10 px-4 text-white focus-visible:outline-offset-[-3px]"
    >
      {isAdmin ? (
        <span className="nn-mono grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/10 text-white">
          <ScaleMark size={20} className="text-white" />
        </span>
      ) : (
        <span className="shrink-0 text-white">
          <CaliperMark size={26} className="text-white" />
        </span>
      )}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-white">NiyamNetra</p>
        <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-rail-label">
          {isAdmin ? 'LEGAL METROLOGY DEPARTMENT' : 'COMPLIANCE PORTAL'}
        </p>
      </div>
    </Link>
  )
}

/* ------------------------------------------------------------------- rail --- */

function RailItem({ item, collapsed, badgeValue, onNavigate, role }) {
  const { icon: Icon, label, to, end } = item
  const n = item.badge === 'review' && badgeValue > 0 ? badgeValue : null
  const isAdmin = role === 'admin'

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center gap-3 text-[13px] transition-colors duration-fast ease-settle',
          isAdmin ? 'h-9 rounded-md px-3' : 'h-10 rounded-sm',
          !isAdmin && (collapsed ? 'justify-center px-0' : 'pl-3.5 pr-3'),
          collapsed && isAdmin && 'justify-center px-0',
          isAdmin
            ? isActive
              ? 'bg-[var(--nn-rail-active)] font-semibold text-white shadow-[inset_2px_0_0_0_rgba(255,255,255,0.85)]'
              : 'font-medium text-rail-label hover:bg-white/[0.06] hover:text-white'
            : isActive
              ? 'bg-white/[0.08] font-semibold text-white'
              : 'font-medium text-rail-label hover:bg-white/[0.04] hover:text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cx(
              'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-pill transition-opacity duration-fast',
              isActive ? 'bg-saffron opacity-100' : 'opacity-0'
            )}
          />
          <Icon size={isAdmin ? 17 : 18} strokeWidth={isActive ? 2 : 1.7} aria-hidden="true" className="shrink-0" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
          {!collapsed && n ? (
            <span className="nn-mono rounded-pill bg-saffron px-1.5 py-0.5 text-[11px] font-bold leading-4 text-saffron-ink">
              {n}
            </span>
          ) : null}
          {collapsed && n ? (
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 h-2 w-2 rounded-pill bg-saffron"
            />
          ) : null}
        </>
      )}
    </NavLink>
  )
}

function Rail({ collapsed, onToggle, onNavigate, reviewCount, inDrawer = false }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const role = user?.role
  const isAdmin = role === 'admin'
  const groups = navFor(role, t)
  const navigate = useNavigate()

  const displayName = user?.full_name || (isAdmin ? 'A. Deshmukh' : 'Inspector One')
  const initials =
    displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase() || (isAdmin ? 'AD' : 'IO')

  const roleLabel = isAdmin ? 'Super Administrator' : 'Inspector'

  return (
    <div className="flex h-full flex-col bg-rail">
      <Brand collapsed={collapsed} role={role} />

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Sections">
        {groups.map((g, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-6' : 'mt-2'}>
            {g.heading && !collapsed && (
              <p className="nn-eyebrow px-4 pb-2 text-rail-label">{g.heading}</p>
            )}
            {g.heading && collapsed && <div className="mx-3 mb-2 h-px bg-[rgba(255,255,255,0.12)]" />}
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <RailItem
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  badgeValue={reviewCount}
                  onNavigate={onNavigate}
                  role={role}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Admin profile block — bottom of rail for admin */}
      {isAdmin && !inDrawer && (
        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left',
              'transition-colors duration-fast ease-settle hover:bg-white/[0.06]',
              collapsed && 'justify-center px-0'
            )}
            title={collapsed ? displayName : undefined}
          >
            <span className="nn-mono grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[12px] font-bold text-white">
              {initials}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-4 text-white">
                  {displayName}
                </span>
                <span className="block truncate text-[10px] font-medium uppercase tracking-[0.1em] text-rail-label">
                  {roleLabel}
                </span>
              </span>
            )}
            {!collapsed && (
              <ChevronLeft
                size={14}
                strokeWidth={2}
                aria-hidden="true"
                className="shrink-0 -rotate-180 text-rail-label"
              />
            )}
          </button>
        </div>
      )}

      {/* Provenance stamp */}
      <div className="border-t border-[rgba(255,255,255,0.1)] px-4 py-3">
        {collapsed ? (
          <p className="nn-mono text-center text-[10px] text-rail-label" title={`Rules as at ${RULES_AS_AT} · engine ${ENGINE_VERSION}`}>
            v2
          </p>
        ) : (
          <>
            <p className="nn-eyebrow text-rail-label">Rules as at</p>
            <p className="nn-mono text-caption text-ink-inverse">{RULES_AS_AT}</p>
            <p className="nn-mono mt-1 text-[10px] text-rail-label">engine {ENGINE_VERSION}</p>
          </>
        )}
      </div>

      {/* Collapse button */}
      {!inDrawer && (
        <div className="border-t border-[rgba(255,255,255,0.1)] p-2">
          <button
            type="button"
            onClick={onToggle}
            className={cx(
              'flex min-h-touch w-full items-center gap-3 rounded-sm px-3 text-small font-medium',
              'text-rail-label transition-colors duration-fast ease-settle hover:bg-rail-hover hover:text-ink-inverse',
              collapsed && 'justify-center px-0'
            )}
            aria-expanded={!collapsed}
          >
            <ChevronLeft
              size={18}
              strokeWidth={1.8}
              aria-hidden="true"
              className={cx('transition-transform duration-base ease-settle', collapsed && 'rotate-180')}
            />
            {!collapsed && <span>{t('nav.collapse')}</span>}
            {collapsed && <span className="sr-only-nn">{t('nav.expand')}</span>}
          </button>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------- appearance popover */

function Popover({ open, onClose, labelledBy, children, className }) {
  const ref = useRef(null)
  useDismissOnOutside(ref, onClose, open)
  if (!open) return null
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={labelledBy}
      className={cx(
        'absolute right-0 top-[calc(100%+8px)] z-header w-[300px] animate-fade-rise',
        'rounded-hero border border-divider bg-surface p-4 shadow-modal',
        className
      )}
    >
      {children}
    </div>
  )
}

function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()
  return (
    <div className="relative">
      <IconButton
        icon={Palette}
        label={t('theme.label')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      />
      <Popover open={open} onClose={() => setOpen(false)} labelledBy="appearance-title">
        <p id="appearance-title" className="nn-eyebrow mb-2">
          {t('theme.label')}
        </p>
        <ThemeSwitcher compact />
        <p className="mt-2 text-caption text-ink-3">{t('theme.systemHint')}</p>

        <div className="nn-rule-line my-4" />
        <AccentPicker label={t('theme.accent')} />
        <p className="mt-2 text-caption text-ink-3">
          The accent colours controls and links only. Verdict colours never change, so a
          preference cannot alter how a finding reads.
        </p>

        <div className="nn-rule-line my-4" />
        <p className="nn-eyebrow mb-2">Language</p>
        <LanguageSwitcher />
      </Popover>
    </div>
  )
}

/* ------------------------------------------------------------- user menu ---- */

function UserMenu() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  const signOut = async () => {
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const displayName = user?.full_name || (isAdmin ? 'A. Deshmukh' : 'Inspector One')
  const displayId = user?.employee_id || (isAdmin ? 'LM-ADM-001' : 'LM-TG-1042')
  const initials =
    displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase() || (isAdmin ? 'AD' : 'IO')

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={displayName}
        className="flex min-h-touch items-center gap-2.5 rounded-pill py-1 pl-1 pr-2.5 transition-colors duration-fast hover:bg-surface-2"
      >
        <span className="nn-mono grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-[#0B1524] text-[13px] font-bold text-white shadow-sm">
          {initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-small font-semibold leading-4 text-ink">
            {displayName}
          </span>
          <span className="nn-mono block truncate text-[11px] leading-4 text-ink-3">
            {displayId}
          </span>
        </span>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} labelledBy="user-title" className="w-[260px]">
        <p id="user-title" className="nn-eyebrow">
          Signed in as
        </p>
        <p className="mt-1 text-small font-semibold text-ink">{displayName}</p>
        <p className="nn-mono text-caption text-ink-3">{displayId}</p>
        {user?.jurisdiction && <p className="mt-1 text-caption text-ink-2">{user.jurisdiction}</p>}
        <div className="nn-rule-line my-3" />
        {!isAdmin && (
          <Link
            to="/inspector/profile"
            onClick={() => setOpen(false)}
            className="flex min-h-touch items-center gap-2.5 rounded-sm px-2 text-small font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <UserRound size={17} strokeWidth={1.8} aria-hidden="true" />
            {t('nav.profile')}
          </Link>
        )}
        <Link
          to="/settings"
          onClick={() => setOpen(false)}
          className="flex min-h-touch items-center gap-2.5 rounded-sm px-2 text-small font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <SettingsIcon size={17} strokeWidth={1.8} aria-hidden="true" />
          {t('nav.settings')}
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="flex min-h-touch w-full items-center gap-2.5 rounded-sm px-2 text-small font-medium text-violation-text hover:bg-violation-fill"
        >
          <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />
          {t('nav.signOut')}
        </button>
      </Popover>
    </div>
  )
}

/* --------------------------------------------------------------- sync chip -- */

function useSyncState() {
  const online = useOnlineStatus()
  const [summary, setSummary] = useState({ pending: 0, sending: 0, blocked: 0, total: 0 })
  const { push } = useToast()

  useEffect(() => {
    let alive = true
    queueSummary().then((s) => {
      if (alive) setSummary(s)
    })
    const off = onQueueChange((s) => {
      if (alive) setSummary(s)
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  useEffect(() => {
    return startAutoFlush({
      onResult: (r) => {
        if (r.sent > 0) {
          push({
            family: 'pass',
            title: r.sent === 1 ? 'One inspection synced' : `${r.sent} inspections synced`,
            body: 'Held on this device until the connection returned.',
          })
        }
        if (r.blocked > 0) {
          push({
            family: 'violation',
            title: r.blocked === 1 ? 'One inspection could not be sent' : `${r.blocked} inspections could not be sent`,
            body: 'The server refused them. Open the queue to see why — nothing was discarded.',
          })
        }
      },
    })
  }, [push])

  const state = summary.blocked > 0
    ? 'error'
    : summary.sending > 0
      ? 'syncing'
      : !online || summary.pending > 0
        ? 'offline'
        : 'synced'

  return { state, pending: summary.pending + summary.blocked, online }
}

/* ------------------------------------------------------------------ header -- */

function Header({ onOpenDrawer, reviewCount }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { state, pending } = useSyncState()
  const { isDark, toggleTheme } = useTheme()
  const role = user?.role
  const isAdmin = role === 'admin'

  return (
    <header className="sticky top-0 z-header flex h-16 items-center gap-2 border-b border-divider bg-surface px-3 sm:px-5">
      <IconButton
        icon={Menu}
        label={t('nav.expand')}
        onClick={onOpenDrawer}
        className="lg:hidden"
      />

      {/* Compact brand for the collapsed rail on mobile */}
      <span className="flex items-center gap-2 lg:hidden">
        {isAdmin ? (
          <ScaleMark size={20} className="text-navy" />
        ) : (
          <CaliperMark size={20} className="text-navy" />
        )}
        <span className="text-small font-bold tracking-[-0.01em] text-ink">NiyamNetra</span>
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SyncBadge state={state} pending={pending} className="hidden sm:inline-flex" />
      </div>

      {/* Admin specific review queue action */}
      {isAdmin && reviewCount > 0 && (
        <Link
          to="/admin/review-queue"
          className="hidden min-h-touch items-center gap-2 rounded-pill border border-review-border bg-review-fill px-3 text-small font-semibold text-review-text sm:inline-flex"
        >
          <ListChecks size={15} strokeWidth={2} aria-hidden="true" />
          {reviewCount} {t('admin.reviewQueueCount') || 'in review'}
        </Link>
      )}

      {/* Direct sun/moon theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="grid h-9 w-9 place-items-center rounded-md text-ink-2 transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
      >
        {isDark ? (
          <Sun size={17} strokeWidth={1.8} className="text-amber-500" />
        ) : (
          <Moon size={17} strokeWidth={1.8} />
        )}
      </button>

      {/* Appearance popover (accent, mode, language) */}
      <AppearanceMenu />

      {/* User profile dropdown */}
      <UserMenu />
    </header>
  )
}

/* ------------------------------------------------------------------ layout -- */

export default function Layout({ reviewCount = 0 }) {
  const [collapsed, setCollapsed] = useLocalPref('rail.collapsed', false)
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()
  const { t } = useI18n()
  const mainRef = useRef(null)

  useEffect(() => {
    setDrawer(false)
  }, [location.pathname])

  const closeDrawer = useCallback(() => setDrawer(false), [])

  useEffect(() => {
    if (!drawer) return
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawer(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [drawer])

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="nn-skip">
        {t('nav.skipToContent')}
      </a>

      {/* Fixed rail, lg and up */}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-rail hidden lg:block',
          'transition-[width] duration-base ease-settle',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <Rail
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          reviewCount={reviewCount}
        />
      </aside>

      {/* Drawer, below lg */}
      {drawer && (
        <div className="fixed inset-0 z-overlay lg:hidden">
          <div
            className="absolute inset-0 bg-[rgba(6,12,22,0.55)]"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Sections"
            className="absolute inset-y-0 left-0 w-[264px] animate-fade-rise shadow-modal"
          >
            <Rail collapsed={false} onNavigate={closeDrawer} reviewCount={reviewCount} inDrawer />
            <IconButton
              icon={X}
              label={t('common.close')}
              tone="onRail"
              onClick={closeDrawer}
              className="absolute right-1 top-2.5"
            />
          </div>
        </div>
      )}

      <div
        className={cx(
          'transition-[padding] duration-base ease-settle',
          collapsed ? 'lg:pl-16' : 'lg:pl-60'
        )}
      >
        <Header onOpenDrawer={() => setDrawer(true)} reviewCount={reviewCount} />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-shell px-4 py-6 sm:px-6 sm:py-8"
        >
          <Outlet />
        </main>
        <footer className="mx-auto w-full max-w-shell px-4 pb-10 sm:px-6">
          <div className="nn-rule-line mb-4" />
          <p className="max-w-prose text-caption text-ink-3">{t('app.footer')}</p>
        </footer>
      </div>
    </div>
  )
}
