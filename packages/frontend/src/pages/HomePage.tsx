import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/PageContainer'
import { PageTitle } from '@/components/PageTitle'
import { useAuth } from '@/context/AuthContext'
import { createAnalysis, discoverSources } from '@/services/analyses'

type PageState = { step: 'input' } | { step: 'keywords'; analysisId: string; keywords: string[] }

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
    <span className="inline-flex items-center gap-1 rounded-full border bg-secondary px-3 py-1 text-sm">
      <input
        className="bg-transparent outline-none min-w-[4rem] max-w-[16rem]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: `${Math.max(4, value.length)}ch` }}
        aria-label="Klíčové slovo"
      />
      <button
        type="button"
        onClick={onDelete}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Odebrat klíčové slovo"
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
    <section className="mt-8 max-w-2xl">
      <h2 className="font-serif text-lg font-semibold mb-1">Klíčová slova pro vyhledávání</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Klíčová slova můžete před vyhledáváním pokrytí upravit, odebrat nebo přidat.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {entries.map((entry) => (
          <KeywordChip
            key={entry.id}
            value={entry.value}
            onChange={(v) => updateEntry(entry.id, v)}
            onDelete={() => removeEntry(entry.id)}
          />
        ))}
      </div>

      <div className="flex gap-2 mb-6">
        <Input
          ref={addInputRef}
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          placeholder="Přidat klíčové slovo…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addKeyword()
            }
          }}
          className="max-w-xs"
        />
        <Button type="button" variant="outline" onClick={addKeyword} disabled={!newKeyword.trim()}>
          Přidat
        </Button>
      </div>

      {discoverMutation.isError && (
        <p className="text-sm text-destructive mb-4">{discoverMutation.error.message}</p>
      )}

      {activeKeywords.length > 0 && (
        <Button onClick={() => discoverMutation.mutate()} disabled={discoverMutation.isPending}>
          {discoverMutation.isPending ? 'Vyhledávání pokrytí…' : 'Vyhledat zdroje'}
        </Button>
      )}
    </section>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const [state, setState] = useState<PageState>({ step: 'input' })
  const [urlValue, setUrlValue] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: createAnalysis,
    onSuccess: (data) => {
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

    createMutation.mutate(urlValue)
  }

  return (
    <PageContainer>
      <PageTitle>News Triangulator</PageTitle>
      <p className="mt-2 text-muted-foreground">
        Vložte odkaz na český zpravodajský článek a zjistěte, jak stejnou událost popisují různá média.
      </p>

      {user?.role === 'ADMIN' && state.step === 'input' && (
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3 max-w-2xl">
          <label htmlFor="seed-url" className="text-sm font-medium">
            Odkaz na výchozí článek
          </label>
          <div className="flex gap-2">
            <Input
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
              className="flex-1"
            />
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Analyzování…' : 'Analyzovat'}
            </Button>
          </div>
          {urlError && <p className="text-sm text-destructive">{urlError}</p>}
        </form>
      )}

      {state.step === 'keywords' && (
        <KeywordsStep analysisId={state.analysisId} initialKeywords={state.keywords} />
      )}
    </PageContainer>
  )
}
