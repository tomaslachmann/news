import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/PageContainer'
import { PageTitle } from '@/components/PageTitle'
import { fetchAnalysis, patchCoverages, type CoverageInfo } from '@/services/analyses'
import { formatDate } from '@/lib/formatDate'

type PageMode = 'select' | 'confirming' | 'results'

function StatusBadge({ status }: { status: CoverageInfo['status'] }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <CheckCircle size={12} /> Extrahováno
      </span>
    )
  }
  if (status === 'extraction-failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <XCircle size={12} /> Nelze extrahovat
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
  const [customUrlInput, setCustomUrlInput] = useState('')
  const [customUrls, setCustomUrls] = useState<string[]>([])
  const [manualTexts, setManualTexts] = useState<Map<string, string>>(new Map())
  const [results, setResults] = useState<CoverageInfo[]>([])

  const {
    data: analysis,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => fetchAnalysis(id!),
    enabled: !!id,
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds editable selection state from async query data; `analysis` isn't available until after mount
    if (analysis) setCheckedIds(new Set(analysis.coverages.map((c) => c.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-seeds only when a *different* analysis loads, not on every coverages content change
  }, [analysis?.id])

  const confirmMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchCoverages>[1]) => patchCoverages(id!, body),
    onSuccess: (updatedCoverages) => {
      void queryClient.invalidateQueries({ queryKey: ['analysis', id] })
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
    try {
      new URL(trimmed)
    } catch {
      return
    }
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
      <PageContainer>
        <p className="text-muted-foreground">Načítání zdrojů…</p>
      </PageContainer>
    )
  }

  if (isError || !analysis) {
    return (
      <PageContainer>
        <p className="text-destructive">Nepodařilo se načíst analýzu. Vraťte se zpět a zkuste to znovu.</p>
      </PageContainer>
    )
  }

  // ── Results mode ────────────────────────────────────────────────────────────
  if (mode === 'results') {
    const failedIds = results.filter((c) => c.status === 'extraction-failed').map((c) => c.id)

    return (
      <PageContainer>
        <PageTitle size="sm">{analysis.seedHeadline}</PageTitle>
        <p className="text-sm text-muted-foreground mt-1">Extrakce dokončena</p>

        <ul className="mt-6 flex flex-col gap-3">
          {results.map((coverage) => (
            <li key={coverage.id} className="rounded-lg border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="utility-label">{coverage.outlet}</span>
                  <p className="text-sm font-medium leading-snug line-clamp-2">
                    {coverage.title ?? coverage.articleUrl}
                  </p>
                  <StatusBadge status={coverage.status} />
                </div>
                <a
                  href={coverage.articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
                  aria-label="Otevřít článek"
                >
                  <ExternalLink size={16} />
                </a>
              </div>

              {coverage.status === 'extraction-failed' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    Vložte text článku ručně (nepovinné):
                  </label>
                  <textarea
                    rows={4}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Sem vložte text článku…"
                    value={manualTexts.get(coverage.id) ?? ''}
                    onChange={(e) => setManualTexts((prev) => new Map(prev).set(coverage.id, e.target.value))}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>

        {failedIds.length > 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Počet zdrojů, které se nepodařilo extrahovat: {failedIds.length}. Text můžete vložit ručně výše,
            nebo pokračovat bez nich.
          </p>
        )}

        {proceedMutation.isError && (
          <p className="mt-3 text-sm text-destructive">{proceedMutation.error.message}</p>
        )}

        <Button
          className="mt-6"
          onClick={() => proceedMutation.mutate()}
          disabled={proceedMutation.isPending}
        >
          {proceedMutation.isPending ? 'Ukládání…' : 'Pokračovat k analýze'}
        </Button>
      </PageContainer>
    )
  }

  // ── Select / confirming mode ─────────────────────────────────────────────────
  return (
    <PageContainer>
      <PageTitle size="sm">{analysis.seedHeadline}</PageTitle>
      <p className="text-sm text-muted-foreground mt-1">Vyberte zdroje, které chcete zahrnout do analýzy</p>

      {analysis.coverages.length === 0 && customUrls.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            Nebylo nalezeno žádné pokrytí. Přidejte odkazy na články níže, nebo se vraťte a upravte klíčová
            slova.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {analysis.coverages.map((coverage) => (
            <li key={coverage.id} className="rounded-lg border bg-card p-4 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                checked={checkedIds.has(coverage.id)}
                onChange={(e) => {
                  setCheckedIds((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) {
                      next.add(coverage.id)
                    } else {
                      next.delete(coverage.id)
                    }
                    return next
                  })
                }}
              />
              <div className="flex flex-1 items-start justify-between gap-4 min-w-0">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="utility-label">{coverage.outlet}</span>
                  <p className="text-sm font-medium leading-snug line-clamp-2">
                    {coverage.title ?? coverage.articleUrl}
                  </p>
                  {coverage.publishedAt && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(coverage.publishedAt, 'long')}
                    </span>
                  )}
                </div>
                <a
                  href={coverage.articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
                  aria-label="Otevřít článek"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            </li>
          ))}

          {customUrls.map((url) => (
            <li key={url} className="rounded-lg border bg-card p-4 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                checked
                onChange={() => setCustomUrls((prev) => prev.filter((u) => u !== url))}
              />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="utility-label">Vlastní URL</span>
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
          placeholder="Přidat odkaz na článek…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustomUrl()
            }
          }}
          className="flex-1"
          disabled={mode === 'confirming'}
        />
        <Button
          type="button"
          variant="outline"
          onClick={addCustomUrl}
          disabled={!customUrlInput.trim() || mode === 'confirming'}
        >
          Přidat
        </Button>
      </div>

      {/* Warning if fewer than 5 sources */}
      {checkedCount > 0 && checkedCount < 5 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Při méně než 5 zdrojích může být triangulace omezená.</span>
        </div>
      )}

      {confirmMutation.isError && (
        <p className="mt-3 text-sm text-destructive">{confirmMutation.error.message}</p>
      )}

      <Button className="mt-6" onClick={handleConfirm} disabled={checkedCount === 0 || mode === 'confirming'}>
        {mode === 'confirming' ? 'Extrahování textu článků…' : 'Potvrdit zdroje'}
      </Button>
    </PageContainer>
  )
}
