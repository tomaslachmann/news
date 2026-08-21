import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SumBox, CompareList } from '@/components/AnalysisDimensionSections'
import { openAnalysisStream, type AnalysisDimensions, type CoverageInfo } from '@/services/analyses'
import { useAnalysisDetail } from '@/services/analyses/hooks'
import { articlePath } from '@/lib/analysisRoutes'
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

/** Exported for `ArticlePage` too (ticket 52) — a genuine fetch/network failure is a different
 *  situation from "this Analysis isn't published yet," and deserves this retryable treatment
 *  rather than being folded into `NotFoundPage`'s "doesn't exist" framing. */
export function ErrorState({ message }: { message: string }) {
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

/** The Admin-only Analysis-monitoring view (ticket 52 — moved here from the now-public
 *  `/article/:id`, see `ArticlePage`). Keeps every in-progress state (draft/pending/streaming/
 *  failed) exactly as before; a COMPLETE Analysis redirects to its canonical public URL instead of
 *  re-rendering the finished Article here too — one canonical URL for a finished piece, Admin
 *  included, rather than maintaining the same render logic at two routes. */
export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
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
        <p style={{ marginTop: 'var(--sp-3)' }}>
          <Link to="/admin/ingestion" className="btn btn--micro">
            Přejít do fronty ke schválení
          </Link>
        </p>
      </div>
    )
  }

  if (analysis.status === 'failed') {
    return <ErrorState message="Analýza selhala." />
  }

  if (analysis.status === 'complete' && analysis.synthesisResult) {
    return <Navigate to={articlePath(id!)} replace />
  }

  return (
    <TooltipProvider>
      <StreamingAnalysis id={id!} title={analysis.title} />
    </TooltipProvider>
  )
}
