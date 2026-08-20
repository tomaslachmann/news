import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { createAnalysis, discoverSources, attachSeedToMatch } from '@/services/analyses'
import './NewAnalysisPage.css'

const MATCHED_STATUS_LABELS: Record<'draft' | 'pending' | 'complete', string> = {
  draft: 'Koncept',
  pending: 'Zpracovává se',
  complete: 'Dokončeno',
}

type PageState =
  | { step: 'input' }
  | {
      step: 'matched'
      analysisId: string
      seedUrl: string
      title: string
      matchedStatus: 'draft' | 'pending' | 'complete'
    }
  | { step: 'keywords'; analysisId: string; keywords: string[] }

function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

interface KeywordEntry {
  id: string
  value: string
}

function makeEntry(value: string): KeywordEntry {
  return { id: crypto.randomUUID(), value }
}

function KeywordChip({
  value,
  onChange,
  onDelete,
}: {
  value: string
  onChange: (next: string) => void
  onDelete: () => void
}) {
  return (
    <span className="keyword">
      <input value={value} onChange={(e) => onChange(e.target.value)} aria-label="Klíčové slovo" />
      <button type="button" onClick={onDelete} aria-label="Odebrat klíčové slovo">
        ×
      </button>
    </span>
  )
}

function KeywordsStep({ analysisId, initialKeywords }: { analysisId: string; initialKeywords: string[] }) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<KeywordEntry[]>(() => initialKeywords.map(makeEntry))
  const [newKeyword, setNewKeyword] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  const discoverMutation = useMutation({
    mutationFn: () =>
      discoverSources(
        analysisId,
        entries.map((e) => e.value).filter((v) => v.trim().length > 0)
      ),
    onSuccess: () => navigate(`/review/${analysisId}`),
  })

  const updateEntry = (id: string, value: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, value } : e)))
  }

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const addKeyword = () => {
    const trimmed = newKeyword.trim()
    if (!trimmed) return
    setEntries((prev) => [...prev, makeEntry(trimmed)])
    setNewKeyword('')
    addInputRef.current?.focus()
  }

  const activeKeywords = entries.filter((e) => e.value.trim().length > 0)

  return (
    <section className="editor">
      <div className="editor__label">Klíčová slova pro vyhledávání</div>
      <p className="screen-head__d" style={{ marginTop: 'var(--sp-2)' }}>
        Klíčová slova můžete před vyhledáváním pokrytí upravit, odebrat nebo přidat.
      </p>

      <div className="keywords">
        {entries.map((entry) => (
          <KeywordChip
            key={entry.id}
            value={entry.value}
            onChange={(v) => updateEntry(entry.id, v)}
            onDelete={() => removeEntry(entry.id)}
          />
        ))}
      </div>

      <div className="editor__row">
        <input
          ref={addInputRef}
          className="editor__input"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          placeholder="Přidat klíčové slovo…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addKeyword()
            }
          }}
        />
        <button type="button" className="btn" onClick={addKeyword} disabled={!newKeyword.trim()}>
          Přidat
        </button>
        {activeKeywords.length > 0 && (
          <button
            className="btn btn--primary"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
          >
            {discoverMutation.isPending ? 'Vyhledávání pokrytí…' : 'Vyhledat zdroje'}
          </button>
        )}
      </div>

      {discoverMutation.isError && (
        <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="error__p">{discoverMutation.error.message}</p>
        </div>
      )}
    </section>
  )
}

/** Shown when submitting a seed URL matches an already-open Story (ticket 27) instead of
 *  silently creating a duplicate Analysis. "Pokračovat" attaches the seed to the match (going
 *  straight to the existing Analysis for a COMPLETE match, since re-adding coverage to one that
 *  already finished isn't this ticket's job); "Vytvořit samostatně" is the override for a
 *  false-positive match, falling through to the normal keyword-extraction flow. */
