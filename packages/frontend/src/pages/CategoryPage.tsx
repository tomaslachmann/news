import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { ARTICLE_CATEGORY_LABELS, type ArticleCategory } from '@news-triangulator/shared'
import { useCategoryArticlesList } from '@/services/category/hooks'
import { UnknownCategoryError } from '@/services/category'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import { ArchiveRow } from './HistoryPage'
import { ErrorState } from './AnalysisPage'
import NotFoundPage from './NotFoundPage'
import './HistoryPage.css'

/** `/category/:slug` — the "browse everything" page for one rubric (ticket 80), same role
 *  `/history`/`/threads` already play. `slug` is just an `ArticleCategory` value lowercased (no
 *  separate slug table — see categoryBrowseService.ts's `parseCategorySlug`); an unknown slug
 *  gets the same `NotFoundPage` a dead link anywhere else in this app renders, distinguished from
 *  a genuine fetch failure the same way ThreadPage does for `ThreadNotFoundError`. */
export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCategoryArticlesList(slug)
  const allLoaded = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])

  if (isError) {
    if (error instanceof UnknownCategoryError) return <NotFoundPage />
    return <ErrorState message="Nepodařilo se načíst články." />
  }

  const label = slug ? ARTICLE_CATEGORY_LABELS[slug.toUpperCase() as ArticleCategory] : undefined

  return (
    <div className="page-shell">
      <header className="screen-head">
        <div className="screen-head__k">Rubrika</div>
        <h1 className="screen-head__t">{label ?? 'Rubrika'}</h1>
        <p className="screen-head__d">Články, jejichž zdroje tuto rubriku uvádějí nejčastěji.</p>
      </header>

      {isLoading && <p style={{ padding: 'var(--sp-5) 0' }}>Načítání…</p>}

      {!isLoading && allLoaded.length === 0 && (
        <div className="empty">
          <p className="empty__t">V této rubrice zatím nejsou žádné články.</p>
        </div>
      )}

      {allLoaded.length > 0 && (
        <section className="storylist">
          {allLoaded.map((item) => (
            <ArchiveRow key={item.id} item={item} />
          ))}
        </section>
      )}

      {allLoaded.length > 0 && (
        <div className="pager">
          <span>{allLoaded.length} načtených</span>
          {hasNextPage && (
            <LoadMoreButton onClick={() => void fetchNextPage()} isFetching={isFetchingNextPage} />
          )}
        </div>
      )}
    </div>
  )
}
