import { useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Gauge } from '@/components/Gauge'
import { ShareBar } from '@/components/ShareBar'
import { NarrativeArticle } from '@/components/NarrativeArticle'
import { SumBox, CompareList } from '@/components/AnalysisDimensionSections'
import {
  MIN_SOURCES_FOR_GAUGE,
  recordAnalysisView,
  type AnalysisDetail,
  type AnalysisDimensions,
  type CoverageInfo,
  type RelatedEventItem,
  type ThreadSummaryItem,
  type EntityMentionItem,
} from '@/services/analyses'
import { useAnalysisDetail } from '@/services/analyses/hooks'
import { formatDate } from '@/lib/formatDate'
import { RELATION_TYPE_LABELS } from '@/lib/storyRelationTypeLabels'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import { articlePath } from '@/lib/analysisRoutes'
import { threadPath } from '@/lib/threadRoutes'
import NotFoundPage from './NotFoundPage'
import { ErrorState } from './AnalysisPage'
import './AnalysisPage.css'

/** Ticket 38 / ADR 0030 supplies `analysis.sourceOverlap`. Withheld below
 *  MIN_SOURCES_FOR_GAUGE sources — a ten-segment bar over that few sources implies precision the
 *  data doesn't have — in which case the byline stays source-count + framing-signal-count only,
 *  same as before ticket 38 shipped. Gated on `sourceOverlap.sourceCount`, not
 *  `analysis.coverages.length`: the percentage was computed from successfully-extracted sources
 *  only, which can be fewer than every attached Coverage (one whose scrape succeeded but
 *  extraction failed schema validation still counts toward `coverages.length`). */
function AnalysisByline({
  analysis,
  dimensions,
}: {
  analysis: AnalysisDetail
  dimensions: AnalysisDimensions
}) {
  const gaugeInfo =
    analysis.sourceOverlap && analysis.sourceOverlap.sourceCount >= MIN_SOURCES_FOR_GAUGE
      ? analysis.sourceOverlap
      : undefined
  return (
    <div className="byline">
      <span className="byline__grp">
        <b>{analysis.coverages.length}</b> zdrojů
      </span>
      {gaugeInfo && (
        <>
          <span className="byline__sep">·</span>
          <span className="byline__grp">
            překryv zdrojů <b>{gaugeInfo.percentage} %</b>
            <Gauge
              pct={gaugeInfo.percentage}
              bad={gaugeInfo.tier === 'bad'}
              ariaLabel={`Překryv zdrojů ${gaugeInfo.percentage} procent`}
            />
          </span>
        </>
      )}
      {dimensions.framing.length > 0 && (
        <>
          <span className="byline__sep">·</span>
          <span className="byline__grp">{dimensions.framing.length} framingových signálů</span>
        </>
      )}
    </div>
  )
}