function MatchedStep({
  analysisId,
  seedUrl,
  title,
  matchedStatus,
  onCreateSeparately,
}: {
  analysisId: string
  seedUrl: string
  title: string
  matchedStatus: 'draft' | 'pending' | 'complete'
  onCreateSeparately: () => void
}) {
  const navigate = useNavigate()

  const attachMutation = useMutation({
    mutationFn: () => attachSeedToMatch(analysisId, seedUrl),
    onSuccess: () => navigate(`/review/${analysisId}`),
  })

  const handleContinue = () => {
    if (matchedStatus === 'complete') {
      void navigate(`/analysis/${analysisId}`)
      return
    }
    attachMutation.mutate()
  }

  return (
    <section className="match">
      <div className="match__eyebrow">Tato událost už se sleduje</div>
      <h2 className="match__title">{title}</h2>
      <p className="match__meta">Stav: {MATCHED_STATUS_LABELS[matchedStatus]}</p>

      {attachMutation.isError && (
        <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="error__p">{attachMutation.error.message}</p>
        </div>
      )}

      <div className="match__actions">
        <button className="btn btn--primary" onClick={handleContinue} disabled={attachMutation.isPending}>
          {attachMutation.isPending ? 'Připojování…' : 'Pokračovat'}
        </button>
        <button type="button" className="btn" onClick={onCreateSeparately}>
          Vytvořit samostatně
        </button>
      </div>
    </section>
  )
}

/** Admin-only — the app's only way to start a new Analysis. Ported from `new-analysis.html`
 *  (design-complete.css's .editor/.match/.keywords), replacing the earlier same-flow widget that
 *  lived inline on `/` (moved out per direct request — it no longer belongs on the homepage). */
export default function NewAnalysisPage() {
  const [state, setState] = useState<PageState>({ step: 'input' })
  const [urlValue, setUrlValue] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (opts: { force?: boolean } = {}) => createAnalysis(urlValue, opts),
    onSuccess: (data) => {
      if (data.outcome === 'matched') {
        setState({
          step: 'matched',
          analysisId: data.id,
          seedUrl: urlValue,
          title: data.title,
          matchedStatus: data.matchedStatus,
        })
        return
      }
      setState({ step: 'keywords', analysisId: data.id, keywords: data.keywords })
    },
    onError: (err) => {
      setUrlError(err.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setUrlError(null)

    if (!isValidUrl(urlValue)) {
      setUrlError('Zadejte platnou URL adresu (např. https://example.cz/clanek)')
      return
    }

    createMutation.mutate({})
  }

  return (
    <div className="page-shell">
      <header className="screen-head">
        <div className="screen-head__k">Nová analýza</div>
        <h1 className="screen-head__t">Zjistěte, jak o stejné události píší různá média.</h1>
        <p className="screen-head__d">
          Vložte odkaz na výchozí článek. Nejdříve ověříme, zda už tuto událost sledujeme. Pokud ano, můžete
          se připojit k existující analýze nebo vytvořit samostatné sledování.
        </p>
      </header>

      {state.step === 'input' && (
        <section className="editor">
          <form onSubmit={handleSubmit}>
            <label className="editor__label" htmlFor="seed-url">
              Výchozí článek
            </label>
            <div className="editor__row">
              <input
                className="editor__input"
                id="seed-url"
                type="url"
                value={urlValue}
                onChange={(e) => {
                  setUrlValue(e.target.value)
                  if (urlError) setUrlError(null)
                }}
                placeholder="https://www.irozhlas.cz/…"
                required
                disabled={createMutation.isPending}
              />
              <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Analyzování…' : 'Najít událost'}
              </button>
            </div>
            {urlError && (
              <div className="error" style={{ marginTop: 'var(--sp-2)' }}>
                <p className="error__p">{urlError}</p>
              </div>
            )}
          </form>
        </section>
      )}

      {state.step === 'matched' && (
        <MatchedStep
          analysisId={state.analysisId}
          seedUrl={state.seedUrl}
          title={state.title}
          matchedStatus={state.matchedStatus}
          onCreateSeparately={() => createMutation.mutate({ force: true })}
        />
      )}

      {state.step === 'keywords' && (
        <KeywordsStep analysisId={state.analysisId} initialKeywords={state.keywords} />
      )}
    </div>
  )
}
