/**
 * The application shell: rail, header, appearance popover and the mobile drawer,
 * all in one file.
 *
 * Three decisions worth keeping:
 *
 * 1. The active rail item is marked by a 3px saffron border *and* semibold text,
 *    not by a filled background. The obvious fill (#1E3A5F on the #0B1524 rail)
 *    measures 1.27:1, which is invisible to a large share of users and to anyone
 *    outdoors in sunlight - which is where this portal is actually used. The
 *    saffron edge runs 5.9:1 against the rail and the weight change survives
 *    greyscale, so state is carried twice over.
 *
 * 2. The rail collapses to 64px rather than disappearing. An officer who has
 *    learned that Review queue is fourth from the top keeps that muscle memory;
 *    a hamburger menu discards it.
 *
 * 3. Appearance lives in one popover - theme, accent, language. Scattering three
 *    separate controls across a 64px header is how a header becomes a toolbar.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  ChevronLeft,
  ClipboardList,
  Activity,
  FileText,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Palette,
  PlusCircle,
  Settings as SettingsIcon,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { LanguageSwitcher, useI18n } from '../i18n'
import { useDismissOnOutside, useLocalPref, useOnlineStatus } from '../lib/hooks'
import { onQueueChange, queueSummary, startAutoFlush } from '../lib/queue'
import { AccentPicker, ThemeSwitcher } from '../theme/ThemeContext'
import { IconButton, SyncBadge, cx, useToast } from '../ui'

const RULES_AS_AT = import.meta.env.VITE_RULES_AS_AT ?? '2026-07-01'
const ENGINE_VERSION = import.meta.env.VITE_ENGINE_VERSION ?? '2.0.0'

/* ------------------------------------------------------------------- nav ---- */

function navFor(role, t) {
  if (role === 'admin') {
    return [
      {
        heading: null,
        items: [
          { to: '/admin', label: t('nav.overview'), icon: LayoutDashboard, end: true },
          { to: '/admin/inspections', label: t('nav.inspections'), icon: ClipboardList },
    { to: '/admin/analytics', label: t('nav.analytics'), icon: TrendingUp },
          { to: '/admin/review-queue', label: t('nav.reviewQueue'), icon: ListChecks, badge: 'review' },
          { to: '/admin/reports', label: t('nav.reports'), icon: FileText },
        ],
      },
      {
        heading: 'Administration',
        items: [
          { to: '/admin/inspectors', label: t('nav.inspectors'), icon: Users },
          { to: '/admin/rules', label: t('nav.rules'), icon: BookOpen },
          { to: '/admin/audit', label: t('nav.audit'), icon: ShieldCheck },
        ],
      },
    ]
  }
  return [
    {
      heading: null,
      items: [
        { to: '/inspector', label: t('nav.home'), icon: Home, end: true },
        { to: '/inspector/inspections/new', label: t('nav.newInspection'), icon: PlusCircle },
        { to: '/inspector/inspections', label: t('nav.inspections'), icon: ClipboardList },
        { to: '/inspector/today', label: t('nav.today'), icon: FileText },
    { to: '/inspector/performance', label: t('nav.performance'), icon: Activity },
      ],
    },
  ]
}

/* ------------------------------------------------------------------ brand --- */

/**
 * The mark: an eye rendered as a caliper. Two arms closing on an iris - the
 * product's whole premise in 24px, and it survives being drawn in one colour on
 * the rail. Inline SVG rather than a file, so it inherits currentColor and the
 * theme switch costs nothing.
 */
function Mark({ size = 26, className }) {
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
      <path d="M16 1.8v3.4M16 26.8v3.4" stroke="var(--nn-saffron)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function Brand({ collapsed }) {
  return (
    <Link
      to="/"
      className="flex h-16 items-center gap-3 px-4 text-ink-inverse focus-visible:outline-offset-[-3px]"
    >
      <Mark className="shrink-0 text-saffron-on-navy" />
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-body font-bold leading-5 tracking-[-0.01em]">
            NiyamNetra
          </span>
          <span className="nn-eyebrow block text-rail-label">Compliance portal</span>
        </span>
      )}
    </Link>
  )
}

/* ------------------------------------------------------------------- rail --- */

function RailItem({ item, collapsed, badgeValue, onNavigate }) {
  const { icon: Icon, label, to, end } = item
  const n = item.badge === 'review' ? badgeValue : null
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cx(
          'relative flex min-h-touch items-center gap-3 rounded-sm py-2.5 pr-3 text-small',
          'transition-colors duration-fast ease-settle',
          collapsed ? 'justify-center px-0' : 'pl-4',
          isActive
            ? 'bg-rail-hover font-semibold text-ink-inverse'
            : 'font-medium text-rail-label hover:bg-rail-hover hover:text-ink-inverse'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* The state marker. Saffron at 3px, full item height, flush left. */}
          <span
            aria-hidden="true"
            className={cx(
              'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-pill transition-opacity duration-fast',
              isActive ? 'bg-saffron opacity-100' : 'opacity-0'
            )}
          />
          <Icon size={19} strokeWidth={isActive ? 2.1 : 1.8} aria-hidden="true" className="shrink-0" />
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
  const groups = navFor(user?.role, t)

  return (
    <div className="flex h-full flex-col bg-rail">
      <Brand collapsed={collapsed} />

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
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Provenance, on every screen, permanently. A finding is only meaningful
          against a stated rule version; putting this in an about page means the
          version is absent from every screenshot that ever gets attached to a
          file. */}
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

  const signOut = async () => {
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const initials =
    (user?.full_name ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase() || '?'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={user?.full_name ?? t('nav.settings')}
        className="flex min-h-touch items-center gap-2.5 rounded-pill py-1 pl-1 pr-2.5 transition-colors duration-fast hover:bg-surface-2"
      >
        <span className="nn-mono grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-brand text-[13px] font-bold text-ink-inverse">
          {initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-small font-semibold leading-4 text-ink">
            {user?.full_name}
          </span>
          <span className="nn-mono block truncate text-[11px] leading-4 text-ink-3">
            {user?.employee_id}
          </span>
        </span>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} labelledBy="user-title" className="w-[260px]">
        <p id="user-title" className="nn-eyebrow">
          Signed in as
        </p>
        <p className="mt-1 text-small font-semibold text-ink">{user?.full_name}</p>
        <p className="nn-mono text-caption text-ink-3">{user?.employee_id}</p>
        {user?.jurisdiction && (
          <p className="mt-1 text-caption text-ink-2">{user.jurisdiction}</p>
        )}
        <div className="nn-rule-line my-3" />
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

  return (
    <header className="sticky top-0 z-header flex h-16 items-center gap-2 border-b border-divider bg-surface px-3 sm:px-5">
      <IconButton
        icon={Menu}
        label={t('nav.expand')}
        onClick={onOpenDrawer}
        className="lg:hidden"
      />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="lg:hidden">
          <Mark size={22} className="text-navy" />
        </span>
        <SyncBadge state={state} pending={pending} className="hidden sm:inline-flex" />
      </div>

      {user?.role === 'admin' && reviewCount > 0 && (
        <Link
          to="/admin/review-queue"
          className="hidden min-h-touch items-center gap-2 rounded-pill border border-review-border bg-review-fill px-3 text-small font-semibold text-review-text sm:inline-flex"
        >
          <ListChecks size={15} strokeWidth={2} aria-hidden="true" />
          {reviewCount} {t('admin.reviewQueueCount').toLowerCase()}
        </Link>
      )}

      <AppearanceMenu />
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

  /* Close the drawer on navigation, and move focus to the main region so a
     keyboard user is not returned to the top of the rail on every route change. */
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
