import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useThreadsList } from '@/services/thread/hooks'
import { threadPath } from '@/lib/threadRoutes'
import { formatDate } from '@/lib/formatDate'
import { formatCzechCount } from './homePageViewModel'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import './HistoryPage.css'
import './HomePage.css'

/** `/threads` — the "browse everything" page for Threads (ticket 71), playing the same role
 *  `/history` already plays for Articles. Every currently-visible Thread (real data only, same
 *  gate as the homepage teaser and the Thread detail page), most recently updated first,
 *  `ACTIVE`/`DORMANT`/`CLOSED` all included — a closed arc is still worth reading. */
export default function ThreadsPage() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useThreadsList()
  const allLoaded = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])

  return (
    <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
      <header className="screen-head">
        <div className="screen-head__k">Vlákna</div>
        <h1 className="screen-head__t">Vlákna tématu</h1>
        <p className="screen-head__d">
          Vícedílné, navazující zprávy o téže vyvíjející se události — nejnověji aktualizované nahoře.
        </p>
      </header>

      {isLoading && <p style={{ padding: 'var(--sp-5) 0' }}>Načítání…</p>}
      {isError && (
        <div className="error" style={{ marginTop: 'var(--sp-5)' }}>
          <p className="error__p">Nepodařilo se načíst vlákna.</p>
        </div>
      )}

      {!isLoading && !isError && allLoaded.length === 0 && (
        <div className="empty">
          <p className="empty__t">Zatím žádné vlákno s alespoň dvěma navazujícími zprávami.</p>
        </div>
      )}

      {allLoaded.length > 0 && (
        <section className="storylist">
          {allLoaded.map((t) => (
            <Link className="minute" to={threadPath(t.slug)} key={t.slug}>
              <span>
                <span className="minute__x hl">{t.title}</span>
                <span className="minute__s">
                  {formatCzechCount(t.memberCount, 'zpráva', 'zprávy', 'zpráv')} · {formatDate(t.lastEventAt)}
                </span>
              </span>
            </Link>
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
