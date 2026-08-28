import { Link, useNavigate } from 'react-router-dom'
import type { AnalysisListItem, PendingAdditionItem, PendingStoryRelationItem } from '@/services/ingestion'
import {
  usePendingAdditions,
  useVisibleDrafts,
  useApproveDraft,
  useRejectDraft,
  useApprovePendingAddition,
  useRejectPendingAddition,
  usePendingStoryRelations,
  useApproveStoryRelation,
  useRejectStoryRelation,
} from '@/services/ingestion/hooks'
import { formatDate } from '@/lib/formatDate'
import { RELATION_TYPE_LABELS } from '@/lib/storyRelationTypeLabels'
import { analysisPath } from '@/lib/analysisRoutes'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import './IngestionReviewPage.css'

// Below this many sources a Draft is flagged low-confidence — same threshold ReviewPage already
// warns on ("Při méně než 5 zdrojích může být triangulace omezená"), computed from the real
// coverageCount rather than a fabricated confidence score.
const THIN_DRAFT_THRESHOLD = 5

/** Shared by DraftItem and RelationItem — both queues resolve the same way (approve/reject). */
function QitemActions({
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  onApprove: () => void
  onReject: () => void
  isApproving: boolean
  isRejecting: boolean
}) {
  return (
    <div className="qitem__act">
      <button className="btn btn--strong" onClick={onApprove} disabled={isApproving}>
        Schválit
      </button>
      <button className="btn" type="button" onClick={onReject} disabled={isRejecting}>
        Zamítnout
      </button>
    </div>
  )
}

function DraftItem({
  draft,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  draft: AnalysisListItem
  onApprove: () => void
  onReject: () => void
  isApproving: boolean
  isRejecting: boolean
}) {
  const thin = draft.coverageCount < THIN_DRAFT_THRESHOLD
  return (
    <article className={`qitem${thin ? ' qitem--flag' : ''}`}>
      <div className="qitem__k">
        <span>Koncept</span>
        <span
          className="pill"
          title="Počet zdrojů před kontrolou kvality. Při schválení se zdroje, které neprošly ověřením shody s událostí, vyřadí — na další obrazovce uvidíte které a proč."
        >
          {draft.coverageCount} zdrojů
        </span>
        {thin && <span className="chip chip--mid">málo zdrojů</span>}
      </div>
      <h3 className="qitem__t">{draft.seedHeadline}</h3>
      <p className="qitem__m">
        <span>Vytvořeno {formatDate(draft.createdAt)}</span>
        <span aria-hidden="true">·</span>
        <span className="u-mono">{draft.id}</span>
      </p>
      <QitemActions
        onApprove={onApprove}
        onReject={onReject}
        isApproving={isApproving}
        isRejecting={isRejecting}
      />
    </article>
  )
}

