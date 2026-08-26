import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AnalysisListItem } from '@/services/analyses'
import { useAnalysesList, useArticlesList } from '@/services/analyses/hooks'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/formatDate'
import { ANALYSIS_STATUS_LABELS } from '@/lib/analysisStatusLabels'
import { articlePath, analysisPath } from '@/lib/analysisRoutes'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import './HistoryPage.css'

const STATE_MODIFIER: Record<AnalysisListItem['status'], string> = {
  draft: 'archive-state--draft',
  complete: 'archive-state--done',
  failed: 'archive-state--fail',
  pending: 'archive-state--live',
}

type StatusFilter = 'all' | AnalysisListItem['status']
type SortOrder = 'newest' | 'oldest' | 'most-sources'

/** Ticket 52: a reader-facing list row always points at `/article/:id`; the admin/internal list
 *  can still include non-complete Analyses, which must link to the monitoring view instead.
 *  Exported for CategoryPage.tsx (ticket 80), which shows the same row shape filtered by
 *  category — every row it can show is COMPLETE-only (categoryBrowseService.ts), the same subset
 *  ReaderHistoryPage renders here, so it reuses this row rather than a near-duplicate. */
export function ArchiveRow({ item }: { item: AnalysisListItem }) {
  const href = item.status === 'complete' ? articlePath(item.id) : analysisPath(item.id)
  return (
    <Link to={href} className="archive-row">
      <div className={`archive-state ${STATE_MODIFIER[item.status]}`}>
        {ANALYSIS_STATUS_LABELS[item.status]}
      </div>
      <div>
        <div className="archive-title">{item.title}</div>
        <div className="archive-meta">zdrojů: {item.coverageCount}</div>
      </div>
      <div className="archive-side">{formatDate(item.createdAt)}</div>
    </Link>
  )
}

function HistoryContent({
  isAdmin,
  data,
  isLoading,
  isError,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: {
  isAdmin: boolean
  data: ReturnType<typeof useAnalysesList>['data']

  isLoading: boolean
  isError: boolean
  fetchNextPage: () => Promise<unknown>
  hasNextPage: boolean | undefined
  isFetchingNextPage: boolean
}) {
  const allLoaded = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [search, setSearch] = useState('')

  // Client-side, over whatever pages have been loaded so far — the API only offers keyset
  // pagination (newest-first), no status/search/sort query params, so this filters/sorts what's
  // already fetched rather than the full archive. "Načíst další" below still extends what's
  // available to filter/sort over.
  const filtered = useMemo(() => {
    let items = allLoaded
    if (statusFilter !== 'all') items = items.filter((i) => i.status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter((i) => i.title.toLowerCase().includes(q))
    }
    const sorted = [...items]
    if (sortOrder === 'oldest') sorted.reverse()
    else if (sortOrder === 'most-sources') sorted.sort((a, b) => b.coverageCount - a.coverageCount)
    return sorted
  }, [allLoaded, statusFilter, sortOrder, search])

  return (
    <div className="page-shell">
      <header className="screen-head">
        <div className="screen-head__k">Archiv</div>
        <h1 className="screen-head__t">{isAdmin ? 'Historie analýz' : 'Články'}</h1>
        <p className="screen-head__d">
          {isAdmin
            ? 'Jedna událost, jeden záznam. Zde najdete koncepty, probíhající analýzy i dokončené triangulace.'
            : 'Procházejte starší články.'}
        </p>
      </header>

      {isLoading && <p style={{ padding: 'var(--sp-5) 0' }}>Načítání…</p>}
      {isError && (
        <div className="error" style={{ marginTop: 'var(--sp-5)' }}>
          <p className="error__p">Nepodařilo se načíst data.</p>
        </div>
      )}

      {allLoaded.length > 0 && (
        <div className="archive-toolbar">
          <div className="filter">
            <label htmlFor="status">Stav</label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">Všechny</option>
              <option value="complete">Dokončeno</option>
              <option value="pending">Zpracovává se</option>
              <option value="draft">Koncept</option>
              <option value="failed">Selhalo</option>
            </select>
          </div>
          <div className="filter">
            <label htmlFor="sort">Řazení</label>
            <select id="sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)}>
              <option value="newest">Nejnovější</option>
              <option value="oldest">Nejstarší</option>
              <option value="most-sources">Nejvíce zdrojů</option>
            </select>
          </div>
          <div className="filter" style={{ flex: 1, minWidth: '14rem' }}>
            <label htmlFor="historySearch">Hledat</label>
            <input
              id="historySearch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Název události…"
            />
          </div>
        </div>
      )}

      {!isLoading && allLoaded.length === 0 && (
        <div className="empty">
          <p className="empty__t">{isAdmin ? 'Zatím žádné analýzy' : 'Zatím žádné články'}</p>
          {isAdmin ? (
            <p className="empty__d">
              <Link to="/new-analysis">Spusťte první analýzu</Link>
            </p>
          ) : (
            <p className="empty__d">Zkuste to prosím brzy znovu.</p>
          )}
        </div>
      )}

      {allLoaded.length > 0 && filtered.length === 0 && (
        <div className="empty">
          <p className="empty__t">Žádný záznam neodpovídá filtru</p>
          <p className="empty__d">Zkuste změnit stav, hledaný výraz, nebo obojí vynulovat.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <section className="storylist">
          {filtered.map((item) => (
            <ArchiveRow key={item.id} item={item} />
          ))}
        </section>
      )}

      {allLoaded.length > 0 && (
        <div className="pager">
          <span>
            {filtered.length === allLoaded.length
              ? `${allLoaded.length} záznamů`
              : `${filtered.length} z ${allLoaded.length} načtených`}
          </span>
          {hasNextPage && (
            <LoadMoreButton onClick={() => void fetchNextPage()} isFetching={isFetchingNextPage} />
          )}
        </div>
      )}
    </div>
  )
}

function AdminHistoryPage() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useAnalysesList()
  return (
    <HistoryContent
      isAdmin
      data={data}
      isLoading={isLoading}
      isError={isError}
      fetchNextPage={() => fetchNextPage()}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
    />
  )
}

function ReaderHistoryPage() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useArticlesList()
  return (
    <HistoryContent
      isAdmin={false}
      data={data}
      isLoading={isLoading}
      isError={isError}
      fetchNextPage={() => fetchNextPage()}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
    />
  )
}

export default function HistoryPage() {
  const { user } = useAuth()
  return user?.role === 'ADMIN' ? <AdminHistoryPage /> : <ReaderHistoryPage />
}
