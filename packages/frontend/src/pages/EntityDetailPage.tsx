import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useEntityDetail } from '@/services/entities/hooks'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import { formatDate } from '@/lib/formatDate'
import { ENTITY_TYPE_LABELS, ENTITY_RELATION_TYPE_LABELS } from '@/lib/entityTypeLabels'
import { articlePath } from '@/lib/analysisRoutes'
import { entityInfoboxRows, timelineChartData } from './entityDetailViewModel'
import './EntityDetailPage.css'

export default function EntityDetailPage() {
  const { key } = useParams<{ key: string }>()
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useEntityDetail(key)

  const entity = data?.pages[0]
  // `events` accumulates across every loaded page; every other field is identical on every page
  // (only `events` is cursor-paginated server-side, ticket 42), so those are read off page 0.
  const events = useMemo(() => data?.pages.flatMap((p) => p.events.items) ?? [], [data])
  const infoboxRows = useMemo(() => (entity ? entityInfoboxRows(entity) : []), [entity])
  const timeline = useMemo(() => (entity ? timelineChartData(entity.mentionTimeline) : []), [entity])

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
      <nav className="ewcrumb" aria-label="Cesta">
        <Link to="/search">Entity</Link>
        <span aria-hidden="true">/</span>
        <span>{ENTITY_TYPE_LABELS[entity.type]}</span>
      </nav>

      <header className="ewhead">
        <div className="ewhead__k">{ENTITY_TYPE_LABELS[entity.type]}</div>
        <h1 className="ewhead__t">{entity.canonicalName}</h1>
        {entity.wikidataDescription && <p className="ewhead__dek">{entity.wikidataDescription}</p>}
      </header>

      <div className="layout">
        <div className="ewmain">
          {entity.wikipediaExtract && (
            <aside className="ewlead">
              <p className="ewlead__k">Kontext z Wikipedie</p>
              <p className="ewlead__p">{entity.wikipediaExtract}</p>
              <p className="ewlead__n">
                Externí encyklopedický text — ne zpravodajství tohoto nástroje.
                {entity.wikipediaUrl && (
                  <>
                    {' '}
                    <a href={entity.wikipediaUrl} target="_blank" rel="noopener noreferrer">
                      Číst celé na Wikipedii →
                    </a>
                  </>
                )}
              </p>
            </aside>
          )}

          {timeline.length > 0 && (
            <section>
              <div className="sechead">
                <h2 className="sechead__t">Zmínky v čase</h2>
                <span className="sechead__rule" />
              </div>
              <figure className="ewchart">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={timeline}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
                    <Bar dataKey="count" fill="var(--accent)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <figcaption className="ewchart__cap">
                  Počet zpracovaných článků zmiňujících tuto entitu, po měsících.
                </figcaption>
              </figure>
            </section>
          )}

          <section>
            <div className="sechead">
              <h2 className="sechead__t">Zprávy zmiňující tuto entitu</h2>
              <span className="sechead__rule" />
            </div>

            {events.length === 0 ? (
              <p className="note">Tuto entitu zatím žádná zpráva nezmiňuje.</p>
            ) : (
              <>
                {/* findEventsForEntity only surfaces COMPLETE Analyses (ADR 0035), so every link
                    goes to /article/:id unconditionally (ticket 52). */}
                <div className="evlist">
                  {events.map((e) => (
                    <Link className="evrow" to={articlePath(e.analysisId)} key={e.analysisId}>
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
                        tvrdí <Link to={articlePath(r.assertedBy.analysisId)}>{r.assertedBy.title}</Link>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="layout__rail">
          <section className="ewbox">
            {entity.image && (
              <figure className="ewbox__fig">
                <img src={entity.image.url} alt={entity.canonicalName} loading="lazy" />
                <figcaption>
                  {[entity.image.author, entity.image.license].filter(Boolean).join(' · ') ||
                    'Wikimedia Commons'}
                  {' · '}
                  <a href={entity.image.sourceUrl} target="_blank" rel="noopener noreferrer">
                    zdroj
                  </a>
                </figcaption>
              </figure>
            )}

            <dl className="ewfacts">
              {infoboxRows.map((row) => (
                <div className="ewfacts__row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>

            {(entity.wikidataId || entity.wikipediaUrl) && (
              <div className="ewbox__links">
                {entity.wikipediaUrl && (
                  <a href={entity.wikipediaUrl} target="_blank" rel="noopener noreferrer">
                    Wikipedie
                  </a>
                )}
                {entity.wikidataId && (
                  <a
                    href={`https://www.wikidata.org/wiki/${entity.wikidataId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Wikidata ({entity.wikidataId})
                  </a>
                )}
              </div>
            )}
          </section>

          {entity.coMentions.length > 0 && (
            <section className="ewco">
              <div className="sechead">
                <h2 className="sechead__t">Často spolu s</h2>
                <span className="sechead__rule" />
              </div>
              <ul className="ewco__l">
                {entity.coMentions.map((c) => (
                  <li key={c.key}>
                    <Link className="hl" to={`/entity/${c.key}`}>
                      {c.canonicalName}
                    </Link>
                    <span className="ewco__n">{c.sharedStoryCount}×</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
