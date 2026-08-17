import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { logout } from '@/services/auth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { formatDate } from '@/lib/formatDate'
import {
  PrototypeSwitcher,
  CHROME_PROTOTYPE_VARIANTS,
  useChromeVariant,
} from '@/components/PrototypeSwitcher'
import { PrototypeFooter } from '@/components/PrototypeFooter'
import HomePage from './pages/HomePage'
import ReviewPage from './pages/ReviewPage'
import AnalysisPage from './pages/AnalysisPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import AdminUsersPage from './pages/AdminUsersPage'
import IngestionReviewPage from './pages/IngestionReviewPage'
import ComponentsPrototypePage from './pages/ComponentsPrototypePage'

interface NavAuth {
  isAdmin: boolean
  userEmail: string | undefined
  onLogout: () => void
  loggingOut: boolean
}

/** "Wire Feed" masthead (ticket 22, Variant A from the navbar+listing prototype round): a
 *  thin utility bar above a centered serif nameplate, nav links below. This is the shipped
 *  baseline — see ticket 26 for the dedicated masthead research/prototype pass that supersedes
 *  it (dev-only ?variant= exploration below, never rendered in production). */
function NavBarBaseline({ isAdmin, userEmail, onLogout, loggingOut }: NavAuth) {
  return (
    <header className="border-b font-sans">
      <div className="flex items-center justify-between border-b bg-muted/30 px-6 py-1.5 text-xs text-muted-foreground">
        <span>{formatDate(new Date(), 'long')}</span>
        {userEmail && (
          <span className="flex items-center gap-3">
            {userEmail}
            <button
              onClick={onLogout}
              disabled={loggingOut}
              className="hover:text-foreground disabled:opacity-50"
            >
              {loggingOut ? 'Odhlašování…' : 'Odhlásit se'}
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
        <Link to="/history" className="font-medium text-foreground hover:text-primary">
          {isAdmin ? 'Historie' : 'Články'}
        </Link>
        {isAdmin && (
          <>
            <Link to="/admin/users" className="text-muted-foreground hover:text-foreground">
              Uživatelé
            </Link>
            <Link to="/admin/ingestion" className="text-muted-foreground hover:text-foreground">
              Sběr článků
            </Link>
          </>
        )}
      </nav>
    </header>
  )
}

/** PROTOTYPE — ticket 26's masthead round, three candidates superseding the baseline above.
 *  Switchable via `?variant=A|B|C`, dev builds only. See docs/research/2026-news-portal-visual-design.md
 *  §8 (BBC's two-band Masthead component; wire marks as "ingredient brand," not dominant). */
function NavBarVariants({ isAdmin, userEmail, onLogout, loggingOut }: NavAuth) {
  const variant = useChromeVariant()
  const authControls = userEmail ? (
    <span className="flex items-center gap-3">
      {userEmail}
      <button onClick={onLogout} disabled={loggingOut} className="hover:text-foreground disabled:opacity-50">
        {loggingOut ? 'Odhlašování…' : 'Odhlásit se'}
      </button>
    </span>
  ) : null

  const navLinks = (
    <>
      <Link to="/history">{isAdmin ? 'Historie' : 'Články'}</Link>
      {isAdmin && (
        <>
          <Link to="/admin/users">Uživatelé</Link>
          <Link to="/admin/ingestion">Sběr článků</Link>
        </>
      )}
    </>
  )

  if (variant === 'B') {
    // Variant B — BBC-style two-band structure with a heavier, bolder local nav band.
    return (
      <>
        <header className="border-b font-sans">
          <div className="flex items-center justify-between border-b bg-muted/30 px-6 py-1.5 text-xs text-muted-foreground">
            <span>{formatDate(new Date(), 'long')}</span>
          </div>
          <div className="px-6 py-4 text-center">
            <Link to="/" className="font-serif text-3xl font-bold tracking-tight text-foreground">
              News Triangulator
            </Link>
          </div>
          <nav className="flex items-center justify-between border-t-2 border-foreground/80 bg-muted/10 px-6 py-2.5 text-sm">
            <span className="flex gap-6 font-semibold tracking-wide [&_a]:hover:text-primary">
              {navLinks}
            </span>
            <span className="text-xs text-muted-foreground">{authControls}</span>
          </nav>
        </header>
        <PrototypeSwitcher variants={CHROME_PROTOTYPE_VARIANTS} />
      </>
    )
  }

  if (variant === 'C') {
    // Variant C — Bloomberg-Terminal-plain: left-aligned nameplate (an "ingredient brand," not a
    // dominant front-page mark, per §8), pipe-separated inline nav, monospace utility bar.
    return (
      <>
        <header className="border-b font-mono text-sm">
          <div className="flex items-center justify-between px-6 py-1 text-[11px] text-muted-foreground">
            <span>{formatDate(new Date(), 'long')}</span>
            {authControls}
          </div>
          <div className="flex items-center gap-6 border-t px-6 py-2.5">
            <Link to="/" className="font-serif text-lg font-bold text-foreground">
              News Triangulator
            </Link>
            <nav className="flex gap-4 text-xs text-muted-foreground [&_a]:hover:text-foreground [&_a:not(:last-child)]:after:ml-4 [&_a:not(:last-child)]:after:text-muted-foreground/50 [&_a:not(:last-child)]:after:content-['|']">
              {navLinks}
            </nav>
          </div>
        </header>
        <PrototypeSwitcher variants={CHROME_PROTOTYPE_VARIANTS} />
      </>
    )
  }

  // Variant A — the shipped baseline, unchanged, kept as the default candidate to compare against.
  return (
    <>
      <NavBarBaseline isAdmin={isAdmin} userEmail={userEmail} onLogout={onLogout} loggingOut={loggingOut} />
      <PrototypeSwitcher variants={CHROME_PROTOTYPE_VARIANTS} />
    </>
  )
}

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

  const authProps: NavAuth = {
    isAdmin,
    userEmail: user?.email,
    onLogout: () => logoutMutation.mutate(),
    loggingOut: logoutMutation.isPending,
  }

  // PROTOTYPE — dev-only visual exploration of the header, see NavBarVariants above.
  // Never affects production builds.
  if (import.meta.env.DEV) {
    return <NavBarVariants {...authProps} />
  }
  return <NavBarBaseline {...authProps} />
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
        <Route
          path="/admin/ingestion"
          element={
            <ProtectedRoute>
              <IngestionReviewPage />
            </ProtectedRoute>
          }
        />
        {import.meta.env.DEV && <Route path="/prototype/components" element={<ComponentsPrototypePage />} />}
      </Routes>
      {import.meta.env.DEV && <PrototypeFooter />}
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
