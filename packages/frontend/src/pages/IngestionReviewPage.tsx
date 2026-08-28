import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type {
  AnalysisListItem,
  PendingAdditionItem,
  PendingStoryRelationItem,
  DraftQueueParams,
  PendingAdditionQueueParams,
  StoryRelationQueueParams,
} from '@/services/ingestion'
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
import { AdminPagination } from '@/components/AdminPagination'
import { AdminQueueControls, type SortOption } from '@/components/AdminQueueControls'
import './IngestionReviewPage.css'

// Below this many sources a Draft is flagged low-confidence — same threshold ReviewPage already
// warns on ("Při méně než 5 zdrojích může být triangulace omezená"), computed from the real
// coverageCount rather than a fabricated confidence score.
const THIN_DRAFT_THRESHOLD = 5

// ── Shared filter state ─────────────────────────────────────────────────────
// Every queue offers the same created-at-range + direction; the Drafts queue adds a
// source-count sort, Drafts + Pending Additions add an outlet filter. Sort is a single select
// (the HistoryPage convention) whose value maps to the API's separate `sort`/`dir`.

type DateOnlySortKey = 'newest' | 'oldest'
type DraftSortKey = DateOnlySortKey | 'most-sources' | 'least-sources'

const DATE_SORT_OPTIONS: SortOption<DateOnlySortKey>[] = [
  { value: 'newest', label: 'Nejnovější' },
  { value: 'oldest', label: 'Nejstarší' },
]
const DRAFT_SORT_OPTIONS: SortOption<DraftSortKey>[] = [
  ...DATE_SORT_OPTIONS,
  { value: 'most-sources', label: 'Nejvíce zdrojů' },
  { value: 'least-sources', label: 'Nejméně zdrojů' },
]

const DATE_SORT_DIR: Record<DateOnlySortKey, 'asc' | 'desc'> = { newest: 'desc', oldest: 'asc' }
const DRAFT_SORT_PARAMS: Record<DraftSortKey, Pick<DraftQueueParams, 'sort' | 'dir'>> = {
  newest: { sort: 'createdAt', dir: 'desc' },
  oldest: { sort: 'createdAt', dir: 'asc' },
  'most-sources': { sort: 'coverageCount', dir: 'desc' },
  'least-sources': { sort: 'coverageCount', dir: 'asc' },
}

/** Bundles the filter/pagination state every queue section repeats: page + the shared filter
 *  fields, with every filter setter resetting to page 1 (a filtered result set has fewer pages,
 *  so keeping the old page number would often land past the end). */
function useQueueFilterState() {
  const [page, setPage] = useState(1)
  const [outlet, setOutletRaw] = useState('')
  const [createdAfter, setCreatedAfterRaw] = useState('')
  const [createdBefore, setCreatedBeforeRaw] = useState('')

  const resetting =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setPage(1)
    }

  return {
    page,
    setPage,
    outlet,
    setOutlet: resetting(setOutletRaw),
    createdAfter,
    setCreatedAfter: resetting(setCreatedAfterRaw),
    createdBefore,
    setCreatedBefore: resetting(setCreatedBeforeRaw),
    /** Wrap a section-specific setter (e.g. the sort select) so it also resets the page. */
    withPageReset: resetting,
  }
}

function dateRangeParams(createdAfter: string, createdBefore: string) {
  return {
    createdAfter: createdAfter || undefined,
    createdBefore: createdBefore || undefined,
  }
}

/** Shared empty/loading/error copy for a queue whose fetch returned no rows — distinguishes a
 *  genuinely empty queue from a filter that matched nothing. */
