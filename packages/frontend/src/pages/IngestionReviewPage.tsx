import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAnalysesList } from '@/services/analyses/hooks'
import { usePendingAdditions, useApproveDraft, useRejectDraft } from '@/services/ingestion/hooks'

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

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
      <h2 className="text-lg font-semibold">Drafts awaiting review</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Found automatically by Ingestion. Approving takes you to the usual source review step; nothing is
        analysed until you confirm it there.
      </p>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="mt-4 text-sm text-destructive">Failed to load drafts.</p>}

      {analyses && drafts.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No drafts right now.</p>
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
                  {formatDate(draft.createdAt)} · {draft.coverageCount} sources found
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate(draft.id)}
                >
                  Reject
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
                  Approve
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
      <h2 className="text-lg font-semibold">Possible additions to completed Articles</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ingestion found new coverage of a story that's already complete. Nothing changes automatically —
        review the original Article and decide for yourself.
      </p>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="mt-4 text-sm text-destructive">Failed to load pending additions.</p>}

      {additions && additions.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">None right now.</p>
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
                Possible addition to{' '}
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
      <h1 className="text-3xl font-bold">Ingestion review</h1>
      <div className="mt-8">
        <DraftsSection />
        <PendingAdditionsSection />
      </div>
    </main>
  )
}
