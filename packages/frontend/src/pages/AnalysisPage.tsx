import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Gauge } from '@/components/Gauge'
import {
  openAnalysisStream,
  MIN_SOURCES_FOR_GAUGE,
  type AnalysisDetail,
  type Attribution,
  type AnalysisDimensions,
  type DimensionItem,
  type CoverageInfo,
  type RelatedEventItem,
  type ThreadSummaryItem,
  type EntityMentionItem,
} from '@/services/analyses'
import { useAnalysisDetail } from '@/services/analyses/hooks'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/formatDate'
import { RELATION_TYPE_LABELS } from '@/lib/storyRelationTypeLabels'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import { WordingDemoSection, ValueVariantsDemoSection } from './AnalysisPage.devDemos'
import './AnalysisPage.css'

type ExtractionState =
  | { phase: 'pending' }
  | { phase: 'complete'; claimCount: number; attributedClaimCount: number; framingSignalCount: number }
  | { phase: 'error'; error: string }

type StreamPhase = 'extracting' | 'synthesising' | 'failed'

interface OutletRow {
  coverageId: string
  outlet: string
  title?: string
  articleUrl: string
  status: CoverageInfo['status']
  extraction: ExtractionState
}

/** .source-status stays a plain state word (Čeká/Hotovo/an error) — the reference's own
 *  information architecture keeps per-row detail simple and moves the claim/citation/framing
 *  *counts* to the aggregate .rail-stat totals instead, not repeated per source. */
function ExtractionBadge({ state }: { state: ExtractionState }) {
  if (state.phase === 'pending') {
    return <span className="source-status">Čeká</span>
  }
  if (state.phase === 'complete') {
    return <span className="source-status is-ok">Hotovo</span>
  }
  return <span className="source-status is-error">{state.error}</span>
}

function OutletBadge({ attribution }: { attribution: Attribution }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a href={attribution.articleUrl} target="_blank" rel="noopener noreferrer" className="chip">
          {attribution.outlet}
        </a>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{attribution.czechQuote}</p>
      </TooltipContent>
    </Tooltip>
  )
}