function QueueEmptyState({ filtered, emptyText }: { filtered: boolean; emptyText: React.ReactNode }) {
  return (
    <p className="note" style={{ marginTop: 'var(--sp-4)' }}>
      {filtered ? 'Žádná položka neodpovídá zvolenému filtru.' : emptyText}
    </p>
  )
}

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
  const filters = useQueueFilterState()
  const [sortKey, setSortKey] = useState<DraftSortKey>('newest')
  const navigate = useNavigate()
  const approveMutation = useApproveDraft()
  const rejectMutation = useRejectDraft()

  const params: DraftQueueParams = useMemo(
    () => ({
      page: filters.page,
      ...DRAFT_SORT_PARAMS[sortKey],
      outlet: filters.outlet.trim() || undefined,
      ...dateRangeParams(filters.createdAfter, filters.createdBefore),
    }),
    [filters.page, sortKey, filters.outlet, filters.createdAfter, filters.createdBefore]
  )

  const { data, isLoading, isError, isPlaceholderData } = useVisibleDrafts(params)
  const drafts = data?.items
  const hasFilter =
    filters.outlet.trim() !== '' || filters.createdAfter !== '' || filters.createdBefore !== ''

  return (
    <section className="qsec">
      <div className="qsec__h">
        <h2 className="qsec__t">Koncepty čekající na schválení</h2>
        {data && <span className="qsec__n">{data.total}</span>}
      </div>
      <p className="qsec__d">
        Nalezeno automaticky sběrem článků. Zobrazují se až po nashromáždění dostatku zdrojů. Schválení vás
        přesměruje na obvyklý krok výběru zdrojů; nic se neanalyzuje, dokud to tam nepotvrdíte.
      </p>

      <AdminQueueControls
        idPrefix="drafts"
        sortValue={sortKey}
        sortOptions={DRAFT_SORT_OPTIONS}
        onSortChange={filters.withPageReset(setSortKey)}
        outlet={filters.outlet}
        onOutletChange={filters.setOutlet}
        createdAfter={filters.createdAfter}
        createdBefore={filters.createdBefore}
        onCreatedAfterChange={filters.setCreatedAfter}
        onCreatedBeforeChange={filters.setCreatedBefore}
      />

      {isLoading && <p className="note">Načítání…</p>}
      {isError && (
        <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="error__p">Nepodařilo se načíst koncepty.</p>
        </div>
      )}

      {drafts && drafts.length === 0 && (
        <QueueEmptyState
          filtered={hasFilter}
          emptyText={
            <>
              Momentálně žádné koncepty. Sběr článků běží jen když je spuštěný jeho cron — v lokálním vývoji
              ho <code>npm run dev</code> samo o sobě nespouští, viz README, sekce Automated Ingestion.
            </>
          }
        />
      )}

      {drafts && drafts.length > 0 && (
        <>
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
          <AdminPagination
            page={data.page}
            pageSize={data.pageSize}
            pageCount={data.pageCount}
            total={data.total}
            onPageChange={filters.setPage}
            busy={isPlaceholderData}
          />
        </>
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
  const filters = useQueueFilterState()
  const [sortKey, setSortKey] = useState<DateOnlySortKey>('newest')
  const navigate = useNavigate()
  const approveMutation = useApprovePendingAddition()
  const rejectMutation = useRejectPendingAddition()

  const params: PendingAdditionQueueParams = useMemo(
    () => ({
      page: filters.page,
      dir: DATE_SORT_DIR[sortKey],
      outlet: filters.outlet.trim() || undefined,
      ...dateRangeParams(filters.createdAfter, filters.createdBefore),
    }),
    [filters.page, sortKey, filters.outlet, filters.createdAfter, filters.createdBefore]
  )

  const { data, isLoading, isError, isPlaceholderData } = usePendingAdditions(params)
  const additions = data?.items
  const hasFilter =
    filters.outlet.trim() !== '' || filters.createdAfter !== '' || filters.createdBefore !== ''

  return (
    <section className="qsec">
      <div className="qsec__h">
        <h2 className="qsec__t">Možná doplnění k dokončeným článkům</h2>
        {data && <span className="qsec__n">{data.total}</span>}
      </div>
      <p className="qsec__d">
        Sběr článků nalezl nové pokrytí události, která je již dokončená. Schválení připojí zdroj a znovu
        spustí triangulaci od začátku — po dobu zpracování článek dočasně zmizí z výpisu. Zamítnutí je trvalé.
      </p>

      <AdminQueueControls
        idPrefix="additions"
        sortValue={sortKey}
        sortOptions={DATE_SORT_OPTIONS}
        onSortChange={filters.withPageReset(setSortKey)}
        outlet={filters.outlet}
        onOutletChange={filters.setOutlet}
        createdAfter={filters.createdAfter}
        createdBefore={filters.createdBefore}
        onCreatedAfterChange={filters.setCreatedAfter}
        onCreatedBeforeChange={filters.setCreatedBefore}
      />

      {isLoading && <p className="note">Načítání…</p>}
      {isError && (
        <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="error__p">Nepodařilo se načíst čekající doplnění.</p>
        </div>
      )}

      {additions && additions.length === 0 && (
        <QueueEmptyState
          filtered={hasFilter}
          emptyText="Momentálně žádná. (Vyžaduje běžící sběr článků — viz vysvětlení výše.)"
        />
      )}

      {additions && additions.length > 0 && (
        <>
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
          <AdminPagination
            page={data.page}
            pageSize={data.pageSize}
            pageCount={data.pageCount}
            total={data.total}
            onPageChange={filters.setPage}
            busy={isPlaceholderData}
          />
        </>
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
  const filters = useQueueFilterState()
  const [sortKey, setSortKey] = useState<DateOnlySortKey>('newest')
  const approveMutation = useApproveStoryRelation()
  const rejectMutation = useRejectStoryRelation()

  const params: StoryRelationQueueParams = useMemo(
    () => ({
      page: filters.page,
      dir: DATE_SORT_DIR[sortKey],
      ...dateRangeParams(filters.createdAfter, filters.createdBefore),
    }),
    [filters.page, sortKey, filters.createdAfter, filters.createdBefore]
  )

  const { data, isLoading, isError, isPlaceholderData } = usePendingStoryRelations(params)
  const relations = data?.items
  const hasFilter = filters.createdAfter !== '' || filters.createdBefore !== ''

  return (
    <section className="qsec">
      <div className="qsec__h">
        <h2 className="qsec__t">Vztahy mezi událostmi čekající na schválení</h2>
        {data && <span className="qsec__n">{data.total}</span>}
      </div>
      <p className="qsec__d">
        Nástroj s nižší jistotou navrhl souvislost mezi dvěma událostmi. Potvrďte, pokud dává smysl, nebo
        zamítněte — zamítnutí je trvalé a nástroj tuto dvojici znovu nenabídne.
      </p>

      <AdminQueueControls
        idPrefix="relations"
        sortValue={sortKey}
        sortOptions={DATE_SORT_OPTIONS}
        onSortChange={filters.withPageReset(setSortKey)}
        createdAfter={filters.createdAfter}
        createdBefore={filters.createdBefore}
        onCreatedAfterChange={filters.setCreatedAfter}
        onCreatedBeforeChange={filters.setCreatedBefore}
      />

      {isLoading && <p className="note">Načítání…</p>}
      {isError && (
        <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="error__p">Nepodařilo se načíst čekající vztahy.</p>
        </div>
      )}

      {relations && relations.length === 0 && (
        <QueueEmptyState filtered={hasFilter} emptyText="Momentálně žádné čekající vztahy." />
      )}

      {relations && relations.length > 0 && (
        <>
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
          <AdminPagination
            page={data.page}
            pageSize={data.pageSize}
            pageCount={data.pageCount}
            total={data.total}
            onPageChange={filters.setPage}
            busy={isPlaceholderData}
          />
        </>
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
