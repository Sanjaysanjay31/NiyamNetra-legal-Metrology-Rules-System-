/**
 * The application shell — fixed navy sidebar, white header, off-white canvas.
 *
 * One shell, every screen. The same `<Layout>` is mounted once at the route
 * root (App.jsx → Shell) and every admin and inspector page is rendered
 * inside its `<Outlet>`. A page does not render its own header, its own
 * sidebar, or its own search; it just renders its body. That keeps the
 * chrome consistent across all fourteen routes and means the visual shell
 * can be revised in one file.
 *
 * Three load-bearing decisions, kept here because the second one in
 * particular has been hard won:
 *
 *  1. The sidebar matches the cool blue-grey page canvas (#eef1f6) and is
 *     240px wide. The active row is the portal's signature blue pill
 *     (#2160c4) so the selection clearly stands out while keeping high contrast.
 *
 *  2. The signed-in admin's profile block — avatar, name, "Super
 *     Administrator" — is always present at the bottom of the rail. The
 *     portal's "who is on the system" question is on the same page as the
 *     "what is the system doing" question.
 *
 *  3. The header search lives in the chrome, not in any one screen. A
 *     single keystroke is the same gesture from any route, including
 *     during a focused data-entry task on the inspector app.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  ChevronLeft,
  ClipboardList,
  Activity,
  FileCheck,
  FileText,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Package,
  PlusCircle,
  Settings as SettingsIcon,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { LanguageSwitcher, useI18n } from '../i18n'
import { useDismissOnOutside, useLocalPref, useOnlineStatus } from '../lib/hooks'
import { onQueueChange, queueSummary, startAutoFlush } from '../lib/queue'
import { ThemeToggle } from '../theme/ThemeContext'
import { IconButton, SyncBadge, cx, useToast } from '../ui'

const RULES_AS_AT = import.meta.env.VITE_RULES_AS_AT ?? '2026-07-01'
const ENGINE_VERSION = import.meta.env.VITE_ENGINE_VERSION ?? '2.0.0'

/* ------------------------------------------------------------------- mark ---- */

/**
 * The mark for the Legal Metrology Department — a balance scale: the
 * instrument that decides whether a declaration is true, and the oldest
 * emblem of fair measure. Drawn as a single glyph: the post, the beam,
 * the chains, the two pans, and the base. Every stroke inherits
 * currentColor, so the same mark reads on the canvas-toned rail, on a white
 * surface, and on the login panel.
 */
