/**
 * The route map.
 *
 * Every path the rail can reach is mounted here, and nothing is mounted that the
 * rail cannot reach. That symmetry is checked in scripts/route-audit.mjs, because
 * a dead sidebar link is the single most common defect in a portal of this shape:
 * it looks finished in a screenshot and fails on click.
 *
 * Imports are static rather than lazy on purpose. This portal is installed as a
 * PWA and used in markets with no usable connection; a route split into its own
 * chunk is a route that can fail to load at the worst possible moment. One
 * slightly larger initial download, fetched once over office wifi, is the right
 * trade for a shell that cannot half-load in the field.
 */

import { Navigate, Route, Routes } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { AdminRoute, ProtectedRoute, PublicOnlyRoute, useAuth } from './auth/AuthContext'
import { endpoints } from './api/client'
import { useResource } from './lib/hooks'
import { reviewQueue as reviewQueueFixture } from './mock/fixtures'
import Layout from './shell/Layout'

/**
 * PWA update prompt for registerType: 'prompt'. The new worker waits until the
 * officer accepts; the banner is the only UI that can trigger the reload.
 */
function ServiceWorkerPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!offlineReady && !needRefresh) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-overlay px-4 pb-4"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[560px] flex-wrap items-center justify-between gap-3 rounded-card border border-divider bg-surface p-4 shadow-modal">
        <p className="text-small text-ink">
          {needRefresh
            ? 'A new version of the portal is available.'
            : 'The portal is ready to work offline.'}
        </p>
        <div className="flex items-center gap-2">
          {needRefresh && (
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="min-h-touch rounded-sm bg-accent px-4 text-small font-semibold text-accent-on"
            >
              Reload to update
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOfflineReady(false)
              setNeedRefresh(false)
            }}
            className="min-h-touch rounded-sm px-3 text-small font-medium text-ink-2 hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

import Login from './screens/Login'
import AdminAnalytics from './screens/AdminAnalytics'
import AdminDashboard from './screens/AdminDashboard'
import AdminInspections from './screens/AdminInspections'
import AdminReports from './screens/AdminReports'
import Audit from './screens/Audit'
import Capture from './screens/Capture'
import InspectionDetail from './screens/InspectionDetail'
import Inspectors from './screens/Inspectors'
import InspectorHome from './screens/InspectorHome'
import InspectorInspections from './screens/InspectorInspections'
import InspectorPerformance from './screens/InspectorPerformance'
import NewInspection from './screens/NewInspection'
import NotFound from './screens/NotFound'
import ReviewQueue from './screens/ReviewQueue'
import Rules from './screens/Rules'
import ScanFindings from './screens/ScanFindings'
import Settings from './screens/Settings'
import TodaysReport from './screens/TodaysReport'

/** Send an authenticated officer to their own section; anyone else to login. */
function RootRedirect() {
  const { booting, isAuthenticated, isAdmin } = useAuth()
  if (booting) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Navigate to={isAdmin ? '/admin' : '/inspector'} replace />
}

/**
 * The shell needs the review-queue depth for the rail badge, and it is the only
 * number the shell fetches. Kept here rather than inside Layout so Layout stays
 * a presentation component and the request is not re-issued by the drawer copy
 * of the rail.
 */
function Shell() {
  const { isAdmin } = useAuth()
  /* GET /admin/review-queue takes no parameters; the badge counts what the
     server returns ({count: n}). */
  const { data } = useResource(() => endpoints.admin.reviewQueue(), {
    enabled: isAdmin,
    fallback: reviewQueueFixture,
    label: 'review-queue-count',
  })
  /* GET /admin/review-queue returns `{count: n}` - a number, not rows. The
     other shapes are tolerated so the badge survives the endpoint growing a
     listing form, which its own docstring in queries.py implies was intended. */
  const count = Array.isArray(data)
    ? data.length
    : (data?.count ?? data?.items?.length ?? data?.total ?? 0)
  return <Layout reviewCount={isAdmin ? count : 0} />
}

export default function App() {
  return (
    <>
    <ServiceWorkerPrompt />
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<RootRedirect />} />

        {/* ------------------------------------------------------- admin ---- */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
        <Route path="/admin/inspections" element={<AdminRoute><AdminInspections /></AdminRoute>} />
        <Route path="/admin/inspections/:id" element={<AdminRoute><InspectionDetail /></AdminRoute>} />
        <Route path="/admin/scans/:id" element={<AdminRoute><ScanFindings /></AdminRoute>} />
        <Route path="/admin/review-queue" element={<AdminRoute><ReviewQueue /></AdminRoute>} />
        <Route path="/admin/inspectors" element={<AdminRoute><Inspectors /></AdminRoute>} />
        <Route path="/admin/reports" element={<AdminRoute><AdminReports /></AdminRoute>} />
        <Route path="/admin/rules" element={<AdminRoute><Rules /></AdminRoute>} />
        <Route path="/admin/audit" element={<AdminRoute><Audit /></AdminRoute>} />

        {/* --------------------------------------------------- inspector ---- */}
        <Route path="/inspector" element={<InspectorHome />} />
        <Route path="/inspector/inspections" element={<InspectorInspections />} />
        <Route path="/inspector/inspections/new" element={<NewInspection />} />
        <Route path="/inspector/inspections/:id" element={<InspectionDetail />} />
        <Route path="/inspector/inspections/:id/capture" element={<Capture />} />
        <Route path="/inspector/scans/:id" element={<ScanFindings />} />
        <Route path="/inspector/today" element={<TodaysReport />} />
        <Route path="/inspector/performance" element={<InspectorPerformance />} />

        {/* ------------------------------------------------------ shared ---- */}
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </>
  )
}
