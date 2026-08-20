import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Chrome } from '@/components/Chrome'
import HomePage from './pages/HomePage'
import ReviewPage from './pages/ReviewPage'
import AnalysisPage from './pages/AnalysisPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import AdminUsersPage from './pages/AdminUsersPage'
import IngestionReviewPage from './pages/IngestionReviewPage'
import StyleguidePage from './pages/StyleguidePage'

/** Every real page renders inside the site-wide Chrome. `/styleguide` (dev-only, below) is a
 *  standalone reference document with its own top bar (`.sgtop`) — it deliberately sits outside
 *  this layout rather than getting the app's masthead/footer wrapped around it too. */
function AppLayout() {
  return (
    <Chrome>
      <Outlet />
    </Chrome>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {import.meta.env.DEV && <Route path="/styleguide" element={<StyleguidePage />} />}
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route path="/analysis/:id" element={<AnalysisPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ingestion"
          element={
            <ProtectedRoute>
              <IngestionReviewPage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
