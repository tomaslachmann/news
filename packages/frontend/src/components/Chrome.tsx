import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLogout } from '@/services/auth/hooks'
import { formatDate } from '@/lib/formatDate'
import { useTheme } from '@/ds/useTheme'
import { THEME_LABEL } from '@/ds/theme'
import { getPrimaryNavItems } from './chromeNav'
import './Chrome.css'

/** Route links shared by `.rubnav` (full header) and `.sticky__nav` (condensed header) — appended
 *  after the topic rubrics above so History/Admin pages stay reachable. `NavLink` sets
 *  `aria-current="page"` on the active route automatically — `.rubnav a[aria-current='page']`
 *  (ds/components.css) styles it, no className function needed. `compact` mirrors chrome.js's own
 *  `RUBS.slice(0, 5)` behavior for the condensed sticky header. */
function PrimaryNav({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const navItems = getPrimaryNavItems(isAdmin, compact)

  return (
    <>
      {navItems.map((item) =>
        item.to === '#' ? (
          <a href="#" key={item.label} onClick={(e) => e.preventDefault()}>
            {item.label}
          </a>
        ) : (
          <NavLink to={item.to} key={item.label}>
            {item.label}
          </NavLink>
        )
      )}
    </>
  )
}

/** Site-wide chrome (ticket 39): `.utilbar` / `.mast` / `.rubnav` / `.sticky` / `.foot`, ported
 *  from `ds/chrome.js`. Ticket 26's masthead/footer structure survives (the utility bar above a
 *  centered nameplate, a nav row below, a sitemap-shaped footer); only the styling — and, for
 *  rubnav specifically, what fills the nav slot — comes from the new system. */
export function Chrome({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [theme, cycleTheme] = useTheme()
  const navAnchorRef = useRef<HTMLDivElement>(null)
  const [stickyOn, setStickyOn] = useState(false)

  const logoutMutation = useLogout()

  useEffect(() => {
    const anchor = navAnchorRef.current
    if (!anchor) return
    const io = new IntersectionObserver(([entry]) => setStickyOn(!entry.isIntersecting), {
      rootMargin: '0px',
    })
    io.observe(anchor)
    return () => io.disconnect()
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <div className={`sticky${stickyOn ? ' is-on' : ''}`}>
        <div className="u-wrap sticky__in">
          <Link className="sticky__w" to="/">
            News <em>Triangulator</em>
          </Link>
          <nav className="sticky__nav" aria-label="Zkratky">
            <PrimaryNav compact />
          </nav>
          <span className="sticky__bar" aria-hidden="true" />
        </div>
      </div>

      <div className="utilbar">
        <div className="u-wrap utilbar__in">
          <span>{formatDate(new Date(), 'long')}</span>
          <span className="utilbar__r">
            {user && (
              <>
                <span>{user.email}</span>
                <button onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
                  {logoutMutation.isPending ? 'Odhlašování…' : 'Odhlásit se'}
                </button>
              </>
            )}
            <button type="button" onClick={cycleTheme}>
              {THEME_LABEL[theme]}
            </button>
          </span>
        </div>
      </div>

      <div className="mast">
        <div className="u-wrap mast__in">
          <Link className="mast__brand" to="/">
            <span className="mast__word">
              News <em>Triangulator</em>
            </span>
          </Link>
          <p className="mast__sub">Zprávy ověřené napříč zdroji</p>
        </div>
      </div>

      <div className="rubnav" ref={navAnchorRef}>
        <nav className="u-wrap rubnav__in" aria-label="Hlavní navigace">
          <PrimaryNav />
        </nav>
      </div>

      <div className="flex-1">{children}</div>

      <footer className="foot">
        <div className="u-wrap">
          <div className="foot__cols">
            <div>
              <h4>Triangulátor</h4>
              <p>
                News Triangulator srovnává zpravodajství napříč zdroji a odděluje shodu, rozpory, jedinečné
                zprávy a framing.
              </p>
            </div>
            <div>
              <h4>Procházet</h4>
              <ul>
                <li>
                  <Link to="/">Domů</Link>
                </li>
                <li>
                  <Link to="/history">{user?.role === 'ADMIN' ? 'Historie' : 'Články'}</Link>
                </li>
              </ul>
            </div>
            <div>
              <h4>Personál</h4>
              <ul>
                <li>
                  <Link to="/login">Přihlášení pro personál</Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="foot__bottom">
            <span>© News Triangulator</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
