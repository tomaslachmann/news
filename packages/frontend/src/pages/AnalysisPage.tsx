import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { openAnalysisStream, type CoverageInfo, type SseEvent } from '@/services/analyses'

type ExtractionState =
  | { phase: 'pending' }
  | { phase: 'complete'; claimCount: number; attributedClaimCount: number; framingSignalCount: number }
  | { phase: 'error'; error: string }

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
        {state.claimCount} claims · {state.attributedClaimCount} attributed · {state.framingSignalCount} framing
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
      <XCircle size={12} /> {state.error}
    </span>
  )
}

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const [rows, setRows] = useState<OutletRow[]>([])
  const [streamError, setStreamError] = useState<string | null>(null)
  const [extractionSettled, setExtractionSettled] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!id) return

    const es = openAnalysisStream(id, {
      onSourcesConfirmed: (event) => {
        setRows(
          event.coverages.map((c) => ({
            coverageId: c.id,
            outlet: c.outlet,
            articleUrl: c.articleUrl,
            status: c.status,
            extraction: { phase: 'pending' },
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

      onWarning: (event) => {
        if (event.message === 'extraction-settled') setExtractionSettled(true)
      },
    })

    es.onerror = () => {
      setStreamError('Connection to analysis stream lost.')
      es.close()
    }

    esRef.current = es
    return () => { es.close(); esRef.current = null }
  }, [id])

  const doneCount = rows.filter((r) => r.extraction.phase !== 'pending').length
  const total = rows.length

  return (
    <main className="container mx-auto py-10 max-w-3xl">
      <h1 className="text-2xl font-bold">Extracting sources</h1>

      {total > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-1">
            <span>{doneCount} of {total} extractions complete</span>
            {extractionSettled && <span className="text-green-700 font-medium">All done</span>}
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: total > 0 ? `${(doneCount / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {streamError && (
        <p className="mt-4 text-sm text-destructive">{streamError}</p>
      )}

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
