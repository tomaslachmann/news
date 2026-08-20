import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { createAnalysis, discoverSources, attachSeedToMatch } from '@/services/analyses'
import { useAnalysesList } from '@/services/analyses/hooks'
import type { AnalysisListItem } from '@news-triangulator/shared'
import { formatDate } from '@/lib/formatDate'
import './HomePage.css'

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
    <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
      <input
        className="u-sans"
        style={{
          background: 'transparent',
          border: 0,
          outline: 'none',
          width: `${Math.max(4, value.length)}ch`,
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Klíčové slovo"
      />
      <button
        type="button"
        onClick={onDelete}
        aria-label="Odebrat klíčové slovo"
        className="btn btn--ghost btn--micro"
      >
        <X size={12} />
      </button>
    </span>
  )
}

interface KeywordEntry {
  id: string
  value: string
}

function makeEntry(value: string): KeywordEntry {
  return { id: crypto.randomUUID(), value }
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
    <div style={{ marginTop: 'var(--sp-5)' }}>
      <h2 className="login__t">Klíčová slova pro vyhledávání</h2>
      <p className="login__n">Klíčová slova můžete před vyhledáváním pokrytí upravit, odebrat nebo přidat.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
        {entries.map((entry) => (
          <KeywordChip
            key={entry.id}
            value={entry.value}
            onChange={(v) => updateEntry(entry.id, v)}
            onDelete={() => removeEntry(entry.id)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
        <input
          ref={addInputRef}
          className="input"
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
      </div>

      {discoverMutation.isError && (
        <div className="error" style={{ marginBottom: 'var(--sp-4)' }}>
          <p className="error__p">{discoverMutation.error.message}</p>
        </div>
      )}

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
    <div style={{ marginTop: 'var(--sp-5)' }}>
      <h2 className="login__t">Tato událost už se sleduje</h2>
      <p className="login__n">
        Odkaz vypadá jako stejná událost jako existující analýza „{title}“ (
        {MATCHED_STATUS_LABELS[matchedStatus]}).
      </p>

      {attachMutation.isError && (
        <div className="error" style={{ marginBottom: 'var(--sp-4)' }}>
          <p className="error__p">{attachMutation.error.message}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <button className="btn btn--primary" onClick={handleContinue} disabled={attachMutation.isPending}>
          {attachMutation.isPending ? 'Připojování…' : 'Pokračovat'}
        </button>
        <button type="button" className="btn" onClick={onCreateSeparately}>
          Vytvořit samostatně
        </button>
      </div>
    </div>
  )
}

/** Admin-only — the app's only way to start a new Analysis. Kept on `/` itself rather than moved
 *  to its own route (the ticket's reference `new-analysis.html` is a separate, richer mockup with
 *  no backend behind it, unlike this flow, which is real and already shipped). */
function SeedSubmitSection() {
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
    <div className="box" style={{ marginBottom: 'var(--sp-6)' }}>
      <p className="abar__tag" style={{ marginBottom: 'var(--sp-3)' }}>
        Interní · nová analýza
      </p>

      {state.step === 'input' && (
        <form onSubmit={handleSubmit} className="field">
          <label className="field__l" htmlFor="seed-url">
            Odkaz na výchozí článek
          </label>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <input
              className="input"
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
              style={{ flex: 1 }}
            />
            <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Analyzování…' : 'Analyzovat'}
            </button>
          </div>
          {urlError && (
            <div className="error" style={{ marginTop: 'var(--sp-2)' }}>
              <p className="error__p">{urlError}</p>
            </div>
          )}
        </form>
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

function Byline({ item }: { item: AnalysisListItem }) {
  return (
    <p className="byline">
      <span>Sestaveno z {item.coverageCount} zdrojů</span>
      <span className="byline__sep">·</span>
      <b>{formatDate(item.createdAt)}</b>
    </p>
  )
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="sechead">
      <h2>{title}</h2>
      <span className="sechead__rule" aria-hidden="true" />
    </div>
  )
}

/** TODO(grill): "trending entities in the last 24h" has no backend behind it — no aggregation
 *  query exists, and tickets 40-44 (entity resolution/wiki) are about per-entity detail pages,
 *  not a per-day mention-trend computation. Sample data only, dev-only. */
function EntbandMock() {
  const sample = [
    { name: 'Andrej Babiš', mentions: 176 },
    { name: 'Petr Fiala', mentions: 148 },
    { name: 'ČNB', mentions: 61 },
    { name: 'EU', mentions: 54 },
  ]
  return (
    <section>
      <SectionHead title="Entity dne" />
      <p className="mock-badge">ukázková data · negrilováno</p>
      <div className="entband">
        {sample.map((e) => (
          <div className="entband__i" key={e.name}>
            <span className="entband__dot">{e.mentions}</span>
            <span className="entband__n">{e.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** TODO(grill): a "minute service" ticker has no backend behind it — no event stream/timeline
 *  exists at this granularity. Sample data only, dev-only. */
function MinuteMock() {
  const sample = [
    { t: '14:32', x: 'Vláda oznámila termín tiskové konference k rozpočtu.' },
    { t: '13:58', x: 'ČNB zveřejnila zápis z jednání bankovní rady.' },
  ]
  return (
    <section>
      <SectionHead title="Minutový servis" />
      <p className="mock-badge">ukázková data · negrilováno</p>
      {sample.map((m) => (
        <div className="minute" key={m.t}>
          <span className="minute__t">{m.t}</span>
          <span className="minute__x">{m.x}</span>
        </div>
      ))}
    </section>
  )
}

/** TODO(grill): a "stories today" counter strip has no aggregation query behind it. Sample data
 *  only, dev-only. */
function DayStatsMock() {
  return (
    <div className="daystats">
      <div className="u-wrap daystats__in">
        <div className="stat">
          <b>12</b>nových analýz
        </div>
        <div className="stat">
          <b>47</b>zdrojů dnes
        </div>
        <div className="stat stat--warn">
          <b>3</b>rozporné zprávy
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const { data } = useAnalysesList()
  const items = (data?.pages[0]?.items ?? []).filter((i) => i.status === 'complete')
  const [lead, ...rest] = items
  const cards = rest.slice(0, 2)
  const storyItems = rest.slice(2, 8)

  return (
    <>
      {import.meta.env.DEV && <DayStatsMock />}

      <main className="u-wrap">
        {isAdmin && <SeedSubmitSection />}

        {items.length === 0 ? (
          <div className="box">
            <p>Zatím žádné dokončené analýzy k zobrazení.</p>
          </div>
        ) : (
          <div className="layout">
            <div>
              {lead && (
                <article className="lead">
                  <h1 className="lead__h">
                    <Link to={`/analysis/${lead.id}`}>{lead.title}</Link>
                  </h1>
                  <div className="lead__body">
                    <div className="fig">
                      <div className="fig__ph" />
                      <figcaption>
                        <span>Ilustrační fotografie — TODO: bez obrázkových dat (ADR 0004)</span>
                      </figcaption>
                    </div>
                    <div>
                      <Byline item={lead} />
                    </div>
                  </div>
                </article>
              )}

              {cards.length > 0 && (
                <>
                  <SectionHead title="Další zprávy" />
                  <div className="cards">
                    {cards.map((item) => (
                      <article className="card" key={item.id}>
                        <div className="fig fig--thumb">
                          <div className="fig__ph" />
                        </div>
                        <h3 className="card__h">
                          <Link to={`/analysis/${item.id}`}>{item.title}</Link>
                        </h3>
                        <Byline item={item} />
                      </article>
                    ))}
                  </div>
                </>
              )}

              {storyItems.length > 0 && (
                <>
                  <SectionHead title="Přehled" />
                  <ul className="storylist" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {storyItems.map((item) => (
                      <li className="story" key={item.id}>
                        <div>
                          <h3>
                            <Link to={`/analysis/${item.id}`}>{item.title}</Link>
                          </h3>
                          <p className="story__meta">
                            Sestaveno z {item.coverageCount} zdrojů · {formatDate(item.createdAt)}
                          </p>
                        </div>
                        <div className="fig fig--thumb">
                          <div className="fig__ph" />
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {import.meta.env.DEV && (
              <aside className="layout__rail">
                <EntbandMock />
                <MinuteMock />
              </aside>
            )}
          </div>
        )}
      </main>
    </>
  )
}