function Mark({ size = 28, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* post */}
      <path
        d="M16 4.5v19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* top finial */}
      <circle cx="16" cy="4" r="1.2" fill="currentColor" />
      {/* horizontal beam */}
      <path
        d="M5 9.5h22"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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
      <path
        d="M11 26h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9.5 28h13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------- nav ---- */

function navFor(role, t) {
  if (role === 'admin') {
    return [
      {
        heading: null,
        items: [
          { to: '/admin', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
          { to: '/admin/inspections', label: t('nav.inspections'), icon: ClipboardList },
          { to: '/admin/stores', label: t('nav.stores'), icon: Store },
          { to: '/admin/scans', label: t('nav.products'), icon: Package },
          { to: '/admin/violations', label: t('nav.violations'), icon: AlertTriangle },
          { to: '/admin/inspectors', label: t('nav.inspectors'), icon: Users },
          { to: '/admin/reports', label: t('nav.reports'), icon: BarChart3 },
          { to: '/admin/audit', label: t('nav.audit'), icon: ShieldCheck },
          { to: '/admin/rule-versions', label: t('nav.rules'), icon: BookOpen },
          { to: '/settings', label: t('nav.settings'), icon: SettingsIcon },
        ],
      },
    ]
  }
  return [
    {
      heading: null,
      items: [
        { to: '/inspector', label: t('nav.home'), icon: Home, end: true },
        { to: '/inspector/inspections', label: t('nav.inspections'), icon: ClipboardList },
        { to: '/inspector/reports', label: t('nav.reports'), icon: FileText },
        { to: '/inspector/violations', label: t('nav.violations'), icon: AlertTriangle },
        { to: '/inspector/performance', label: t('nav.performance') || 'My Performance', icon: TrendingUp },
        { to: '/inspector/settings', label: t('nav.settings') || 'Settings', icon: SettingsIcon },
      ],
    },
  ]
}

/* ----------------------------------------------------------------- brand ---- */

/**
 * The brand block at the top of the rail. The reference design has the
 * mark and the word "NiyamNetra" together with a small "Legal Metrology
 * Inspection System" caption underneath. Two-line treatment with the
 * mark on the left and the text stacked on the right; the word mark is
 * the heaviest thing on the rail so the eye anchors there first.
 */
function Brand({ collapsed }) {
  const { t } = useI18n()
  if (collapsed) {
    return (
      <div className="flex h-16 items-center justify-center border-b border-rail-border/30 text-rail-ink">
        <Mark size={24} />
        <span className="sr-only-nn">NiyamNetra</span>
      </div>
    )
  }
  return (
    <div className="flex h-16 items-center gap-2.5 border-b border-rail-border/30 px-4 text-rail-ink">
      <span className="nn-mono grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/70 text-rail-ink shadow-xs">
        <Mark size={20} className="text-rail-ink" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-rail-ink">NiyamNetra</p>
        <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-rail-label">
          {t('app.tagline')}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ rail item ---- */

function RailItem({ item, collapsed, badgeValue, onNavigate }) {
  const badge = item.badge === 'review' && badgeValue > 0 ? badgeValue : null
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cx(
          'group relative flex h-9 items-center gap-3 rounded-md px-3 text-[13px] transition-colors duration-fast ease-settle',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-[var(--nn-rail-active)] font-semibold text-white shadow-xs'
            : 'font-medium text-rail-label hover:bg-white/60 hover:text-rail-ink'
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            size={17}
            strokeWidth={isActive ? 2 : 1.7}
            aria-hidden="true"
            className="shrink-0"
          />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
          {!collapsed && badge != null && (
            <span
              className={cx(
                'nn-mono rounded-pill px-1.5 py-0.5 text-[10px] font-bold leading-3.5',
                isActive ? 'bg-white/20 text-white' : 'bg-white/80 text-rail-ink shadow-xs'
              )}
            >
              {badge}
            </span>
          )}
          {collapsed && badge != null && (
            <span
              className="absolute right-2 top-1.5 h-2 w-2 rounded-pill bg-[var(--nn-rail-active)]"
              aria-hidden="true"
            />
          )}
        </>
      )}
    </NavLink>
  )
}

/* ------------------------------------------------------------------ rail ---- */

function Rail({ collapsed, onToggle, onNavigate, reviewCount, inDrawer = false }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const groups = navFor(user?.role, t)
  const navigate = useNavigate()

  const displayName =
    !user?.full_name || user?.full_name === 'Seed Administrator' ? 'Administrator' : user.full_name

  const initials =
    displayName === 'Administrator'
      ? 'A'
      : displayName
          .split(/\s+/)
          .slice(0, 2)
          .map((s) => s[0])
          .join('')
          .toUpperCase() || 'A'

  const roleLabel = user?.role === 'admin' ? 'Administrator' : 'Inspector'

  return (
    <div className="flex h-full flex-col bg-rail border-r border-rail-border/30">
      <Brand collapsed={collapsed} />

      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Sections">
        {groups.map((g, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
            {g.heading && !collapsed && (
              <p className="nn-eyebrow px-3 pb-1.5 text-rail-label font-semibold">{g.heading}</p>
            )}
            {g.heading && collapsed && <div className="mx-3 mb-1.5 h-px bg-rail-border/30" />}
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

      {/* The admin profile block — bottom of the rail, present on every
          screen, so the signed-in officer is never more than a glance from
          the top of the work area. The chevron is a router link, not a
          menu: the Settings page is one click. */}
      {!inDrawer && (
        <div className="border-t border-rail-border/30 p-2">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left',
              'transition-colors duration-fast ease-settle hover:bg-white/60',
              collapsed && 'justify-center px-0'
            )}
            title={collapsed ? displayName : undefined}
          >
            <span className="nn-mono grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/80 text-[12px] font-bold text-rail-ink shadow-xs">
              {initials}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-4 text-rail-ink">
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

      {/* Provenance stamp — same row as the user block, on the left, so the
          engine version and rule date are visible without taking up more
          vertical real estate. */}
      {!inDrawer && !collapsed && (
        <div className="border-t border-rail-border/30 px-3.5 py-2">
          <p className="nn-mono text-[9px] uppercase tracking-[0.12em] text-rail-label">
            Rules as at · engine {ENGINE_VERSION}
          </p>
          <p className="nn-mono mt-0.5 text-[10px] text-rail-ink/80">{RULES_AS_AT}</p>
        </div>
      )}

      {!inDrawer && (
        <div className="border-t border-rail-border/30 p-2">
          <button
            type="button"
            onClick={onToggle}
            className={cx(
              'flex h-8 w-full items-center gap-3 rounded-md px-3 text-[12px] font-medium',
              'text-rail-label transition-colors duration-fast ease-settle hover:bg-white/60 hover:text-rail-ink',
              collapsed && 'justify-center px-0'
            )}
            aria-expanded={!collapsed}
          >
            <ChevronLeft
              size={14}
              strokeWidth={1.8}
              aria-hidden="true"
              className={cx(
                'transition-transform duration-base ease-settle',
                collapsed && 'rotate-180'
              )}
            />
            {!collapsed && <span>{t('nav.collapse')}</span>}
            {collapsed && <span className="sr-only-nn">{t('nav.expand')}</span>}
          </button>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- popover ---- */

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
        'rounded-card border border-divider bg-surface p-4 shadow-modal',
        className
      )}
    >
      {children}
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

  const displayName =
    !user?.full_name || user?.full_name === 'Seed Administrator' ? 'Administrator' : user.full_name

  const initials =
    displayName === 'Administrator'
      ? 'A'
      : displayName
          .split(/\s+/)
          .slice(0, 2)
          .map((s) => s[0])
          .join('')
          .toUpperCase() || 'A'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={displayName ?? t('nav.settings')}
        className="flex h-9 items-center gap-2 rounded-pill py-1 pl-1 pr-2.5 transition-colors duration-fast hover:bg-surface-2"
      >
        <span className="nn-mono grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-ink-inverse">
          {initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-[12px] font-semibold leading-4 text-ink">
            {displayName}
          </span>
        </span>
        <span className="hidden text-ink-3 sm:block">▾</span>
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="user-title"
        className="w-[260px]"
      >
        <p id="user-title" className="nn-eyebrow">
          Signed in as
        </p>
        <p className="mt-1 text-small font-semibold text-ink">{displayName}</p>
        <p className="nn-mono text-caption text-ink-3">{user?.employee_id}</p>
        {user?.jurisdiction && <p className="mt-1 text-caption text-ink-2">{user.jurisdiction}</p>}
        <div className="nn-rule-line my-3" />
        <Link
          to={user?.role === 'inspector' ? '/inspector/settings' : '/settings'}
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
            title:
              r.blocked === 1
                ? 'One inspection could not be sent'
                : `${r.blocked} inspections could not be sent`,
            body: 'The server refused them. Open the queue to see why — nothing was discarded.',
          })
        }
      },
    })
  }, [push])

  const state =
    summary.blocked > 0
      ? 'error'
      : summary.sending > 0
        ? 'syncing'
        : !online || summary.pending > 0
          ? 'offline'
          : 'synced'

  return { state, pending: summary.pending + summary.blocked, online }
}

