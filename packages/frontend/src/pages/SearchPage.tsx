import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useEntitySearch } from '@/services/entities/hooks'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import './EntityDetailPage.css'

/** Reader-facing entity search entry point (ticket 43) — a dedicated page, reachable from the
 *  nav bar ("Hledat"), rather than a nav-bar-surfaced dropdown: keeps Chrome itself unchanged and
 *  gives search results (and their own loading/empty/error states) a real page to render into. */
export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const submittedQuery = params.get('q') ?? ''
  const [query, setQuery] = useState(submittedQuery)

  const { data: results, isLoading, isError, isFetched } = useEntitySearch(submittedQuery)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setParams(query.trim() ? { q: query.trim() } : {})
  }

  return (
    <div className="page-shell">
      <header className="screen-head">
        <div className="screen-head__k">Entity</div>
        <h1 className="screen-head__t">Hledat entitu</h1>
        <p className="screen-head__d">
          Vyhledejte osobu, organizaci, místo nebo zemi a projděte si, co o ní tento nástroj napříč zprávami
          zjistil.
        </p>
      </header>

      <form className="entsearch" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__l" htmlFor="entity-search-q">
            Jméno entity
          </label>
          <input
            className="input"
            id="entity-search-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="např. Petr Fiala"
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={!query.trim()}>
          Hledat
        </button>
      </form>

      {submittedQuery && isLoading && <p className="note">Vyhledávání…</p>}

      {submittedQuery && isError && (
        <div className="error" style={{ marginTop: 'var(--sp-4)' }}>
          <p className="error__p">Vyhledávání entit selhalo.</p>
        </div>
      )}

      {submittedQuery && isFetched && results && results.length === 0 && (
        <p className="note">Žádná entita neodpovídá hledanému výrazu „{submittedQuery}“.</p>
      )}

      {results && results.length > 0 && (
        <div className="evlist">
          {results.map((r) => (
            <Link className="evrow" to={`/entity/${r.key}`} key={r.key}>
              <span className="evrow__t hl">{r.canonicalName}</span>
              <span className="evrow__d">
                {ENTITY_TYPE_LABELS[r.type]} · {r.storyCount} zpráv
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