function DraftsSection() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useVisibleDrafts()
  const drafts = data?.pages.flatMap((page) => page.items)
  const navigate = useNavigate()
  const approveMutation = useApproveDraft()
  const rejectMutation = useRejectDraft()

  return (
    <section className="qsec">
      <div className="qsec__h">
        <h2 className="qsec__t">Koncepty čekající na schválení</h2>
        {drafts && <span className="qsec__n">{drafts.length}</span>}
      </div>
      <p className="qsec__d">
        Nalezeno automaticky sběrem článků. Zobrazují se až po nashromáždění dostatku zdrojů. Schválení vás
        přesměruje na obvyklý krok výběru zdrojů; nic se neanalyzuje, dokud to tam nepotvrdíte.
      </p>

      {isLoading && <p className="note">Načítání…</p>}
      {isError && (
        <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="error__p">Nepodařilo se načíst koncepty.</p>
        </div>
      )}

      {drafts && drafts.length === 0 && (
        <p className="note" style={{ marginTop: 'var(--sp-4)' }}>
          Momentálně žádné koncepty. Sběr článků běží jen když je spuštěný jeho cron — v lokálním vývoji ho{' '}
          <code>npm run dev</code> samo o sobě nespouští, viz README, sekce Automated Ingestion.
        </p>
      )}

      {drafts && drafts.length > 0 && (
        <div className="qsec__l">
          {drafts.map((draft) => (
            <DraftItem
              key={draft.id}
              draft={draft}
              isApproving={approveMutation.isPending}
              isRejecting={rejectMutation.isPending}
              onApprove={() =>
                approveMutation.mutate(draft.id, {
                  onSuccess: (result) =>
                    void navigate(`/review/${draft.id}`, {
                      state: { draftExclusions: result.excluded },
                    }),
                })
              }
              onReject={() => rejectMutation.mutate(draft.id)}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <p style={{ marginTop: 'var(--sp-4)' }}>
          <LoadMoreButton onClick={() => void fetchNextPage()} isFetching={isFetchingNextPage} />
        </p>
      )}
    </section>
  )
}

function AdditionItem({
  addition,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  addition: PendingAdditionItem
  onApprove: () => void
  onReject: () => void
  isApproving: boolean
  isRejecting: boolean
}) {
  return (
    <article className="qitem">
      <div className="qitem__k">
        <span>Nové pokrytí</span>
        <span className="pill">{addition.outlet}</span>
      </div>
      <h3 className="qitem__t">{addition.title ?? addition.articleUrl}</h3>
      <p className="qitem__m">
        {addition.publishedAt && (
          <>
            <span>Vyšlo {formatDate(addition.publishedAt)}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>
          k článku{' '}
          <Link to={analysisPath(addition.analysisId)} className="hl">
            {addition.analysisSeedHeadline}
          </Link>
        </span>
      </p>
      <a className="qitem__u" href={addition.articleUrl} target="_blank" rel="noopener noreferrer">
        {addition.articleUrl}
      </a>
      <QitemActions
        onApprove={onApprove}
        onReject={onReject}
        isApproving={isApproving}
        isRejecting={isRejecting}
      />
    </article>
  )
}

function PendingAdditionsSection() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = usePendingAdditions()
  const additions = data?.pages.flatMap((page) => page.items)
  const navigate = useNavigate()
  const approveMutation = useApprovePendingAddition()
  const rejectMutation = useRejectPendingAddition()

  return (
    <section className="qsec">
      <div className="qsec__h">
        <h2 className="qsec__t">Možná doplnění k dokončeným článkům</h2>
        {additions && <span className="qsec__n">{additions.length}</span>}
      </div>
      <p className="qsec__d">
        Sběr článků nalezl nové pokrytí události, která je již dokončená. Schválení připojí zdroj a znovu
        spustí triangulaci od začátku — po dobu zpracování článek dočasně zmizí z výpisu. Zamítnutí je trvalé.
      </p>

      {isLoading && <p className="note">Načítání…</p>}
      {isError && (
        <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="error__p">Nepodařilo se načíst čekající doplnění.</p>
        </div>
      )}

      {additions && additions.length === 0 && (
        <p className="note" style={{ marginTop: 'var(--sp-4)' }}>
          Momentálně žádná. (Vyžaduje běžící sběr článků — viz vysvětlení výše.)
        </p>
      )}

      {additions && additions.length > 0 && (
        <div className="qsec__l">
          {additions.map((addition) => (
            <AdditionItem
              key={addition.id}
              addition={addition}
              isApproving={approveMutation.isPending}
              isRejecting={rejectMutation.isPending}
              onApprove={() =>
                approveMutation.mutate(addition.id, {
                  onSuccess: () => void navigate(analysisPath(addition.analysisId)),
                })
              }
              onReject={() => rejectMutation.mutate(addition.id)}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <p style={{ marginTop: 'var(--sp-4)' }}>
          <LoadMoreButton onClick={() => void fetchNextPage()} isFetching={isFetchingNextPage} />
        </p>
      )}
    </section>
  )
}

function RelationItem({
  relation,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  relation: PendingStoryRelationItem
  onApprove: () => void
  onReject: () => void
  isApproving: boolean
  isRejecting: boolean
}) {
  return (
    <article className="qitem">
      <div className="qitem__k">
        <span>{RELATION_TYPE_LABELS[relation.type]}</span>
      </div>
      <div className="pair">
        <div className="pair__r">
          <span className="pair__a">Z</span>
          <span>{relation.fromTitle}</span>
        </div>
        <div className="pair__r">
          <span className="pair__a">Na</span>
          <span>{relation.toTitle}</span>
        </div>
      </div>
      <p className="qitem__why">
        <span>Zdůvodnění nástroje</span>
        {relation.reasoning}
      </p>
      <p className="qitem__m">
        <span>Navrženo {formatDate(relation.createdAt)}</span>
        <span aria-hidden="true">·</span>
        <span className="u-mono">{relation.id}</span>
      </p>
      <QitemActions
        onApprove={onApprove}
        onReject={onReject}
        isApproving={isApproving}
        isRejecting={isRejecting}
      />
    </article>
  )
}

function StoryRelationsSection() {
  const { data: relations, isLoading, isError } = usePendingStoryRelations()
  const approveMutation = useApproveStoryRelation()
  const rejectMutation = useRejectStoryRelation()

  return (
    <section className="qsec">
      <div className="qsec__h">
        <h2 className="qsec__t">Vztahy mezi událostmi čekající na schválení</h2>
        {relations && <span className="qsec__n">{relations.length}</span>}
      </div>
      <p className="qsec__d">
        Nástroj s nižší jistotou navrhl souvislost mezi dvěma událostmi. Potvrďte, pokud dává smysl, nebo
        zamítněte — zamítnutí je trvalé a nástroj tuto dvojici znovu nenabídne.
      </p>

      {isLoading && <p className="note">Načítání…</p>}
      {isError && (
        <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="error__p">Nepodařilo se načíst čekající vztahy.</p>
        </div>
      )}

      {relations && relations.length === 0 && (
        <p className="note" style={{ marginTop: 'var(--sp-4)' }}>
          Momentálně žádné čekající vztahy.
        </p>
      )}

      {relations && relations.length > 0 && (
        <div className="qsec__l">
          {relations.map((relation) => (
            <RelationItem
              key={relation.id}
              relation={relation}
              isApproving={approveMutation.isPending}
              isRejecting={rejectMutation.isPending}
              onApprove={() => approveMutation.mutate(relation.id)}
              onReject={() => rejectMutation.mutate(relation.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** Three queues, three different decisions — ds/components.css's own comment on this section:
 *  nothing publishes or merges without human confirmation. The reference's "run ingestion
 *  manually" button and "last run" summary line (both driven by sample data in the mockup) have
 *  no real endpoint behind them in this app and are left out rather than shown inert. */
export default function IngestionReviewPage() {
  return (
    <div className="u-wrap">
      <header className="ahead">
        <h1 className="ahead__t">Kontrola sběru článků</h1>
        <p className="ahead__d">
          Tři fronty, tři různá rozhodnutí. Nic se nezveřejní ani nespojí bez potvrzení člověkem.
        </p>
      </header>

      <DraftsSection />
      <PendingAdditionsSection />
      <StoryRelationsSection />
    </div>
  )
}
