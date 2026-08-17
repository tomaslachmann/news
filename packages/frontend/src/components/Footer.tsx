import { Link } from 'react-router-dom'
import { CONTAINER_CLASS } from '@/components/PageContainer'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

/** Wire Service footer (ticket 26, Variant A — winner of the masthead/footer/login/component
 *  prototype round). A dense, quietly-typeset sitemap, per the research doc's §9 finding that
 *  ProPublica's live footer is the one first-hand-verified footer pattern found: smaller/quieter
 *  type than the header, organized as a sitemap rather than a repeat of primary nav. Shares
 *  PageContainer's `CONTAINER_CLASS` (rather than a hand-typed `px-*`) so the footer's horizontal
 *  padding can't drift from every page's content. */
export function Footer() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  return (
    <footer className="mt-16 border-t bg-muted/20 font-sans text-sm">
      <div className={cn(CONTAINER_CLASS, 'grid gap-8 py-10 sm:grid-cols-3')}>
        <div>
          <p className="utility-label mb-3">O projektu</p>
          <p className="text-muted-foreground">
            News Triangulator srovnává zpravodajství napříč zdroji a odděluje shodu, rozpory, jedinečné zprávy
            a framing.
          </p>
        </div>
        <div>
          <p className="utility-label mb-3">Procházet</p>
          <ul className="flex flex-col gap-2">
            <li>
              <Link to="/" className="text-muted-foreground hover:text-foreground">
                Domů
              </Link>
            </li>
            <li>
              <Link to="/history" className="text-muted-foreground hover:text-foreground">
                {isAdmin ? 'Historie' : 'Články'}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="utility-label mb-3">Personál</p>
          <ul className="flex flex-col gap-2">
            <li>
              <Link to="/login" className="text-muted-foreground hover:text-foreground">
                Přihlášení pro personál
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className={cn(CONTAINER_CLASS, 'py-3 text-xs text-muted-foreground')}>© News Triangulator</div>
      </div>
    </footer>
  )
}
