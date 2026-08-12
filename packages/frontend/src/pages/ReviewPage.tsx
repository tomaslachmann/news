import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchAnalysis, patchCoverages, type CoverageInfo } from '@/services/analyses'

type PageMode = 'select' | 'confirming' | 'results' | 'proceeding'

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(iso))
  } catch { return iso }
}

function StatusBadge({ status }: { status: CoverageInfo['status'] }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <CheckCircle size={12} /> Extracted
      </span>
    )
  }
  if (status === 'extraction-failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <XCircle size={12} /> Could not extract
      </span>
    )
  }
  return null
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<PageMode>('select')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)
  const [customUrlInput, setCustomUrlInput] = useState('')
  const [customUrls, setCustomUrls] = useState<string[]>([])
  const [manualTexts, setManualTexts] = useState<Map<string, string>>(new Map())
  const [results, setResults] = useState<CoverageInfo[]>([])

  const { data: analysis, isLoading, isError } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => fetchAnalysis(id!),
    enabled: !!id,
  })

  // Pre-check all coverages once loaded
  if (analysis && !initialized) {
    setCheckedIds(new Set(analysis.coverages.map((c) => c.id)))
    setInitialized(true)
  }

  const confirmMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchCoverages>[1]) => patchCoverages(id!, body),
    onSuccess: (updatedCoverages) => {
      queryClient.invalidateQueries({ queryKey: ['analysis', id] })
      setResults(updatedCoverages)
      setMode('results')
    },
    onError: () => setMode('select'),
  })

  const proceedMutation = useMutation({
    mutationFn: async () => {
      const pendingManual = [...manualTexts.entries()]
        .filter(([, text]) => text.trim().length > 0)
        .map(([covId, text]) => ({ id: covId, text }))

      if (pendingManual.length > 0) {
        const allIds = results.map((c) => c.id)
        await patchCoverages(id!, { confirmedIds: allIds, manualTexts: pendingManual })
      }
    },
    onSuccess: () => navigate(`/analysis/${id}`),
  })

  const addCustomUrl = () => {
    const trimmed = customUrlInput.trim()
    try { new URL(trimmed) } catch { return }
    if (!customUrls.includes(trimmed)) setCustomUrls((prev) => [...prev, trimmed])
    setCustomUrlInput('')
  }

  const handleConfirm = () => {
    setMode('confirming')
    confirmMutation.mutate({
      confirmedIds: [...checkedIds],
      customUrls,
    })
  }

  const checkedCount = checkedIds.size + customUrls.length

  if (isLoading) {
    return (
      <main className="container mx-auto py-10">
        <p className="text-muted-foreground">Loading sources…</p>
      </main>
    )
  }

  if (isError || !analysis) {
    return (
      <main className="container mx-auto py-10">
        <p className="text-destructive">Failed to load analysis. Please go back and try again.</p>
      </main>
    )
  }

  // ── Results mode ────────────────────────────────────────────────────────────
  if (mode === 'results') {
    const failedIds = results.filter((c) => c.status === 'extraction-failed').map((c) => c.id)

    return (
      <main className="container mx-auto py-10 max-w-3xl">
        <h1 className="text-2xl font-bold">{analysis.seedHeadline}</h1>
        <p className="text-sm text-muted-foreground mt-1">Extraction complete</p>

        <ul className="mt-6 flex flex-col gap-3">
          {results.map((coverage) => (
            <li key={coverage.id} className="rounded-lg border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {coverage.outlet}
                  </span>
                  <p className="text-sm font-medium leading-snug line-clamp-2">
                    {coverage.title ?? coverage.articleUrl}
                  </p>
                  <StatusBadge status={coverage.status} />
                </div>
                <a href={coverage.articleUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5" aria-label="Open article">
                  <ExternalLink size={16} />
                </a>
              </div>

              {coverage.status === 'extraction-failed' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    Paste article text manually (optional):
                  </label>
                  <textarea
                    rows={4}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Paste the article body here…"
                    value={manualTexts.get(coverage.id) ?? ''}
                    onChange={(e) =>
                      setManualTexts((prev) => new Map(prev).set(coverage.id, e.target.value))
                    }
                  />
                </div>
              )}
            </li>
          ))}
        </ul>

        {failedIds.length > 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {failedIds.length} source{failedIds.length !== 1 ? 's' : ''} could not be extracted.
            You can paste the text manually above, or proceed without them.
          </p>
        )}

        {proceedMutation.isError && (
          <p className="mt-3 text-sm text-destructive">
            {(proceedMutation.error as Error).message}
          </p>
        )}

        <Button
          className="mt-6"
          onClick={() => proceedMutation.mutate()}
          disabled={proceedMutation.isPending}
        >
          {proceedMutation.isPending ? 'Saving…' : 'Proceed to analysis'}
        </Button>
      </main>
    )
  }

  // ── Select / confirming mode ─────────────────────────────────────────────────
  return (
    <main className="container mx-auto py-10 max-w-3xl">
      <h1 className="text-2xl font-bold">{analysis.seedHeadline}</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Select the sources to include in the analysis
      </p>

      {analysis.coverages.length === 0 && customUrls.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No coverage found. Add article URLs below or go back to adjust keywords.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {analysis.coverages.map((coverage) => (
            <li key={coverage.id}
              className="rounded-lg border bg-card p-4 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                checked={checkedIds.has(coverage.id)}
                onChange={(e) => {
                  setCheckedIds((prev) => {
                    const next = new Set(prev)
                    e.target.checked ? next.add(coverage.id) : next.delete(coverage.id)
                    return next
                  })
                }}
              />
              <div className="flex flex-1 items-start justify-between gap-4 min-w-0">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {coverage.outlet}
                  </span>
                  <p className="text-sm font-medium leading-snug line-clamp-2">
                    {coverage.title ?? coverage.articleUrl}
                  </p>
                  {coverage.publishedAt && (
                    <span className="text-xs text-muted-foreground">{formatDate(coverage.publishedAt)}</span>
                  )}
                </div>
                <a href={coverage.articleUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5" aria-label="Open article">
                  <ExternalLink size={16} />
                </a>
              </div>
            </li>
          ))}

          {customUrls.map((url) => (
            <li key={url} className="rounded-lg border bg-card p-4 flex items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked readOnly />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Custom URL
                </span>
                <p className="text-sm text-muted-foreground truncate">{url}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add custom URL */}
      <div className="mt-4 flex gap-2">
        <Input
          value={customUrlInput}
          onChange={(e) => setCustomUrlInput(e.target.value)}
          placeholder="Add article URL…"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomUrl() } }}
          className="flex-1"
          disabled={mode === 'confirming'}
        />
        <Button type="button" variant="outline" onClick={addCustomUrl}
          disabled={!customUrlInput.trim() || mode === 'confirming'}>
          Add
        </Button>
      </div>

      {/* Warning if fewer than 5 sources */}
      {checkedCount > 0 && checkedCount < 5 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Triangulation may be limited with fewer than 5 sources.</span>
        </div>
      )}

      {confirmMutation.isError && (
        <p className="mt-3 text-sm text-destructive">
          {(confirmMutation.error as Error).message}
        </p>
      )}

      <Button
        className="mt-6"
        onClick={handleConfirm}
        disabled={checkedCount === 0 || mode === 'confirming'}
      >
        {mode === 'confirming' ? 'Extracting article text…' : 'Confirm sources'}
      </Button>
    </main>
  )
}
