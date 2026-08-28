import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { DraftExclusion } from '@/services/ingestion'
import { fetchAnalysis, patchCoverages, type CoverageInfo } from '@/services/analyses'
import { formatDate } from '@/lib/formatDate'
import { analysisPath } from '@/lib/analysisRoutes'
import { buildDraftExclusionNotice, coverageExclusionLabel } from './reviewPageViewModel'
import './ReviewPage.css'

type PageMode = 'select' | 'confirming' | 'results'

/** Ticket 87 — approval nav-state carrier. `IngestionReviewPage` puts `approveDraft`'s `excluded`
 *  list here when it redirects to `/review/:id`, so the source count that just shrank is explained
 *  on arrival rather than read as a bug. */
interface ReviewLocationState {
  draftExclusions?: DraftExclusion[]
}

function DraftExclusionBanner({
  exclusions,
  onDismiss,
}: {
  exclusions: DraftExclusion[]
  onDismiss: () => void
}) {
  const notice = buildDraftExclusionNotice(exclusions)
  if (!notice) return null
  return (
    <aside className="xnote" role="status">
      <button className="xnote__x" type="button" onClick={onDismiss} aria-label="Zavřít">
        ×
      </button>
      <p className="xnote__h">{notice.heading}</p>
      <p className="xnote__d">{notice.detail}</p>
      <ul className="xnote__l">
        {notice.groups.map((group) => (
          <li key={group.reason}>
            <span className="xnote__r">{group.label}:</span> {group.outlets.join(', ')}
          </li>
        ))}
      </ul>
    </aside>
  )
}

function StatusText({ status }: { status: CoverageInfo['status'] }) {
  if (status === 'ok') return <span className="pick__x is-ok">Extrahováno</span>
  if (status === 'extraction-failed') return <span className="pick__x is-bad">Nelze extrahovat</span>
  return null
}

/** One selectable source row in the picker — an active coverage or an auto-excluded one (`note`
 *  set, muted). The custom-URL rows below stay their own thing: unchecking one deletes it. */
