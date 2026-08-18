import { Link, useNavigate } from 'react-router-dom'
import type { StoryRelationTypeLabel } from '@news-triangulator/shared'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/PageContainer'
import { PageTitle } from '@/components/PageTitle'
import {
  usePendingAdditions,
  useVisibleDrafts,
  useApproveDraft,
  useRejectDraft,
  usePendingStoryRelations,
  useApproveStoryRelation,
  useRejectStoryRelation,
} from '@/services/ingestion/hooks'
import { formatDate } from '@/lib/formatDate'

const RELATION_TYPE_LABELS: Record<StoryRelationTypeLabel, string> = {
  RELATED: 'Související',
  FOLLOW_UP: 'Navazující',
}

function DraftsSection() {
  const { data: drafts, isLoading, isError } = useVisibleDrafts()
  const navigate = useNavigate()
  const approveMutation = useApproveDraft()
  const rejectMutation = useRejectDraft()

  return (
    <section>
      <h2 className="font-serif text-lg font-semibold">Koncepty čekající na schválení</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Nalezeno automaticky sběrem článků. Zobrazují se až po nashromáždění dostatku zdrojů. Schválení vás
        přesměruje na obvyklý krok výběru zdrojů; nic se neanalyzuje, dokud to tam nepotvrdíte.
      </p>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Načítání…</p>}
      {isError && <p className="mt-4 text-sm text-destructive">Nepodařilo se načíst koncepty.</p>}

      {drafts && drafts.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Momentálně žádné koncepty. Sběr článků běží jen když je spuštěný jeho cron — v lokálním vývoji ho{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run dev</code> samo o sobě nespouští, viz
          README, sekce Automated Ingestion.
        </p>
      )}

      {drafts && drafts.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="rounded-lg border bg-card p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="truncate font-serif text-lg font-semibold">{draft.seedHeadline}</p>
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
      <h2 className="font-serif text-lg font-semibold">Možná doplnění k dokončeným článkům</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sběr článků nalezl nové pokrytí události, která je již dokončená. Nic se automaticky nemění — projděte
        si původní článek a rozhodněte sami.
      </p>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Načítání…</p>}
      {isError && <p className="mt-4 text-sm text-destructive">Nepodařilo se načíst čekající doplnění.</p>}

      {additions && additions.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Momentálně žádná. (Vyžaduje běžící sběr článků — viz vysvětlení výše.)
        </p>
      )}

      {additions && additions.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {additions.map((addition) => (
            <li key={addition.id} className="rounded-lg border bg-card p-4">
              <p className="utility-label">{addition.outlet}</p>
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

function StoryRelationsSection() {
  const { data: relations, isLoading, isError } = usePendingStoryRelations()
  const approveMutation = useApproveStoryRelation()
  const rejectMutation = useRejectStoryRelation()

  return (
    <section className="mt-10">
      <h2 className="font-serif text-lg font-semibold">Vztahy mezi událostmi čekající na schválení</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Nástroj s nižší jistotou navrhl souvislost mezi dvěma událostmi. Potvrďte, pokud dává smysl, nebo
        zamítněte — zamítnutí je trvalé a nástroj tuto dvojici znovu nenabídne.
      </p>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Načítání…</p>}
      {isError && <p className="mt-4 text-sm text-destructive">Nepodařilo se načíst čekající vztahy.</p>}

      {relations && relations.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Momentálně žádné čekající vztahy.</p>
      )}

      {relations && relations.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {relations.map((relation) => (
            <li key={relation.id} className="rounded-lg border bg-card p-4">
              <p className="utility-label">{RELATION_TYPE_LABELS[relation.type]}</p>
              <p className="mt-1 text-sm font-medium leading-snug">
                {relation.fromTitle} <span className="text-muted-foreground">→</span> {relation.toTitle}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{relation.reasoning}</p>
              <div className="mt-3 flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate(relation.id)}
                >
                  Zamítnout
                </Button>
                <Button
                  size="sm"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(relation.id)}
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

export default function IngestionReviewPage() {
  return (
    <PageContainer>
      <PageTitle>Kontrola sběru článků</PageTitle>
      <div className="mt-8">
        <DraftsSection />
        <PendingAdditionsSection />
        <StoryRelationsSection />
      </div>
    </PageContainer>
  )
}