/* ---------------------------------------------------- notifications menu ---- */

const INITIAL_NOTIFICATIONS = [
  {
    id: 'notif-1',
    title: 'New Inspection Submitted',
    message: 'S. Kumar submitted inspection INS-10230 for Sri Stores',
    time: '2 min ago',
    inspectionId: 'INS-10230',
    read: false,
  },
  {
    id: 'notif-2',
    title: 'New Inspection Submitted',
    message: 'R. Kumar submitted inspection INS-10229 for Lakshmi General Store',
    time: '15 min ago',
    inspectionId: 'INS-10229',
    read: false,
  },
]

function NotificationsMenu() {
  const [open, setOpen] = useState(false)
  const { role } = useAuth()
  const [notifications, setNotifications] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('niyamnetra_admin_notifications') || '[]')
      return Array.isArray(stored) && stored.length > 0 ? [...stored, ...INITIAL_NOTIFICATIONS] : INITIAL_NOTIFICATIONS
    } catch {
      return INITIAL_NOTIFICATIONS
    }
  })
  const navigate = useNavigate()

  useEffect(() => {
    function onInspectionSubmitted(e) {
      if (e.detail) {
        setNotifications((prev) => [e.detail, ...prev])
      }
    }
    window.addEventListener('niyamnetra:inspection-submitted', onInspectionSubmitted)
    return () => window.removeEventListener('niyamnetra:inspection-submitted', onInspectionSubmitted)
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  const handleNotificationClick = (item) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
      try {
        localStorage.setItem(
          'niyamnetra_admin_notifications',
          JSON.stringify(updated.filter((x) => !INITIAL_NOTIFICATIONS.some((init) => init.id === x.id)))
        )
      } catch (err) {}
      return updated
    })
    setOpen(false)
    const rawId = String(item.inspectionId).replace('INS-', '')
    const targetPath = role === 'inspector'
      ? `/inspector/inspections/${rawId}`
      : `/admin/inspections/${rawId}`
    navigate(targetPath)
  }

  const markAllAsRead = (e) => {
    e.stopPropagation()
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }))
      try {
        localStorage.setItem(
          'niyamnetra_admin_notifications',
          JSON.stringify(updated.filter((x) => !INITIAL_NOTIFICATIONS.some((init) => init.id === x.id)))
        )
      } catch (err) {}
      return updated
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Notifications"
        title="Notifications"
        className="relative grid h-9 w-9 place-items-center rounded-md text-ink-2 transition-colors duration-fast hover:bg-surface-2 hover:text-ink focus:outline-none"
      >
        <Bell size={17} strokeWidth={1.7} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="nn-mono absolute right-1 top-1 grid min-w-[15px] h-[15px] place-items-center rounded-pill bg-[#2160c4] px-1 text-[9px] font-bold leading-none text-white shadow-xs"
            aria-label={`${unreadCount} unread notifications`}
          >
            {unreadCount}
          </span>
        )}
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="notifications-title"
        className="w-[320px] sm:w-[350px] p-0 overflow-hidden shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-divider px-4 py-3 bg-surface">
          <div className="flex items-center gap-2">
            <h3 id="notifications-title" className="text-[13px] font-bold text-ink">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <span className="rounded-pill bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-text">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-[11px] font-medium text-accent-text hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[380px] overflow-y-auto divide-y divide-divider/60">
          {notifications.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-[13px] font-semibold text-ink">No new notifications</p>
              <p className="mt-1 text-[11px] text-ink-3">
                All submitted inspections have been viewed.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleNotificationClick(n)}
                className={cx(
                  'w-full text-left p-3 transition-colors duration-fast flex items-start gap-2.5 hover:bg-surface-2',
                  !n.read ? 'bg-surface-2/70' : 'bg-surface'
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {!n.read ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-accent-text">
                      <FileCheck size={13} strokeWidth={2.2} />
                    </span>
                  ) : (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-3 text-ink-3">
                      <FileCheck size={13} strokeWidth={1.8} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className={cx('text-[12px] leading-tight', !n.read ? 'font-bold text-ink' : 'font-semibold text-ink-2')}>
                      {n.title}
                    </p>
                    {!n.read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#2160c4] shrink-0" aria-hidden="true" />
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-ink-2">
                    {n.message}
                  </p>
                  <p className="mt-1.5 text-[10px] font-medium text-ink-3">
                    {n.time}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </Popover>
    </div>
  )
}

/* ------------------------------------------------------------------ header -- */

/**
 * The white top header. Right-aligned group: search → notifications → user.
 */
function Header({ onOpenDrawer }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { state, pending } = useSyncState()

  return (
    <header className="sticky top-0 z-header flex h-14 items-center gap-2 border-b border-divider bg-surface px-3 sm:px-5">
      <IconButton icon={Menu} label={t('nav.expand')} onClick={onOpenDrawer} className="lg:hidden" />

      {/* Compact brand for the collapsed rail, which is hidden below lg. */}
      <span className="flex items-center gap-2 lg:hidden">
        <Mark size={20} className="text-navy" />
        <span className="text-small font-bold tracking-[-0.01em] text-ink">NiyamNetra</span>
      </span>

      <div className="flex-1" />

      <SyncBadge state={state} pending={pending} className="hidden sm:inline-flex" />

      <div className="hidden md:block">
        <LanguageSwitcher />
      </div>

      <div className="hidden sm:block">
        <NotificationsMenu />
      </div>

      <ThemeToggle />

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

      {/* Fixed sidebar, lg and up. 240px is the working width — wide enough
          for the word mark and a long label, narrow enough that a 1440px
          monitor still leaves 1200px for the canvas. */}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-rail hidden lg:block',
          'transition-[width] duration-base ease-settle',
          collapsed ? 'w-[68px]' : 'w-[240px]'
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
            className="absolute inset-0 bg-[rgba(15,42,68,0.5)]"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Sections"
            className="absolute inset-y-0 left-0 w-[280px] animate-fade-rise shadow-modal"
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
          'flex min-h-screen flex-col transition-[padding] duration-base ease-settle',
          collapsed ? 'lg:pl-[68px]' : 'lg:pl-[240px]'
        )}
      >
        <Header onOpenDrawer={() => setDrawer(true)} />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-shell flex-1 px-4 py-6 sm:px-6 sm:py-8"
        >
          <Outlet />
        </main>
        <footer className="mx-auto w-full max-w-shell px-4 pb-8 sm:px-6">
          <div className="nn-rule-line mb-3" />
        </footer>
      </div>
    </div>
  )
}
