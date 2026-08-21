import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLogout } from '@/services/auth/hooks'
import { useTheme } from '@/ds/useTheme'
import { THEME_LABEL } from '@/ds/theme'
import '@/components/Chrome.css'
import './AdminChrome.css'

const ROLE_LABEL: Record<'ADMIN' | 'READONLY', string> = {
  ADMIN: 'Admin',
  READONLY: 'Pouze pro čtení',
}

/** Internal/admin screens' own chrome (ticket 39) — ds/components.css §15 "INTERNÍ OBRAZOVKY
 *  (PŘIHLÁŠENÍ A ADMIN)": a slim .abar bar, not the public masthead/rubnav/utilbar the reader-
 *  facing Chrome renders. Reference confirms this split — admin-sources.html, admin-users.html
 *  and admin-review.html all use `.abar` directly with no masthead at all; "Výběr zdrojů" (source
 *  selection) has no fixed nav destination here since it's always reached from a specific
 *  Analysis, not a standalone route, so it's left out of the nav unlike the reference's own
 *  `admin-sources.html` entry (which links to the mockup's one static demo page). */
export function AdminChrome({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [theme, cycleTheme] = useTheme()
  const logoutMutation = useLogout()

  return (
    <div className="min-h-screen flex flex-col">
      <div className="abar">
        <div className="u-wrap abar__in">
          <Link className="abar__brand" to="/">
            Trian<em>gulátor</em>
          </Link>
          <span className="abar__tag">Interní</span>
          <nav className="abar__nav" aria-label="Interní sekce">
            {isAdmin && (
              <>
                <NavLink to="/admin/ingestion">Kontrola sběru</NavLink>
                <NavLink to="/admin/entities">Entity / Wikidata</NavLink>
                <NavLink to="/admin/users">Uživatelé</NavLink>
              </>
            )}
            <Link to="/">Veřejný web</Link>
          </nav>
          <span className="abar__side">
            {user && (
              <>
                <span className="abar__who">{user.email}</span>
                <span className="pill pill--admin">{ROLE_LABEL[user.role]}</span>
              </>
            )}
            <button type="button" onClick={cycleTheme}>
              {THEME_LABEL[theme]}
            </button>
            <button type="button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
              {logoutMutation.isPending ? 'Odhlašování…' : 'Odhlásit'}
            </button>
          </span>
        </div>
      </div>

      <div className="flex-1">{children}</div>

      <footer className="foot">
        <div className="u-wrap">
          <div className="foot__bottom">
            <span>© News Triangulator — interní rozhraní</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