// A real <button> (not a bare <span>) so Radix's Tooltip opens on tap via the focus event it
// already listens for, not just hover — the touch fallback a citation marker needs, since hover
// has no mobile equivalent.
function CitationMarker({ index, attribution }: { index: number; attribution: Attribution }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="citeref">
          [{index}]
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">
          <span className="font-semibold">{attribution.outlet}:</span> {attribution.czechQuote}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

const MAX_REFERENCE_EXCERPT_LENGTH = 100

function truncateExcerpt(text: string): string {
  if (text.length <= MAX_REFERENCE_EXCERPT_LENGTH) return text
  return text.slice(0, MAX_REFERENCE_EXCERPT_LENGTH).trimEnd() + '…'
}

/** The Cross-Source Narrative (ADR 0012) — continuous prose with inline numbered citations, not
 *  the card-per-segment layout the dimension lists (.compare/.cmp) below use for those; the
 *  Narrative is meant to read as one piece of writing. Every attribution is numbered once per
 *  source article — a source cited more than once across the Narrative reuses its existing
 *  number rather than getting a new entry. */
function NarrativeArticle({ segments }: { segments: DimensionItem[] }) {
  const references: Attribution[] = []
  const refIndexFor = (a: Attribution) => {
    const existing = references.findIndex((r) => r.articleUrl === a.articleUrl)
    if (existing >= 0) return existing + 1
    references.push(a)
    return references.length
  }
  const rendered = segments.map((seg) => ({
    prose: seg.prose,
    refs: seg.attributions.map((a) => ({ index: refIndexFor(a), attribution: a })),
  }))

  return (
    <div className="prose">
      {rendered.map((seg, i) => (
        <p key={i}>
          {seg.prose}
          {seg.refs.map(({ index, attribution }) => (
            <CitationMarker key={index} index={index} attribution={attribution} />
          ))}
        </p>
      ))}

      {references.length > 0 && (
        <>
          <h2>Zdroje</h2>
          <ol className="refs">
            {references.map((r, i) => (
              <li key={i}>
                <b>
                  [{i + 1}] {r.outlet}
                </b>{' '}
                — „{truncateExcerpt(r.czechQuote)}“{' '}
                <a href={r.articleUrl} target="_blank" rel="noopener noreferrer">
                  → Číst originál
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

/** Deviation on top of the reference (ticket's own planned design change): widened from 3
 *  columns to 4 to carry all four Analysis Dimensions — +agreement, ×contradiction,
 *  ?uniqueReporting, ~framing (the fourth takes --mid, no new accent colour introduced). The
 *  reference's own third column ("open questions") has no data behind it; its "?"/ink-3 styling
 *  is reused for uniqueReporting instead rather than dropped outright. All four columns render
 *  unconditionally, even empty — the reader should see nothing was forgotten, not just absence. */
function SumBox({ dimensions }: { dimensions: AnalysisDimensions }) {
  const total =
    dimensions.agreement.length +
    dimensions.contradiction.length +
    dimensions.uniqueReporting.length +
    dimensions.framing.length
  if (total === 0) return null

  const col = (mod: string, title: string, items: DimensionItem[]) => (
    <div className={`sumbox__col sumbox--${mod}`}>
      <p className="sumbox__t">
        {title}
        <span className="sumbox__n">{items.length}</span>
      </p>
      <ul className="sumbox__l">
        {items.map((item, i) => (
          <li key={i}>
            <span>{truncateExcerpt(item.prose)}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="sumbox">
      {col('agree', 'Zdroje se shodují', dimensions.agreement)}
      {col('differ', 'Zdroje se rozcházejí', dimensions.contradiction)}
      {col('open', 'Unikátní zprávy', dimensions.uniqueReporting)}
      {col('framing', 'Framing', dimensions.framing)}
    </div>
  )
}

/** One row per dimension item — .compare/.cmp, the reference's "which sentence has how much
 *  support" list. markConflict adds the red left-border rozpor treatment (:has(.chip--bad) in
 *  AnalysisPage.css), used only for the contradiction dimension. Outlet attributions render as
 *  plain .chip badges in .cmp__v in place of the reference's .vals structured value list — our
 *  data is prose + attributions, never discrete per-source values. */
function CompareList({
  items,
  coverageCount,
  markConflict,
}: {
  items: DimensionItem[]
  coverageCount: number
  markConflict?: boolean
}) {
  if (items.length === 0) {
    return <p className="note">V této kategorii nic není.</p>
  }
  return (
    <ol className="compare">
      {items.map((item, i) => (
        <li className="cmp" key={i}>
          <p className="cmp__t">{item.prose}</p>
          <div className="cmp__m">
            <span>
              <b>{item.attributions.length}</b> z {coverageCount} zdrojů
            </span>
            {markConflict && <span className="chip chip--bad">rozpor</span>}
          </div>
          <div className="cmp__v">
            {item.attributions.map((a, j) => (
              <OutletBadge key={j} attribution={a} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  )
}

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
 *  .threadband is a single teaser band linking out to a thread.html detail page we don't have
 *  (no /thread route exists yet) — used here instead as the row style for every real member of
 *  the thread, each linking to its own /analysis/:id, since that's the real destination we do
 *  have. The current Article appears in the list too, non-linked, so a reader always sees where
 *  "here" sits in the arc. */
function ThreadSection({ thread }: { thread: ThreadSummaryItem | undefined }) {
  if (!thread) return null
  return (
    <section>
      <div className="sechead">
        <h2 className="sechead__t">Součást vlákna: {thread.title}</h2>
        <span className="sechead__rule" />
      </div>
      {thread.members.map((member) =>
        member.isCurrent ? (
          <div className="threadband" key={member.analysisId}>
            <span className="threadband__h">{member.title}</span>
            <span className="threadband__m">tento článek</span>
          </div>
        ) : (
          <Link className="threadband" to={`/analysis/${member.analysisId}`} key={member.analysisId}>
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
            <Link to={`/analysis/${event.analysisId}`}>
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

function ErrorState({ message }: { message: string }) {
  return (
    <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
      <p className="note" style={{ color: 'var(--bad)', fontSize: 'var(--text-body)' }}>
        {message}
      </p>
      <p style={{ marginTop: 'var(--sp-3)' }}>
        <Link to="/" className="btn btn--micro">
          Zkusit znovu
        </Link>
      </p>
    </div>
  )
}

function StreamingAnalysis({ id, title }: { id: string; title: string }) {
  const [rows, setRows] = useState<OutletRow[]>([])
  const [streamError, setStreamError] = useState<string | null>(null)
  const [phase, setPhase] = useState<StreamPhase>('extracting')
  const [synthesisError, setSynthesisError] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<AnalysisDimensions | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = openAnalysisStream(id, {
      onSourcesConfirmed: (event) => {
        setRows(
          event.coverages.map((c) => ({
            coverageId: c.id,
            outlet: c.outlet,
            title: c.title,
            articleUrl: c.articleUrl,
            status: c.status,
            extraction:
              c.status === 'extraction-failed'
                ? { phase: 'error', error: 'Text článku není k dispozici' }
                : { phase: 'pending' },
          }))
        )
      },

      onExtractionComplete: (event) => {
        setRows((prev) =>
          prev.map((r) =>
            r.coverageId === event.coverageId
              ? {
                  ...r,
                  extraction: {
                    phase: 'complete',
                    claimCount: event.claimCount,
                    attributedClaimCount: event.attributedClaimCount,
                    framingSignalCount: event.framingSignalCount,
                  },
                }
              : r
          )
        )
      },

      onExtractionError: (event) => {
        setRows((prev) =>
          prev.map((r) =>
            r.coverageId === event.coverageId
              ? { ...r, extraction: { phase: 'error', error: event.error } }
              : r
          )
        )
      },

      onExtractionSettled: () => setPhase('synthesising'),

      onSynthesisComplete: (event) => {
        setDimensions(event.dimensions)
        es.close()
      },

      onSynthesisError: (event) => {
        setPhase('failed')
        setSynthesisError(event.error)
        es.close()
      },
    })

    es.onerror = () => {
      setStreamError('Spojení s datovým proudem analýzy bylo přerušeno.')
      es.close()
    }

    esRef.current = es
    return () => {
      es.close()
      esRef.current = null
    }
  }, [id])

  // Single pass over `rows` (re-run only when it changes, not on every render) rather than four
  // separate filter/reduce scans — rows updates on every SSE extraction event during streaming.
  // Computed unconditionally, above the early returns below, per the Rules of Hooks.
  const { doneCount, completedCount, claimTotal, attributedTotal, framingTotal } = useMemo(() => {
    let doneCount = 0
    let completedCount = 0
    let claimTotal = 0
    let attributedTotal = 0
    let framingTotal = 0
    for (const r of rows) {
      if (r.extraction.phase !== 'pending') doneCount++
      if (r.extraction.phase === 'complete') {
        completedCount++
        claimTotal += r.extraction.claimCount
        attributedTotal += r.extraction.attributedClaimCount
        framingTotal += r.extraction.framingSignalCount
      }
    }
    return { doneCount, completedCount, claimTotal, attributedTotal, framingTotal }
  }, [rows])

  if (dimensions) {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <header className="arthead">
          <h1 className="arthead__h">{title}</h1>
          <p style={{ marginTop: 'var(--sp-2)', color: 'var(--ok)', fontSize: 'var(--text-small)' }}>
            Analýza dokončena
          </p>
        </header>
        <SumBox dimensions={dimensions} />
        <section>
          <div className="sechead">
            <h2 className="sechead__t">Shoda</h2>
            <span className="sechead__rule" />
          </div>
          <CompareList items={dimensions.agreement} coverageCount={rows.length} />
        </section>
        <section>
          <div className="sechead">
            <h2 className="sechead__t">Srovnání tvrzení</h2>
            <span className="sechead__rule" />
          </div>
          <CompareList items={dimensions.contradiction} coverageCount={rows.length} markConflict />
        </section>
        <section>
          <div className="sechead">
            <h2 className="sechead__t">Unikátní zprávy</h2>
            <span className="sechead__rule" />
          </div>
          <CompareList items={dimensions.uniqueReporting} coverageCount={rows.length} />
        </section>
        <section>
          <div className="sechead">
            <h2 className="sechead__t">Framing</h2>
            <span className="sechead__rule" />
          </div>
          <CompareList items={dimensions.framing} coverageCount={rows.length} />
        </section>
      </div>
    )
  }

  if (phase === 'failed' && synthesisError) {
    return <ErrorState message={synthesisError} />
  }

  const total = rows.length
  const isExtracting = phase === 'extracting'
  const isSynthesising = phase === 'synthesising'

  return (
    <div className="page-shell">
      <header className="screen-head">
        <div className="screen-head__k">Živá analýza</div>
        <h1 className="screen-head__t">{title}</h1>
        <div className="byline">
          <span className="byline__grp">
            <b>{total}</b> zdrojů
          </span>
          <span className="byline__sep">·</span>
          <span className="byline__grp">
            <span className="live">
              <i /> probíhá
            </span>
          </span>
        </div>
      </header>

      {streamError && (
        <p style={{ marginTop: 'var(--sp-4)', color: 'var(--bad)', fontSize: 'var(--text-small)' }}>
          {streamError}
        </p>
      )}

      {rows.length === 0 && !streamError && (
        <p style={{ marginTop: 'var(--sp-4)', color: 'var(--ink-3)', fontSize: 'var(--text-small)' }}>
          Připojování k datovému proudu analýzy…
        </p>
      )}

      {rows.length > 0 && (
        <div className="live-wrap">
          <section>
            <div className="live-phase">
              <span className="phase is-done">
                <span className="phase__n">1</span>Výběr zdrojů
              </span>
              <span className={`phase${isExtracting ? ' is-now' : ' is-done'}`}>
                <span className="phase__n">2</span>Extrakce
              </span>
              <span className={`phase${isSynthesising ? ' is-now' : ''}`}>
                <span className="phase__n">3</span>Syntéza
              </span>
            </div>

            <div className="live-summary">
              <h2 className="live-summary__n">
                {isSynthesising ? 'Probíhá syntéza napříč zdroji' : 'Extrahujeme text a tvrzení ze zdrojů'}
              </h2>
              <p className="live-summary__meta">
                {isSynthesising ? (
                  <>
                    <Loader2
                      size={12}
                      className="spin"
                      style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}
                    />
                    Syntéza napříč {completedCount} zdroji…
                  </>
                ) : (
                  `${doneCount} z ${total} zdrojů hotovo`
                )}
              </p>
              <div className="progress">
                <div
                  className="progress__done"
                  style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              {rows.map((row, i) => (
                <div className="source-row" key={row.coverageId}>
                  <span className="source-row__mark">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="source-row__name">{row.outlet}</div>
                    <div className="source-row__title">{row.title ?? row.articleUrl}</div>
                  </div>
                  <ExtractionBadge state={row.extraction} />
                </div>
              ))}
            </div>
          </section>

          <aside className="live-rail">
            <h2>Stav analýzy</h2>
            <div className="rail-stat">
              <b>
                {doneCount} z {total}
              </b>
              <span>zdrojů hotovo</span>
            </div>
            <div className="rail-stat">
              <b>{claimTotal}</b>
              <span>extrahovaných tvrzení</span>
            </div>
            <div className="rail-stat">
              <b>{attributedTotal}</b>
              <span>přiřazených citací</span>
            </div>
            <div className="rail-stat">
              <b>{framingTotal}</b>
              <span>framingové signály</span>
            </div>
            <div className="rail-stat">
              <span>Po dokončení extrakce začne syntéza společných a rozdílných informací.</span>
            </div>
          </aside>
        </div>
      )}
    </div>
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
          </header>

          {totalItems > 0 && <SumBox dimensions={dimensions} />}

          {analysis.narrative && analysis.narrative.length > 0 && (
            <NarrativeArticle segments={analysis.narrative} />
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

          {import.meta.env.DEV && <ValueVariantsDemoSection />}
          {import.meta.env.DEV && <WordingDemoSection />}

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

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: analysis, isLoading, isError } = useAnalysisDetail(id)

  if (isLoading) {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <p className="note">Načítání analýzy…</p>
      </div>
    )
  }

  if (isError || !analysis) {
    return <ErrorState message="Nepodařilo se načíst analýzu." />
  }

  if (analysis.status === 'draft') {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <p className="note">Tento článek se ještě posuzuje a zatím není dostupný.</p>
        {user?.role === 'ADMIN' && (
          <p style={{ marginTop: 'var(--sp-3)' }}>
            <Link to="/admin/ingestion" className="btn btn--micro">
              Přejít do fronty ke schválení
            </Link>
          </p>
        )}
      </div>
    )
  }

  if (analysis.status === 'failed') {
    return <ErrorState message="Analýza selhala." />
  }

  if (analysis.status === 'complete' && analysis.synthesisResult) {
    return (
      <TooltipProvider>
        <CompleteAnalysis analysis={analysis} />
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <StreamingAnalysis id={id!} title={analysis.title} />
    </TooltipProvider>
  )
}
