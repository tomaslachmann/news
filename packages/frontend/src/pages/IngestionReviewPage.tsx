import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAnalysesList } from '@/services/analyses/hooks'
import { usePendingAdditions, useApproveDraft, useRejectDraft } from '@/services/ingestion/hooks'

const dateFormatter = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

function DraftsSection() {
  const { data: analyses, isLoading, isError } = useAnalysesList()
  const navigate = useNavigate()
  const approveMutation = useApproveDraft()
  const rejectMutation = useRejectDraft()

  const drafts = analyses?.filter((a) => a.status === 'draft') ?? []

  return (
    <section>
      <h2 className="text-lg font-semibold">Koncepty čekající na schválení</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Nalezeno automaticky sběrem článků. Schválení vás přesměruje na obvyklý krok výběru zdrojů; nic se
        neanalyzuje, dokud to tam nepotvrdíte.
      </p>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Načítání…</p>}
      {isError && <p className="mt-4 text-sm text-destructive">Nepodařilo se načíst koncepty.</p>}

      {analyses && drafts.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Momentálně žádné koncepty.</p>
      )}

      {drafts.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="rounded-lg border bg-card p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{draft.seedHeadline}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(draft.createdAt)} · nalezeno zdrojů: {draft.coverageCount}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate(draft.id)}
                >
                  Zamítnout
                </Button>
                <Button
                  size="sm"
                  disabled={approveMutation.isPending}
                  onClick={() =>
                    approveMutation.mutate(draft.id, {
                      onSuccess: () => void navigate(`/review/${draft.id}`),
                    })
                  }
                >
                  Schválit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PendingAdditionsSection() {
  const { data: additions, isLoading, isError } = usePendingAdditions()

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Možná doplnění k dokončeným článkům</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sběr článků nalezl nové pokrytí události, která je již dokončená. Nic se automaticky nemění — projděte
        si původní článek a rozhodněte sami.
      </p>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Načítání…</p>}
      {isError && <p className="mt-4 text-sm text-destructive">Nepodařilo se načíst čekající doplnění.</p>}

      {additions && additions.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Momentálně žádná.</p>
      )}

      {additions && additions.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {additions.map((addition) => (
            <li key={addition.id} className="rounded-lg border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {addition.outlet}
              </p>
              <p className="mt-1 text-sm font-medium leading-snug">{addition.title ?? addition.articleUrl}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Možné doplnění k{' '}
                <Link to={`/analysis/${addition.analysisId}`} className="text-primary underline">
                  {addition.analysisSeedHeadline}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function IngestionReviewPage() {
  return (
    <main className="container mx-auto py-10 max-w-3xl">
      <h1 className="text-3xl font-bold">Kontrola sběru článků</h1>
      <div className="mt-8">
        <DraftsSection />
        <PendingAdditionsSection />
      </div>
    </main>
  )
}
