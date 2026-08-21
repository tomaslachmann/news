import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useEntityDetail } from '@/services/entities/hooks'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import { formatDate } from '@/lib/formatDate'
import { ENTITY_TYPE_LABELS, ENTITY_RELATION_TYPE_LABELS } from '@/lib/entityTypeLabels'
import './EntityDetailPage.css'

export default function EntityDetailPage() {
  const { key } = useParams<{ key: string }>()
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useEntityDetail(key)

  const entity = data?.pages[0]
  // `events` accumulates across every loaded page; `canonicalName`/`type`/`wikidataId`/`relations`
  // are identical on every page (only `events` is cursor-paginated server-side, ticket 42), so
  // those are read off page 0 alone.
  const events = useMemo(() => data?.pages.flatMap((p) => p.events.items) ?? [], [data])

  if (isLoading) {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <p className="note">Načítání entity…</p>
      </div>
    )
  }

  if (isError || !entity) {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <p className="note" style={{ color: 'var(--bad)', fontSize: 'var(--text-body)' }}>
          Entita nebyla nalezena.
        </p>
        <p style={{ marginTop: 'var(--sp-3)' }}>
          <Link to="/search" className="btn btn--micro">
            Zpět na hledání
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <header className="screen-head">
        <div className="screen-head__k">{ENTITY_TYPE_LABELS[entity.type]}</div>
        <h1 className="screen-head__t">{entity.canonicalName}</h1>
        <p className="screen-head__d">
          {entity.wikidataId ? (
            <>
              Wikidata:{' '}
              <a
                href={`https://www.wikidata.org/wiki/${entity.wikidataId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {entity.wikidataId}
              </a>
            </>
          ) : (
            'Bez propojení na Wikidata.'
          )}
        </p>
        <p className="screen-head__d">
          {entity.aliases.length > 0 ? `Známé aliasy: ${entity.aliases.join(', ')}` : 'Bez známých aliasů.'}
        </p>
      </header>

      <section>
        <div className="sechead">
          <h2 className="sechead__t">Zprávy zmiňující tuto entitu</h2>
          <span className="sechead__rule" />
        </div>

        {events.length === 0 ? (
          <p className="note">Tuto entitu zatím žádná zpráva nezmiňuje.</p>
        ) : (
          <>
            <div className="evlist">
              {events.map((e) => (
                <Link className="evrow" to={`/analysis/${e.analysisId}`} key={e.analysisId}>
                  <span className="evrow__t hl">{e.title}</span>
                  <span className="evrow__d">{formatDate(e.createdAt)}</span>
                </Link>
              ))}
            </div>
            {hasNextPage && (
              <div className="pager">
                <span>{events.length} načteno</span>
                <LoadMoreButton onClick={() => void fetchNextPage()} isFetching={isFetchingNextPage} />
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <div className="sechead">
          <h2 className="sechead__t">Vztahy</h2>
          <span className="sechead__rule" />
        </div>

        {entity.relations.length === 0 ? (
          <p className="note">K této entitě zatím nejsou zaznamenány žádné vztahy.</p>
        ) : (
          <ul className="erels">
            {entity.relations.map((r) => (
              <li className="erel" key={r.id}>
                <span className="erel__dir" aria-hidden="true">
                  {r.direction === 'from' ? '→' : '←'}
                </span>
                <span className="erel__body">
                  <span className="erel__type">{ENTITY_RELATION_TYPE_LABELS[r.type]}</span>{' '}
                  <Link className="hl" to={`/entity/${r.otherEntity.key}`}>
                    {r.otherEntity.canonicalName}
                  </Link>
                  <span className="erel__by">
                    tvrdí <Link to={`/analysis/${r.assertedBy.analysisId}`}>{r.assertedBy.title}</Link>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
