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
        <Loader2 size={12} className="animate-spin" /> Extracting…
      </span>
    )
  }
  if (state.phase === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
        <CheckCircle size={12} />
        {state.claimCount} claims · {state.attributedClaimCount} attributed · {state.framingSignalCount}{' '}
        framing
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
    return <p className="mt-4 text-sm text-muted-foreground">Nothing in this category.</p>
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
          {hasNarrative && <TabsTrigger value="narrative">Article</TabsTrigger>}
          <TabsTrigger value="agreement">Agreement</TabsTrigger>
          <TabsTrigger value="contradiction">Contradiction</TabsTrigger>
          <TabsTrigger value="uniqueReporting">Unique Reporting</TabsTrigger>
          <TabsTrigger value="framing">Framing</TabsTrigger>
        </TabsList>
        {hasNarrative && (
          <TabsContent value="narrative">
            <DimensionList items={narrative} />
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
        Try again
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
                ? { phase: 'error', error: 'No article text available' }
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
      setStreamError('Connection to analysis stream lost.')
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
        <h1 className="text-2xl font-bold">Analysis</h1>
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
      <h1 className="text-2xl font-bold">
        {isSynthesising ? 'Synthesising analysis…' : 'Extracting sources'}
      </h1>

      {total > 0 && isExtracting && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-1">
            <span>
              {doneCount} of {total} sources analysed
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
          Running synthesis across {rows.filter((r) => r.extraction.phase === 'complete').length} sources…
        </div>
      )}

      {streamError && <p className="mt-4 text-sm text-destructive">{streamError}</p>}

      {rows.length === 0 && !streamError && (
        <p className="mt-6 text-muted-foreground">Connecting to analysis stream…</p>
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
  const { data: analysis, isLoading, isError } = useAnalysisDetail(id)

  if (isLoading) {
    return (
      <main className="container mx-auto py-10 max-w-3xl">
        <p className="text-muted-foreground">Loading analysis…</p>
      </main>
    )
  }

  if (isError || !analysis) {
    return <ErrorState message="Failed to load analysis." />
  }

  if (analysis.status === 'failed') {
    return <ErrorState message="Analysis failed." />
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
