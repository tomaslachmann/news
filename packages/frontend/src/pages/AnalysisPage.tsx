import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  openAnalysisStream,
  type Attribution,
  type AnalysisDimensions,
  type DimensionItem,
  type CoverageInfo,
} from '@/services/analyses'
import { useAnalysisDetail } from '@/services/analyses/hooks'
import { useAuth } from '@/context/AuthContext'

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
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> Extrahování…
      </span>
    )
  }
  if (state.phase === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
        <CheckCircle size={12} />
        {state.claimCount} tvrzení · {state.attributedClaimCount} citací · {state.framingSignalCount}{' '}
        framingových signálů
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
      <XCircle size={12} /> {state.error}
    </span>
  )
}

function OutletBadge({ attribution }: { attribution: Attribution }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={attribution.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border bg-secondary px-2.5 py-0.5 text-xs font-medium hover:bg-secondary/80"
        >
          {attribution.outlet}
        </a>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{attribution.czechQuote}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function DimensionList({ items }: { items: Array<{ prose: string; attributions: Attribution[] }> }) {
  if (items.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">V této kategorii nic není.</p>
  }
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="rounded-lg border bg-card p-4 flex flex-col gap-2">
          <p className="text-sm">{item.prose}</p>
          <div className="flex flex-wrap gap-2">
            {item.attributions.map((a, j) => (
              <OutletBadge key={j} attribution={a} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

// A real <button> (not a bare <span>) so Radix's Tooltip opens on tap via the focus event it
// already listens for, not just hover — the touch fallback a citation marker needs, since hover
// has no mobile equivalent.
function CitationMarker({ index, attribution }: { index: number; attribution: Attribution }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="ml-0.5 align-super text-[11px] font-semibold text-primary hover:underline"
        >
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

function CoverageAnalysisSummary({ dimensions }: { dimensions: AnalysisDimensions }) {
  const total =
    dimensions.agreement.length +
    dimensions.contradiction.length +
    dimensions.uniqueReporting.length +
    dimensions.framing.length

  if (total === 0) return null

  const agreementPct = Math.round((dimensions.agreement.length / total) * 100)

  const stats = [
    {
      value: `${agreementPct}%`,
      label: 'shoda',
      detail: 'Většina zdrojů uvádí stejné základní skutečnosti.',
    },
    {
      value: dimensions.uniqueReporting.length,
      label: 'unikátní informace',
      detail: 'Pouze některé zdroje uvádějí další informace.',
    },
    {
      value: dimensions.framing.length,
      label: 'rozdíly ve framingu',
      detail: 'Různá média zdůrazňují odlišné aspekty stejných faktů.',
    },
    {
      value: dimensions.contradiction.length,
      label: 'přímé rozpory',
      detail:
        dimensions.contradiction.length === 0
          ? 'Žádné zdroje si v dostupných informacích přímo neodporují.'
          : 'Zdroje uvádějí neslučitelné informace o této události.',
    },
  ]

  return (
    <section className="mb-8 rounded-lg border bg-muted/30 p-4 font-sans">
      <h2 className="utility-label">Analýza pokrytí</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-sm font-medium">{stat.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// The Article tab: continuous prose with inline numbered citations, not the card-per-segment
// layout DimensionList uses for the four Dimension tabs (those are genuinely discrete lists;
// the Article is meant to read as one piece of writing — ADR 0012).
function NarrativeArticle({
  segments,
  dimensions,
}: {
  segments: DimensionItem[]
  dimensions: AnalysisDimensions
}) {
  // Every attribution is numbered once per source article — a source cited more than once
  // across the Article reuses its existing number rather than getting a new entry.
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
    <div className="font-serif">
      <CoverageAnalysisSummary dimensions={dimensions} />

      <div className="mx-auto flex max-w-measure flex-col gap-5 text-article">
        {rendered.map((seg, i) => (
          <p key={i}>
            {seg.prose}
            {seg.refs.map(({ index, attribution }) => (
              <CitationMarker key={index} index={index} attribution={attribution} />
            ))}
          </p>
        ))}
      </div>

      {references.length > 0 && (
        <section className="mx-auto mt-12 max-w-measure border-t pt-6">
          <h2 className="utility-label">Zdroje</h2>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {references.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">[{i + 1}]</span>
                <span>
                  <span className="font-medium">{r.outlet}</span>
                  {' — “'}
                  {truncateExcerpt(r.czechQuote)}
                  {'” '}
                  <a
                    href={r.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whitespace-nowrap text-primary underline"
                  >
                    → Číst originál
                  </a>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function ResultsTabs({
  dimensions,
  narrative,
}: {
  dimensions: AnalysisDimensions
  narrative?: DimensionItem[]
}) {
  const hasNarrative = !!narrative && narrative.length > 0

  return (
    <TooltipProvider>
      <Tabs defaultValue={hasNarrative ? 'narrative' : 'agreement'} className="mt-6">
        <TabsList>
          {hasNarrative && <TabsTrigger value="narrative">Článek</TabsTrigger>}
          <TabsTrigger value="agreement">Shoda</TabsTrigger>
          <TabsTrigger value="contradiction">Rozpory</TabsTrigger>
          <TabsTrigger value="uniqueReporting">Unikátní zprávy</TabsTrigger>
          <TabsTrigger value="framing">Framing</TabsTrigger>
        </TabsList>
        {hasNarrative && (
          <TabsContent value="narrative">
            <NarrativeArticle segments={narrative} dimensions={dimensions} />
          </TabsContent>
        )}
        <TabsContent value="agreement">
          <DimensionList items={dimensions.agreement} />
        </TabsContent>
        <TabsContent value="contradiction">
          <DimensionList items={dimensions.contradiction} />
        </TabsContent>
        <TabsContent value="uniqueReporting">
          <DimensionList items={dimensions.uniqueReporting} />
        </TabsContent>
        <TabsContent value="framing">
          <DimensionList items={dimensions.framing} />
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="container mx-auto py-10 max-w-3xl">
      <p className="text-destructive">{message}</p>
      <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
        Zkusit znovu
      </Link>
    </main>
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
      <main className="container mx-auto py-10 max-w-3xl">
        <h1 className="text-2xl font-bold">Analýza</h1>
        <ResultsTabs dimensions={dimensions} />
      </main>
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
    <main className="container mx-auto py-10 max-w-3xl">
      <h1 className="text-2xl font-bold">{isSynthesising ? 'Syntéza analýzy…' : 'Extrakce zdrojů'}</h1>

      {total > 0 && isExtracting && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-1">
            <span>
              Zpracováno {doneCount} z {total} zdrojů
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: total > 0 ? `${(doneCount / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {isSynthesising && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Probíhá syntéza napříč {rows.filter((r) => r.extraction.phase === 'complete').length} zdroji…
        </div>
      )}

      {streamError && <p className="mt-4 text-sm text-destructive">{streamError}</p>}

      {rows.length === 0 && !streamError && (
        <p className="mt-6 text-muted-foreground">Připojování k datovému proudu analýzy…</p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.coverageId} className="rounded-lg border bg-card p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {row.outlet}
              </span>
              <a
                href={row.articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground underline truncate max-w-xs"
              >
                {row.articleUrl}
              </a>
            </div>
            <ExtractionBadge state={row.extraction} />
          </li>
        ))}
      </ul>
    </main>
  )
}

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: analysis, isLoading, isError } = useAnalysisDetail(id)

  if (isLoading) {
    return (
      <main className="container mx-auto py-10 max-w-3xl">
        <p className="text-muted-foreground">Načítání analýzy…</p>
      </main>
    )
  }

  if (isError || !analysis) {
    return <ErrorState message="Nepodařilo se načíst analýzu." />
  }

  if (analysis.status === 'draft') {
    return (
      <main className="container mx-auto py-10 max-w-3xl">
        <p className="text-muted-foreground">Tento článek se ještě posuzuje a zatím není dostupný.</p>
        {user?.role === 'ADMIN' && (
          <Link to="/admin/ingestion" className="mt-4 inline-block text-sm text-primary underline">
            Přejít do fronty ke schválení
          </Link>
        )}
      </main>
    )
  }

  if (analysis.status === 'failed') {
    return <ErrorState message="Analýza selhala." />
  }

  if (analysis.status === 'complete' && analysis.synthesisResult) {
    return (
      <main className="container mx-auto py-10 max-w-3xl">
        <h1 className="text-2xl font-bold">{analysis.seedHeadline}</h1>
        <ResultsTabs dimensions={analysis.synthesisResult} narrative={analysis.narrative} />
      </main>
    )
  }

  return <StreamingAnalysis id={id!} />
}