function PickRow({
  coverage,
  checked,
  onToggle,
  note,
}: {
  coverage: CoverageInfo
  checked: boolean
  onToggle: (checked: boolean) => void
  note?: string
}) {
  return (
    <div className={`pick__i${note ? ' is-off' : ''}`}>
      <span className="pick__c">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
      </span>
      <span className="pick__w">{coverage.outlet}</span>
      <p className="pick__t">{coverage.title ?? coverage.articleUrl}</p>
      {note && <span className="pick__x">{note}</span>}
      {coverage.publishedAt && <span className="pick__u">{formatDate(coverage.publishedAt, 'long')}</span>}
    </div>
  )
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const draftExclusions = (location.state as ReviewLocationState | null)?.draftExclusions ?? []
  const [exclusionBannerDismissed, setExclusionBannerDismissed] = useState(false)

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
    onSuccess: () => navigate(analysisPath(id!)),
  })

  const toggleChecked = (coverageId: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(coverageId)
      else next.delete(coverageId)
      return next
    })
  }

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

  const excludedCoverages = analysis?.excludedCoverages ?? []
  const checkedCount = checkedIds.size + customUrls.length
  const totalCount = (analysis?.coverages.length ?? 0) + excludedCoverages.length + customUrls.length

  if (isLoading) {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <p style={{ color: 'var(--ink-3)' }}>Načítání zdrojů…</p>
      </div>
    )
  }

  if (isError || !analysis) {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <div className="error">
          <p className="error__p">Nepodařilo se načíst analýzu. Vraťte se zpět a zkuste to znovu.</p>
        </div>
      </div>
    )
  }

  // ── Results mode ────────────────────────────────────────────────────────────
  if (mode === 'results') {
    const failedIds = results.filter((c) => c.status === 'extraction-failed').map((c) => c.id)

    return (
      <div className="u-wrap">
        <nav className="crumbs" aria-label="Cesta">
          <span aria-current="page">Výběr zdrojů</span>
        </nav>

        {!exclusionBannerDismissed && (
          <DraftExclusionBanner
            exclusions={draftExclusions}
            onDismiss={() => setExclusionBannerDismissed(true)}
          />
        )}

        <header className="ahead">
          <h1 className="ahead__t">{analysis.seedHeadline}</h1>
          <p className="ahead__d">Extrakce dokončena.</p>
        </header>

        <div className="pick">
          {results.map((coverage) => (
            <div
              className={`pick__i${coverage.status === 'extraction-failed' ? ' pick__i--fail' : ''}`}
              key={coverage.id}
            >
              <span className="pick__w">{coverage.outlet}</span>
              <p className="pick__t">{coverage.title ?? coverage.articleUrl}</p>
              <a className="pick__u" href={coverage.articleUrl} target="_blank" rel="noopener noreferrer">
                {coverage.articleUrl}
              </a>
              <StatusText status={coverage.status} />

              {coverage.status === 'extraction-failed' && (
                <div className="pick__paste">
                  <label className="field__l" htmlFor={`manual-${coverage.id}`}>
                    Vložte text článku ručně (nepovinné)
                  </label>
                  <textarea
                    id={`manual-${coverage.id}`}
                    rows={4}
                    placeholder="Sem vložte text článku…"
                    value={manualTexts.get(coverage.id) ?? ''}
                    onChange={(e) => setManualTexts((prev) => new Map(prev).set(coverage.id, e.target.value))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {failedIds.length > 0 && (
          <p style={{ marginTop: 'var(--sp-4)', color: 'var(--ink-3)', fontSize: 'var(--text-small)' }}>
            Počet zdrojů, které se nepodařilo extrahovat: {failedIds.length}. Text můžete vložit ručně výše,
            nebo pokračovat bez nich.
          </p>
        )}

        {proceedMutation.isError && (
          <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
            <p className="error__p">{proceedMutation.error.message}</p>
          </div>
        )}

        <div className="confirm">
          <p className="confirm__n">
            <b>{results.length}</b> zdrojů zpracováno
          </p>
          <div className="confirm__act">
            <button
              className="btn btn--primary"
              onClick={() => proceedMutation.mutate()}
              disabled={proceedMutation.isPending}
            >
              {proceedMutation.isPending ? 'Ukládání…' : 'Pokračovat k analýze'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Select / confirming mode ─────────────────────────────────────────────────
  return (
    <div className="u-wrap">
      <nav className="crumbs" aria-label="Cesta">
        <span aria-current="page">Výběr zdrojů</span>
      </nav>

      {!exclusionBannerDismissed && (
        <DraftExclusionBanner
          exclusions={draftExclusions}
          onDismiss={() => setExclusionBannerDismissed(true)}
        />
      )}

      <div className="steps">
        <span className="steps__i is-done">
          <span className="steps__n">1</span>Zdroj nalezen
        </span>
        <span className="steps__i is-done">
          <span className="steps__n">2</span>Vyhledání pokrytí
        </span>
        <span className="steps__i is-now">
          <span className="steps__n">3</span>Výběr zdrojů
        </span>
        <span className="steps__i">
          <span className="steps__n">4</span>Triangulace
        </span>
        <span className="steps__i">
          <span className="steps__n">5</span>Zveřejnění
        </span>
      </div>

      <header className="ahead">
        <h1 className="ahead__t">{analysis.seedHeadline}</h1>
        <p className="ahead__d">
          Vyberte zdroje, které chcete zahrnout do analýzy. Dokud nepotvrdíte, neproběhne nic — koncept
          zůstane rozepsaný.
        </p>
      </header>

      {totalCount === 0 ? (
        <p style={{ marginTop: 'var(--sp-5)', color: 'var(--ink-3)' }}>
          Nebylo nalezeno žádné pokrytí. Přidejte odkazy na články níže, nebo se vraťte a upravte klíčová
          slova.
        </p>
      ) : (
        <div className="pick">
          {analysis.coverages.map((coverage) => (
            <PickRow
              key={coverage.id}
              coverage={coverage}
              checked={checkedIds.has(coverage.id)}
              onToggle={(checked) => toggleChecked(coverage.id, checked)}
            />
          ))}

          {excludedCoverages.length > 0 && (
            <p className="pick__sub">Automaticky vyloučené zdroje — zaškrtnutím je vrátíte do analýzy</p>
          )}
          {excludedCoverages.map((coverage) => (
            <PickRow
              key={coverage.id}
              coverage={coverage}
              checked={checkedIds.has(coverage.id)}
              onToggle={(checked) => toggleChecked(coverage.id, checked)}
              note={coverageExclusionLabel(coverage.id, draftExclusions)}
            />
          ))}

          {customUrls.map((url) => (
            <div className="pick__i" key={url}>
              <span className="pick__c">
                <input
                  type="checkbox"
                  checked
                  onChange={() => setCustomUrls((prev) => prev.filter((u) => u !== url))}
                />
              </span>
              <span className="pick__w">Vlastní URL</span>
              <p className="pick__t">{url}</p>
            </div>
          ))}
        </div>
      )}

      <div className="field addsrc">
        <label className="field__l" htmlFor="add-src">
          Přidat vlastní zdroj
        </label>
        <div className="addsrc__r">
          <input
            className="input"
            id="add-src"
            type="url"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder="Přidat odkaz na článek…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomUrl()
              }
            }}
            disabled={mode === 'confirming'}
          />
          <button
            className="btn"
            type="button"
            onClick={addCustomUrl}
            disabled={!customUrlInput.trim() || mode === 'confirming'}
          >
            Přidat
          </button>
        </div>
      </div>

      {checkedCount > 0 && checkedCount < 5 && (
        <p style={{ marginTop: 'var(--sp-4)', color: 'var(--mid)', fontSize: 'var(--text-small)' }}>
          Při méně než 5 zdrojích může být triangulace omezená.
        </p>
      )}

      {confirmMutation.isError && (
        <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="error__p">{confirmMutation.error.message}</p>
        </div>
      )}

      <div className="confirm">
        <p className="confirm__n">
          Vybráno <b>{checkedCount}</b> z <b>{totalCount}</b>.
        </p>
        <div className="confirm__act">
          <button
            className="btn btn--primary"
            onClick={handleConfirm}
            disabled={checkedCount === 0 || mode === 'confirming'}
          >
            {mode === 'confirming' ? 'Extrahování textu článků…' : 'Potvrdit zdroje'}
          </button>
        </div>
      </div>
    </div>
  )
}
