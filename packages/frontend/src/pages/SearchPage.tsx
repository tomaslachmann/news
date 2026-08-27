import { Link, useSearchParams } from 'react-router-dom'
import { useEntitySearch } from '@/services/entities/hooks'
import { useArticleSearch } from '@/services/analyses/hooks'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import { ArchiveRow } from './HistoryPage'
import './EntityDetailPage.css'
import './HistoryPage.css'

/** Reader-facing search entry point (ticket 43, extended by ticket 83) — a dedicated page,
 *  reachable from the nav bar ("Hledat"), rather than a nav-bar-surfaced dropdown: keeps Chrome
 *  itself unchanged and gives search results (and their own loading/empty/error states) a real
 *  page to render into. One query, two independent result sections: entities (`GET
 *  /api/entities`, `pg_trgm` fuzzy name match) and Article content (`GET /api/search`, Postgres
 *  full-text search over each Article's headline + synthesized Dimension prose — see ticket 83's
 *  Answer for what's deliberately excluded). Neither section's failure affects the other. */
export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const submittedQuery = params.get('q') ?? ''

  const {
    data: entityResults,
    isLoading: entitiesLoading,
    isError: entitiesError,
  } = useEntitySearch(submittedQuery)
  const {
    data: articleResults,
    isLoading: articlesLoading,
    isError: articlesError,
    isFetched: articlesFetched,
  } = useArticleSearch(submittedQuery)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = new FormData(e.currentTarget).get('q')
    const trimmed = typeof value === 'string' ? value.trim() : ''
    setParams(trimmed ? { q: trimmed } : {})
  }

  const hasEntityResults = !!entityResults && entityResults.length > 0
  const hasArticleResults = !!articleResults && articleResults.length > 0
  const bothFetchedEmpty =
    !entitiesLoading &&
    !entitiesError &&
    !hasEntityResults &&
    articlesFetched &&
    !articlesError &&
    !hasArticleResults

  return (
    <div className="page-shell">
      <header className="screen-head">
        <div className="screen-head__k">Hledat</div>
        <h1 className="screen-head__t">Hledat</h1>
        <p className="screen-head__d">
          Vyhledejte osobu, organizaci, místo nebo zemi, nebo zadejte, co se má stát — prohledáme i obsah
          článků.
        </p>
      </header>

      <form className="entsearch" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__l" htmlFor="entity-search-q">
            Hledaný výraz
          </label>
          <input
            className="input"
            id="entity-search-q"
            name="q"
            // Keyed by the URL's own `q`, not React state: browser back/forward (or following a
            // different /search?q=... link in without a remount) needs the input's displayed
            // value to follow `submittedQuery` too — remounting via `key` does that without an
            // effect-driven setState (this repo's react-hooks/set-state-in-effect lint rule).
            key={submittedQuery}
            defaultValue={submittedQuery}
            placeholder="např. Petr Fiala, nebo unijní rozpočet"
          />
        </div>
        <button className="btn btn--primary" type="submit">
          Hledat
        </button>
      </form>

      {submittedQuery && bothFetchedEmpty && (
        <p className="note">Nic neodpovídá hledanému výrazu „{submittedQuery}“.</p>
      )}

      {submittedQuery && (
        <section>
          <div className="sechead">
            <h2 className="sechead__t">Entity</h2>
            <span className="sechead__rule" />
          </div>

          {entitiesLoading && <p className="note">Vyhledávání…</p>}
          {entitiesError && (
            <div className="error" style={{ marginTop: 'var(--sp-4)' }}>
              <p className="error__p">Vyhledávání entit selhalo.</p>
            </div>
          )}
          {!entitiesLoading && !entitiesError && !hasEntityResults && (
            <p className="note">Žádná entita neodpovídá hledanému výrazu.</p>
          )}
          {hasEntityResults && (
            <div className="evlist">
              {entityResults.map((r) => (
                <Link className="evrow" to={`/entity/${r.key}`} key={r.key}>
                  <span className="evrow__t hl">{r.canonicalName}</span>
                  <span className="evrow__d">
                    {ENTITY_TYPE_LABELS[r.type]} · {r.storyCount} zpráv
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {submittedQuery && (
        <section style={{ marginTop: 'var(--sp-6)' }}>
          <div className="sechead">
            <h2 className="sechead__t">Zprávy</h2>
            <span className="sechead__rule" />
          </div>

          {articlesLoading && <p className="note">Vyhledávání…</p>}
          {articlesError && (
            <div className="error" style={{ marginTop: 'var(--sp-4)' }}>
              <p className="error__p">Vyhledávání článků selhalo.</p>
            </div>
          )}
          {!articlesLoading && !articlesError && !hasArticleResults && (
            <p className="note">Žádný článek neodpovídá hledanému výrazu.</p>
          )}
          {hasArticleResults && (
            <section className="storylist">
              {articleResults.map((item) => (
                <ArchiveRow key={item.id} item={item} />
              ))}
            </section>
          )}
        </section>
      )}
    </div>
  )
}
