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
import { AdminRoute, ProtectedRoute, PublicOnlyRoute, useAuth } from './auth/AuthContext'
import { endpoints } from './api/client'
import { useResource } from './lib/hooks'
import { reviewQueue as reviewQueueFixture } from './mock/fixtures'
import Layout from './shell/Layout'

import Login from './screens/Login'
import AdminAnalytics from './screens/AdminAnalytics'
import AdminDashboard from './screens/AdminDashboard'
import AdminInspections from './screens/AdminInspections'
import AdminReports from './screens/AdminReports'
import AdminScans from './screens/AdminScans'
import AdminStores from './screens/AdminStores'
import AdminViolations from './screens/AdminViolations'
import RepeatOffenders from './screens/RepeatOffenders'
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
import RuleVersions from './screens/RuleVersions'
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
  return <Layout />
}

export default function App() {
  return (
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
        <Route path="/admin/stores" element={<AdminRoute><AdminStores /></AdminRoute>} />
        <Route path="/admin/scans" element={<AdminRoute><AdminScans /></AdminRoute>} />
        <Route path="/admin/products-scans" element={<AdminRoute><AdminScans /></AdminRoute>} />
        <Route path="/admin/violations" element={<AdminRoute><AdminViolations /></AdminRoute>} />
        <Route path="/admin/repeat-offenders" element={<AdminRoute><RepeatOffenders /></AdminRoute>} />
        <Route path="/admin/scans/:id" element={<AdminRoute><ScanFindings /></AdminRoute>} />
        <Route path="/admin/review-queue" element={<AdminRoute><ReviewQueue /></AdminRoute>} />
        <Route path="/admin/inspectors" element={<AdminRoute><Inspectors /></AdminRoute>} />
        <Route path="/admin/reports" element={<AdminRoute><AdminReports /></AdminRoute>} />
        <Route path="/admin/rules" element={<AdminRoute><Rules /></AdminRoute>} />
        <Route path="/admin/rule-versions" element={<AdminRoute><RuleVersions /></AdminRoute>} />
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
        <Route path="/admin/settings" element={<AdminRoute><Settings /></AdminRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
