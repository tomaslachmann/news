import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  openAnalysisStream,
  type AnalysisDetail,
  type Attribution,
  type AnalysisDimensions,
  type DimensionItem,
  type CoverageInfo,
  type RelatedEventItem,
  type ThreadSummaryItem,
} from '@/services/analyses'
import { useAnalysisDetail } from '@/services/analyses/hooks'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/formatDate'
import { RELATION_TYPE_LABELS } from '@/lib/storyRelationTypeLabels'
import './AnalysisPage.css'

type ExtractionState =
  | { phase: 'pending' }
  | { phase: 'complete'; claimCount: number; attributedClaimCount: number; framingSignalCount: number }
  | { phase: 'error'; error: string }

type StreamPhase = 'extracting' | 'synthesising' | 'failed'

interface OutletRow {
  coverageId: string
  outlet: string
  articleUrl: string
  status: CoverageInfo['status']
  extraction: ExtractionState
}

function ExtractionBadge({ state }: { state: ExtractionState }) {
  if (state.phase === 'pending') {
    return <span className="exrow__status">Extrahování…</span>
  }
  if (state.phase === 'complete') {
    return (
      <span className="exrow__status is-ok">
        {state.claimCount} tvrzení · {state.attributedClaimCount} citací · {state.framingSignalCount}{' '}
        framingových signálů
      </span>
    )
  }
  return <span className="exrow__status is-bad">{state.error}</span>
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

/** Ticket 39's own "Blocked by" note: ticket 38 supplies the byline's source-overlap gauge
 *  ("překryv zdrojů", not the dimension-count ratio this page could compute on its own — those
 *  are different metrics, and showing one labelled as the other would misrepresent it) — "until
 *  it lands, the byline renders without the gauge and this ticket does not wait for it." So this
 *  stays source-count + framing-signal-count only for now; the overlap metric joins once ticket
 *  38 ships. */
function AnalysisByline({
  analysis,
  dimensions,
}: {
  analysis: AnalysisDetail
  dimensions: AnalysisDimensions
}) {
  return (
    <div className="byline">
      <span className="byline__grp">
        <b>{analysis.coverages.length}</b> zdrojů
      </span>
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

// ============================================================================
// Dev-only demo sections — no real data exists behind these yet. Each ships behind
// import.meta.env.DEV so it's never reachable in a production build, per the ticket's own
// "Mocked and dev-only" convention (already used for .trend/.qa elsewhere).
// ============================================================================

const SAMPLE_ENTITIES_DEMO = [
  { name: 'Ministerstvo financí', mentions: 9 },
  { name: 'Andrej Babiš', mentions: 6 },
  { name: 'Poslanecká sněmovna', mentions: 4 },
]

// TODO(grill): needs a real entity-extraction feature — unscoped, AnalysisDetail has no entities
// field at all today.
function EntitiesDemoSection() {
  return (
    <section>
      <div className="railhead">
        <h2 className="railhead__t">Entity ve zprávě</h2>
        <span className="railhead__x">ukázka</span>
      </div>
      <div className="ents">
        {SAMPLE_ENTITIES_DEMO.map((e) => (
          <div className="erow" key={e.name}>
            <span className="erow__dot">{e.mentions}×</span>
            <span className="erow__n">{e.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

const SAMPLE_QCMP_DEMO = [
  { who: 'ČTK', time: '14:02', q: 'Rozpočet počítá se saldem 241 miliard korun.', kind: 'tisková zpráva' },
  {
    who: 'Deník N',
    time: '14:31',
    q: 'Schodek státního rozpočtu má dosáhnout 241 miliard.',
    kind: 'vlastní formulace',
  },
  {
    who: 'iROZHLAS',
    time: '15:10',
    q: 'Vláda počítá se schodkem 241 miliard korun.',
    kind: 'parafráze tiskové zprávy',
  },
]

// TODO(grill): needs a fixed-cardinality, per-claim wording comparison from synthesis — not in
// AnalysisDimensions today (our contradiction items carry a variable-length attribution list, not
// exactly-N source wordings).
function WordingDemoSection() {
  return (
    <section>
      <div className="sechead">
        <h2 className="sechead__t">Tři formulace téhož faktu (ukázka)</h2>
        <span className="sechead__rule" />
      </div>
      <div className="qcmp">
        {SAMPLE_QCMP_DEMO.map((w, i) => (
          <div className="qcmp__i" key={i}>
            <p className="qcmp__h">
              <span className="qcmp__w">{w.who}</span>
              <span className="qcmp__t">{w.time}</span>
            </p>
            <p className="qcmp__q">{w.q}</p>
            <span className="qcmp__k">{w.kind}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

const SAMPLE_VALS_DEMO = [
  { v: '241 mld. Kč', who: 'ČTK, Deník N, iROZHLAS' },
  { v: '235 mld. Kč', who: 'Seznam Zprávy, Novinky' },
  { v: '223 mld. Kč', who: 'Hospodářské noviny' },
]

// TODO(grill): needs discrete per-source value extraction from synthesis — our contradiction
// items are prose + attributions only, never structured values.
function ValueVariantsDemoSection() {
  return (
    <section>
      <div className="sechead">
        <h2 className="sechead__t">Rozcházející se hodnoty (ukázka)</h2>
        <span className="sechead__rule" />
      </div>
      <ol className="compare">
        <li className="cmp">
          <p className="cmp__t">Výsledné saldo rozpočtu</p>
          <div className="cmp__m">
            <span>
              <b>7</b> z 9 zdrojů
            </span>
          </div>
          <div className="cmp__v">
            <ul className="vals">
              {SAMPLE_VALS_DEMO.map((v, i) => (
                <li key={i}>
                  <span className="vals__v">{v.v}</span>
                  <span className="vals__w">{v.who}</span>
                </li>
              ))}
            </ul>
          </div>
        </li>
      </ol>
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

function StreamingAnalysis({ id }: { id: string }) {
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

  if (dimensions) {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <header className="arthead">
          <h1 className="arthead__h">Analýza dokončena</h1>
        </header>
        <SumBox dimensions={dimensions} />
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

  const doneCount = rows.filter((r) => r.extraction.phase !== 'pending').length
  const total = rows.length
  const isExtracting = phase === 'extracting'
  const isSynthesising = phase === 'synthesising'

  return (
    <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
      <header className="arthead">
        <h1 className="arthead__h">{isSynthesising ? 'Syntéza analýzy…' : 'Extrakce zdrojů'}</h1>
      </header>

      {total > 0 && isExtracting && (
        <>
          <p className="note" style={{ marginTop: 'var(--sp-4)' }}>
            Zpracováno {doneCount} z {total} zdrojů
          </p>
          <div className="progress">
            <div className="progress__done" style={{ width: `${(doneCount / total) * 100}%` }} />
          </div>
        </>
      )}

      {isSynthesising && (
        <p
          className="note"
          style={{ marginTop: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Loader2 size={14} className="spin" />
          Probíhá syntéza napříč {rows.filter((r) => r.extraction.phase === 'complete').length} zdroji…
        </p>
      )}

      {streamError && (
        <p className="note" style={{ marginTop: 'var(--sp-3)', color: 'var(--bad)' }}>
          {streamError}
        </p>
      )}

      {rows.length === 0 && !streamError && (
        <p className="note" style={{ marginTop: 'var(--sp-4)' }}>
          Připojování k datovému proudu analýzy…
        </p>
      )}

      <div style={{ marginTop: 'var(--sp-4)' }}>
        {rows.map((row) => (
          <div className="exrow" key={row.coverageId}>
            <div>
              <span style={{ fontWeight: 600 }}>{row.outlet}</span>
              <span className="exrow__url"> — {row.articleUrl}</span>
            </div>
            <ExtractionBadge state={row.extraction} />
          </div>
        ))}
      </div>
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

          {import.meta.env.DEV && <EntitiesDemoSection />}

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
      <StreamingAnalysis id={id!} />
    </TooltipProvider>
  )
}
