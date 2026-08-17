import { Link } from 'react-router-dom'
import { useChromeVariant } from '@/components/PrototypeSwitcher'

/**
 * PROTOTYPE-ONLY — ticket 26's footer round. No footer exists on `main` today; this explores
 * three real candidates. Switchable via `?variant=A|B|C`, dev builds only. Not meant to merge —
 * the winning direction gets rebuilt for real once ticket 26 is implemented.
 */
export function PrototypeFooter() {
  const variant = useChromeVariant()
  if (import.meta.env.PROD) return null

  if (variant === 'B') return <FooterB />
  if (variant === 'C') return <FooterC />
  return <FooterA />
}

/** Variant A — ProPublica-style dense sitemap footer, quiet small type under the header's larger nameplate. */
function FooterA() {
  return (
    <footer className="mt-16 border-t bg-muted/20 font-sans text-sm">
      <div className="container mx-auto grid gap-8 px-6 py-10 sm:grid-cols-3">
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
                Články
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
      <div className="border-t px-6 py-3 text-xs text-muted-foreground">© News Triangulator</div>
    </footer>
  )
}

/** Variant B — lean single-row utility strip, opposite density of A. */
function FooterB() {
  return (
    <footer className="mt-16 border-t font-sans text-xs text-muted-foreground">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <span>© News Triangulator</span>
        <nav className="flex items-center gap-3">
          <Link to="/history" className="hover:text-foreground">
            Články
          </Link>
          <span aria-hidden>·</span>
          <Link to="/login" className="hover:text-foreground">
            Personál
          </Link>
        </nav>
      </div>
    </footer>
  )
}

/** Variant C — Bloomberg-Terminal-plain: one line, no border, no columns. */
function FooterC() {
  return (
    <footer className="mt-16 font-mono text-xs text-muted-foreground">
      <div className="container mx-auto flex justify-end px-6 py-4">
        <Link to="/login" className="hover:text-foreground">
          News Triangulator — Personál
        </Link>
      </div>
    </footer>
  )
}