function SourceList({ coverages }: { coverages: CoverageInfo[] }) {
  if (coverages.length === 0) return null
  return (
    <ol className="srclist">
      {coverages.map((c) => (
        <li className="srcrow" key={c.id}>
          <span className="srcrow__w">
            {c.outlet}
            {c.status === 'extraction-failed' && <span className="chip chip--bad">selhalo</span>}
            {c.status === 'pending' && <span className="chip">čeká</span>}
          </span>
          {c.publishedAt && <span className="srcrow__t">{formatDate(c.publishedAt)}</span>}
          <span className="srcrow__b">
            <a href={c.articleUrl} target="_blank" rel="noopener noreferrer">
              → Číst originál
            </a>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** ticket 17: a longer-running storyline this Article is part of. The reference's own
 *  .threadband is a single teaser band linking out to a thread.html detail page — ticket 68/69
 *  built that real destination (`/thread/:slug`), so the heading below links there now; each
 *  member row still links to its own /article/:id (ticket 52) directly. The current Article
 *  appears in the list too, non-linked, so a reader always sees where "here" sits in the arc. */
function ThreadSection({ thread }: { thread: ThreadSummaryItem | undefined }) {
  if (!thread) return null
  return (
    <section>
      <div className="sechead">
        <h2 className="sechead__t">
          Součást vlákna: <Link to={threadPath(thread.slug)}>{thread.title}</Link>
        </h2>
        <span className="sechead__rule" />
      </div>
      {thread.members.map((member) =>
        member.isCurrent ? (
          <div className="threadband" key={member.analysisId}>
            <span className="threadband__h">{member.title}</span>
            <span className="threadband__m">tento článek</span>
          </div>
        ) : (
          <Link className="threadband" to={articlePath(member.analysisId)} key={member.analysisId}>
            <span className="threadband__h hl">{member.title}</span>
          </Link>
        )
      )}
    </section>
  )
}

function RelatedEventsSection({ events }: { events: RelatedEventItem[] }) {
  if (events.length === 0) return null
  return (
    <section>
      <div className="sechead">
        <h2 className="sechead__t">Další zprávy</h2>
        <span className="sechead__rule" />
      </div>
      <div className="cards">
        {events.map((event) => (
          <article className="card" key={event.analysisId}>
            <span className="kicker kicker--ink">{RELATION_TYPE_LABELS[event.type]}</span>
            <Link to={articlePath(event.analysisId)}>
              <h3 className="card__h hl">{event.title}</h3>
            </Link>
            <p className="card__p">zdrojů: {event.coverageCount}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

/** "Entity ve zprávě" rail (ticket 43) — every entity this Article's Story mentions, most
 *  salient first (backend-ordered), each linking to its own `/entity/:key` page so a reader can
 *  navigate into the entity graph without a separate search. */
function EntityMentionsSection({ entities }: { entities: EntityMentionItem[] }) {
  if (entities.length === 0) return null
  return (
    <section>
      <div className="railhead">
        <h2 className="railhead__t">Entity ve zprávě</h2>
        <span className="railhead__x">{entities.length}</span>
      </div>
      <div className="ents">
        {entities.map((e) => (
          <Link className="erow" to={`/entity/${e.key}`} key={e.key}>
            <span className="erow__dot">{ENTITY_TYPE_LABELS[e.type][0]}</span>
            <span>
              <span className="erow__n hl">{e.canonicalName}</span>
              <span className="erow__k">{ENTITY_TYPE_LABELS[e.type]}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** The real, complete Article page — .arthead/.byline/.sumbox/.prose/.claim/.compare/.threadband/
 *  .artfoot/.cards, flowing continuously (no tabs, see AnalysisPage.css's file header). */
function CompleteAnalysis({ analysis }: { analysis: AnalysisDetail }) {
  const dimensions = analysis.synthesisResult as AnalysisDimensions
  const coverageCount = analysis.coverages.length
  const totalItems =
    dimensions.agreement.length +
    dimensions.contradiction.length +
    dimensions.uniqueReporting.length +
    dimensions.framing.length
  const topContradiction = [...dimensions.contradiction].sort(
    (a, b) => b.attributions.length - a.attributions.length
  )[0]

  return (
    <>
      <div className="u-wrap">
        <nav className="crumbs" aria-label="Cesta">
          <Link to="/">Domů</Link>
          {analysis.thread && (
            <>
              <span className="crumbs__sep">/</span>
              <span>{analysis.thread.title}</span>
            </>
          )}
          <span className="crumbs__sep">/</span>
          <span aria-current="page">{analysis.title}</span>
        </nav>
      </div>

      <div className="u-wrap layout">
        <article className="artbody">
          <header className="arthead">
            <h1 className="arthead__h">{analysis.title}</h1>
            <AnalysisByline analysis={analysis} dimensions={dimensions} />
            {/* Keyed by id: ArticlePage.tsx reuses one component instance across an in-place
                navigation between two Articles (see the effect below), so without a key the
                "copied" confirmation and its pending timer would leak from the previous Article
                onto the next one (code review, ticket 81) — React's own recommended fix for
                "reset all state when this changes" is a key, not an effect. */}
            <ShareBar key={analysis.id} title={analysis.title} url={window.location.href} />
          </header>

          {totalItems > 0 && <SumBox dimensions={dimensions} />}

          {analysis.narrative && analysis.narrative.blocks.length > 0 && (
            <NarrativeArticle document={analysis.narrative} leadImage={analysis.leadImage} />
          )}

          {topContradiction && (
            <div className="claim claim--bad">
              <span className="claim__l">Tvrzení v rozporu</span>
              <p className="claim__t">{topContradiction.prose}</p>
              <p className="claim__d">
                {topContradiction.attributions.length} z {coverageCount} zdrojů:{' '}
                {topContradiction.attributions.map((a) => a.outlet).join(', ')}
              </p>
            </div>
          )}

          {dimensions.agreement.length > 0 && (
            <section>
              <div className="sechead">
                <h2 className="sechead__t">Shoda</h2>
                <span className="sechead__rule" />
              </div>
              <CompareList items={dimensions.agreement} coverageCount={coverageCount} />
            </section>
          )}

          <section aria-labelledby="cmpT">
            <div className="sechead">
              <h2 className="sechead__t" id="cmpT">
                Srovnání tvrzení
              </h2>
              <span className="sechead__rule" />
            </div>
            <CompareList items={dimensions.contradiction} coverageCount={coverageCount} markConflict />
          </section>

          {dimensions.uniqueReporting.length > 0 && (
            <section>
              <div className="sechead">
                <h2 className="sechead__t">Unikátní zprávy</h2>
                <span className="sechead__rule" />
              </div>
              <CompareList items={dimensions.uniqueReporting} coverageCount={coverageCount} />
            </section>
          )}

          {dimensions.framing.length > 0 && (
            <section>
              <div className="sechead">
                <h2 className="sechead__t">Framing</h2>
                <span className="sechead__rule" />
              </div>
              <CompareList items={dimensions.framing} coverageCount={coverageCount} />
            </section>
          )}

          <ThreadSection thread={analysis.thread} />

          <div className="artfoot">
            <p className="artfoot__n">Sestaveno z {coverageCount} zdrojů</p>
            <p className="artfoot__r">{formatDate(analysis.createdAt, 'long')}</p>
          </div>

          <RelatedEventsSection events={analysis.relatedEvents} />
        </article>

        <aside className="layout__rail">
          <section aria-labelledby="srcT">
            <div className="railhead">
              <h2 className="railhead__t" id="srcT">
                Zdroje této zprávy
              </h2>
              <span className="railhead__x">{coverageCount}</span>
            </div>
            <SourceList coverages={analysis.coverages} />
          </section>

          <EntityMentionsSection entities={analysis.entities} />

          <section>
            <div className="box">
              <p className="box__t">Poznámka k metodice</p>
              <p className="note">
                Zprávu skládáme z nezávislých zdrojů. Neposuzujeme, kdo má pravdu. Ukazujeme, na čem se zdroje
                shodují, v čem se liší a co zůstává bez primárního dokladu.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}

/** The public, reader-facing Article route (ticket 52) — splits off from `/analysis/:id`
 *  (`AnalysisPage`, now Admin-only), which keeps the in-progress monitoring view. Renders only a
 *  COMPLETE Analysis with its SynthesisResult; every other *Analysis-state* outcome
 *  (draft/pending/streaming/failed, or a genuinely missing id) renders the exact same
 *  `NotFoundPage` a public reader would see for a dead link — a public reader must never be able
 *  to distinguish "doesn't exist" from "not published yet" from "processing failed," and must
 *  never see the process-monitoring UI those states drive on the Admin route. A genuine fetch
 *  failure (`isError` — a network blip, a 500) is a different situation and gets `AnalysisPage`'s
 *  own retryable `ErrorState` instead: it carries no information about the underlying Analysis at
 *  all, so there's nothing to leak by telling a reader "try again" rather than "not found."
 *  `GET /api/analyses/:id` enforces the COMPLETE-only bound server-side too for a non-Admin caller
 *  (see `getAnalysisDetail`'s own docstring) — this page's status check is a rendering choice on
 *  top of that, not the only thing standing between a public reader and an in-progress Analysis's
 *  internals. Also fires the homepage "Nejčtenější" readership beacon (ticket 61) once a real
 *  Article is confirmed renderable — see the effect below. */
export default function ArticlePage() {
  const { id } = useParams<{ id: string }>()
  const { data: analysis, isLoading, isError } = useAnalysisDetail(id)
  const recordedViewForId = useRef<string | undefined>(undefined)

  // Fires the readership beacon (ticket 61) exactly once per distinct `id`, and only once the
  // fetch has confirmed this is a real, renderable, COMPLETE Article — never during loading, never
  // for a 404/not-yet-published/error outcome. Guards by *which id* was last recorded, not a plain
  // boolean: `/article/:id` is a single route (App.tsx), so React Router reuses this same
  // component instance across an in-place navigation between two articles (e.g. clicking a
  // thread/related-event Link below) rather than unmounting/remounting it — a plain "have I ever
  // recorded a view this mount" boolean would permanently suppress the beacon for every article
  // after the first one visited that way. Comparing against the id instead still collapses React
  // 18 StrictMode's dev-only double-invoke and any unrelated refetch of the same Article into one
  // beacon, while still firing again for a genuinely different Article reached without a remount.
  useEffect(() => {
    if (!id || !analysis || analysis.status !== 'complete' || !analysis.synthesisResult) return
    if (recordedViewForId.current === id) return
    recordedViewForId.current = id
    void recordAnalysisView(id)
  }, [id, analysis])

  if (isLoading) {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <p className="note">Načítání článku…</p>
      </div>
    )
  }

  if (isError) {
    return <ErrorState message="Nepodařilo se načíst článek." />
  }

  if (!analysis || analysis.status !== 'complete' || !analysis.synthesisResult) {
    return <NotFoundPage />
  }

  return (
    <TooltipProvider>
      <CompleteAnalysis analysis={analysis} />
    </TooltipProvider>
  )
}
