import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AdminSessionProvider, useAdminSession } from './lib/adminSession'
import PublicDashboard from './pages/PublicDashboard'
import LoadingScreen from './components/LoadingScreen'
import Watermark from './components/Watermark'

// The public page is what every visitor loads, so the admin screens are
// code-split out of the initial bundle. Nothing but the unlock box should cost
// a visitor anything.
const SignupForm = lazy(() => import('./pages/SignupForm'))
const AdminUnlock = lazy(() => import('./pages/AdminUnlock'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const YearCalendar = lazy(() => import('./pages/YearCalendar'))

// Unlocked sessions render the dashboard; everyone else sees the unlock
// screen. Both live at /admin so the admin never has to remember a second URL.
function AdminRoute() {
  const { isUnlocked } = useAdminSession()
  return isUnlocked ? <AdminDashboard /> : <AdminUnlock />
}

export default function App() {
  return (
    <AdminSessionProvider>
      <Watermark />
      <Suspense fallback={<p className="page loading">Loading…</p>}>
        <LoadingScreen />
        <Routes>
          <Route path="/" element={<PublicDashboard />} />
          <Route path="/calendar" element={<YearCalendar />} />
          <Route path="/signup" element={<SignupForm />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="*" element={<PublicDashboard />} />
        </Routes>
      </Suspense>
    </AdminSessionProvider>
  )
}
