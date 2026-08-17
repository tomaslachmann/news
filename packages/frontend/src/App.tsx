import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { logout } from '@/services/auth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { formatDate } from '@/lib/formatDate'
import { Footer } from '@/components/Footer'
import HomePage from './pages/HomePage'
import ReviewPage from './pages/ReviewPage'
import AnalysisPage from './pages/AnalysisPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import AdminUsersPage from './pages/AdminUsersPage'
import IngestionReviewPage from './pages/IngestionReviewPage'

/** Ticket 28 — active-route highlighting, shared by every link in the nav band below so the
 *  current page is never ambiguous (most noticeable under Admin, with three links to tell apart). */
function navLinkClassName({ isActive }: { isActive: boolean }) {
  return isActive ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
}

/** "Wire Feed" masthead: a thin utility bar above a centered serif nameplate, nav links below.
 *  Introduced as a working baseline in ticket 22, finalized unchanged in ticket 26's dedicated
 *  masthead/footer/login/component prototype round (Variant A won — this structure, refined
 *  everywhere else, rather than the two heavier/lighter alternatives that round also explored). */
function NavBar() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['me'] })
      void navigate('/login', { replace: true })
    },
  })

  return (
    <header className="border-b font-sans">
      <div className="flex items-center justify-between border-b bg-muted/30 px-6 py-1.5 text-xs text-muted-foreground">
        <span>{formatDate(new Date(), 'long')}</span>
        {user && (
          <span className="flex items-center gap-3">
            {user.email}
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="hover:text-foreground disabled:opacity-50"
            >
              {logoutMutation.isPending ? 'Odhlašování…' : 'Odhlásit se'}
            </button>
          </span>
        )}
      </div>
      <div className="px-6 py-4 text-center">
        <Link to="/" className="font-serif text-3xl font-bold tracking-tight text-foreground">
          News Triangulator
        </Link>
      </div>
      <nav className="flex justify-center gap-6 border-t px-6 py-2 text-sm">
        <NavLink to="/history" className={navLinkClassName}>
          {isAdmin ? 'Historie' : 'Články'}
        </NavLink>
        {isAdmin && (
          <>
            <NavLink to="/admin/users" className={navLinkClassName}>
              Uživatelé
            </NavLink>
            <NavLink to="/admin/ingestion" className={navLinkClassName}>
              Sběr článků
            </NavLink>
          </>
        )}
      </nav>
    </header>
  )
}

function AppRoutes() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <NavBar />
      <div className="flex-1">
        <Routes>
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
        </Routes>
      </div>
      <Footer />
    </div>
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
