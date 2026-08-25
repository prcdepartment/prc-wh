import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

// Dashboard and Login stay in the main bundle — one of them is always the first
// screen. Everything else is split out so landing on the dashboard no longer pays
// to parse fifteen other pages (and their chart/table code) up front.
const Inventory = lazy(() => import('./pages/Inventory'))
const MaterialProfile = lazy(() => import('./pages/MaterialProfile'))
const Movement = lazy(() => import('./pages/Movement'))
const Reservations = lazy(() => import('./pages/Reservations'))
const Approvals = lazy(() => import('./pages/Approvals'))
const Users = lazy(() => import('./pages/Users'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const Reports = lazy(() => import('./pages/Reports'))
const Analytics = lazy(() => import('./pages/Analytics'))
const StorageMap = lazy(() => import('./pages/StorageMap'))
const Settings = lazy(() => import('./pages/Settings'))
const LowStock = lazy(() => import('./pages/LowStock'))
const PurchaseRequests = lazy(() => import('./pages/PurchaseRequests'))
const RequestMaterials = lazy(() => import('./pages/RequestMaterials'))
const DeliveryTracking = lazy(() => import('./pages/DeliveryTracking'))
// The Process Flow module carries its own stylesheet and the generated system model,
// so it is split out like every other secondary page — nobody pays for the system
// documentation while looking at the dashboard.
const ProcessFlow = lazy(() => import('./pages/ProcessFlow'))

function PageFallback() {
  return <div className="page-loading">Loading…</div>
}

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        Loading Megawide WMS…
      </div>
    )
  if (!user) return <Navigate to="/login" replace />
  // Suspense sits inside Layout so the chrome stays put while a lazy page arrives.
  return <Layout><Suspense fallback={<PageFallback />}>{children}</Suspense></Layout>
}

export default function App() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
      <Route path="/inventory/:id" element={<Protected><MaterialProfile /></Protected>} />
      <Route path="/movement" element={<Protected><Movement /></Protected>} />
      <Route path="/reservations" element={<Protected><Reservations /></Protected>} />
      <Route path="/approvals" element={<Protected><Approvals /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/audit" element={<Protected><AuditLogs /></Protected>} />
      <Route path="/reports" element={<Protected><Reports /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/storage" element={<Protected><StorageMap /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/low-stock" element={<Protected><LowStock /></Protected>} />
      <Route path="/purchase-requests" element={<Protected><PurchaseRequests /></Protected>} />
      <Route path="/request-materials" element={<Protected><RequestMaterials /></Protected>} />
      <Route path="/delivery" element={<Protected><DeliveryTracking /></Protected>} />
      <Route path="/process-flow" element={<Protected><ProcessFlow /></Protected>} />
      {/* Safekeeping is now a dashboard tab rather than its own page; the old path is
          kept as a redirect so existing links and bookmarks still land somewhere real. */}
      <Route path="/safekeeping" element={<Navigate to="/dashboard?tab=safekeeping" replace />} />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}
