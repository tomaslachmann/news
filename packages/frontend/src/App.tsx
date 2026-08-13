import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { logout } from '@/services/auth'
import ProtectedRoute from '@/components/ProtectedRoute'
import HomePage from './pages/HomePage'
import ReviewPage from './pages/ReviewPage'
import AnalysisPage from './pages/AnalysisPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import AdminUsersPage from './pages/AdminUsersPage'

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
    <nav className="border-b bg-background px-6 py-3 flex gap-6 items-center">
      <Link to="/" className="font-semibold text-foreground hover:text-primary">
        News Triangulator
      </Link>
      <Link to="/history" className="text-muted-foreground hover:text-foreground">
        {isAdmin ? 'History' : 'Articles'}
      </Link>
      {isAdmin && (
        <Link to="/admin/users" className="text-muted-foreground hover:text-foreground">
          Users
        </Link>
      )}
      <div className="ml-auto flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </>
        ) : (
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  )
}

function AppRoutes() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />
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
      </Routes>
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
