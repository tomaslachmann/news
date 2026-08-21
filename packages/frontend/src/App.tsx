import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Chrome } from '@/components/Chrome'
import { AdminChrome } from '@/components/AdminChrome'
import HomePage from './pages/HomePage'
import NewAnalysisPage from './pages/NewAnalysisPage'
import ReviewPage from './pages/ReviewPage'
import AnalysisPage from './pages/AnalysisPage'
import ArticlePage from './pages/ArticlePage'
import EntityDetailPage from './pages/EntityDetailPage'
import SearchPage from './pages/SearchPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import AdminUsersPage from './pages/AdminUsersPage'
import AdminEntityWikidataPage from './pages/AdminEntityWikidataPage'
import EntityAliasesPage from './pages/EntityAliasesPage'
import IngestionReviewPage from './pages/IngestionReviewPage'
import StyleguidePage from './pages/StyleguidePage'
import NotFoundPage from './pages/NotFoundPage'

/** Every reader-facing page renders inside the site-wide Chrome (masthead/rubnav/utilbar).
 *  `/styleguide` (dev-only, below) is a standalone reference document with its own top bar
 *  (`.sgtop`) — it deliberately sits outside this layout rather than getting the app's masthead/
 *  footer wrapped around it too. */
function AppLayout() {
  return (
    <Chrome>
      <Outlet />
    </Chrome>
  )
}

/** Internal/admin screens get their own, much slimmer chrome instead — ds/components.css §15:
 *  the reference's admin-sources.html/admin-users.html/admin-review.html all use `.abar`, never
 *  the public masthead. `/login` stays under the reader-facing Chrome (ticket 26's "internal-tool
 *  framing" decision, preserved by ticket 39 — see its own checklist entry), so it's deliberately
 *  not moved here even though login.html itself also has no chrome at all. */
function AdminLayout() {
  return (
    <AdminChrome>
      <Outlet />
    </AdminChrome>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {import.meta.env.DEV && <Route path="/styleguide" element={<StyleguidePage />} />}
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/new-analysis"
          element={
            <ProtectedRoute>
              <NewAnalysisPage />
            </ProtectedRoute>
          }
        />
        <Route path="/article/:id" element={<ArticlePage />} />
        <Route path="/entity/:key" element={<EntityDetailPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<AdminLayout />}>
        <Route
          path="/analysis/:id"
          element={
            <ProtectedRoute>
              <AnalysisPage />
            </ProtectedRoute>
          }
        />
        <Route path="/review/:id" element={<ReviewPage />} />
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
        <Route
          path="/admin/entities"
          element={
            <ProtectedRoute>
              <AdminEntityWikidataPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/entity-aliases"
          element={
            <ProtectedRoute>
              <EntityAliasesPage />
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
