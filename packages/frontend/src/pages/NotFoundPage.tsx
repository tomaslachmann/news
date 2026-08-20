import { Link } from 'react-router-dom'
import './NotFoundPage.css'

export default function NotFoundPage() {
  return (
    <div className="page-shell state-page">
      <section className="state">
        <div className="state__mark">404</div>
        <h1 className="state__t">Tahle stránka tu není</h1>
        <p className="state__d">
          Odkaz může být zastaralý nebo událost už není dostupná. Zprávy najdete na přehledu.
        </p>
        <div className="state__actions">
          <Link className="btn btn--primary" to="/">
            Na přehled zpráv
          </Link>
          <Link className="btn" to="/history">
            Do historie
          </Link>
        </div>
      </section>
    </div>
  )
}
