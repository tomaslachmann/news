import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Gauge } from '@/components/Gauge'
import { formatDate } from '@/lib/formatDate'
import { articlePath } from '@/lib/analysisRoutes'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import { useThreadDetail } from '@/services/thread/hooks'
import { MIN_SOURCES_FOR_GAUGE, ThreadNotFoundError } from '@/services/thread'
import type {
  AgreementCategory,
  EntityMentionItem,
  ThreadArticleRow,
  ThreadArticleTag,
  ThreadDetail,
  ThreadSourceRow,
  ThreadTimelineItem,
} from '@/services/thread'
import NotFoundPage from './NotFoundPage'
import { ErrorState } from './AnalysisPage'
import { buildThreadStats, orderTimeline } from './threadPageViewModel'
import './AnalysisPage.css'
import './HomePage.css'
import './ThreadPage.css'

const AGREEMENT_CATEGORY_LABEL: Record<AgreementCategory, string> = {
  CONFIRMED: 'potvrzeno napříč zdroji',
  PARTIAL: 'částečná shoda',
  DISPUTED: 'sporné',
}

const AGREEMENT_CATEGORY_CHIP: Record<AgreementCategory, 'chip--ok' | 'chip--mid' | 'chip--bad'> = {
  CONFIRMED: 'chip--ok',
  PARTIAL: 'chip--mid',
  DISPUTED: 'chip--bad',
}

const ARTICLE_TAG_LABEL: Record<ThreadArticleTag, string> = {
  agrees: 'shoduje se',
  contradicts: 'v rozporu',
  unique: 'jedinečné',
}

const ARTICLE_TAG_CHIP: Record<ThreadArticleTag, 'chip--ok' | 'chip--mid' | 'chip--bad'> = {
  agrees: 'chip--ok',
  contradicts: 'chip--bad',
  unique: 'chip--mid',
}

/** The header's byline — opened/updated dates + the thread-wide average agreement, matching
 *  `ArticlePage.tsx`'s own `AnalysisByline` structure directly under its `<h1>` (the "real
 *  precedent" ticket 69 follows for not showing a perex). Text only, no Gauge/chip here: unlike a
 *  single Analysis's `sourceOverlap.tier` (interpreted backend-side against real thresholds, ADR
 *  0030), this average has no backend-computed tier of its own — inventing an ok/mid/bad
 *  boundary for it on the frontend would be exactly the re-derivation ADR 0030 exists to prevent. */
function ThreadByline({ thread }: { thread: ThreadDetail }) {
  return (
    <div className="byline">
      <span className="byline__grp">
        otevřeno <b>{formatDate(thread.firstEventAt)}</b>
      </span>
      <span className="byline__sep">·</span>
      <span className="byline__time">aktualizováno {formatDate(thread.lastEventAt)}</span>
      {thread.averageAgreementPercentage != null && (
        <>
          <span className="byline__sep">·</span>
          <span className="byline__grp">
            průměr vlákna <b>{thread.averageAgreementPercentage} %</b>
          </span>
        </>
      )}
    </div>
  )
}

function ThreadStats({ thread }: { thread: ThreadDetail }) {
  const stats = buildThreadStats(thread)

  return (
    <div className="daystats">
      <div className="u-wrap daystats__in">
        {stats.map((s) => (
          <div className={`stat${s.warn ? ' stat--warn' : ''}`} key={s.k}>
            <b>{s.v}</b>
            {s.k}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Member-granularity chronology (ticket 65's grilling session) — real fields only, no
 *  fabricated "what changed" narrative or breakthrough/correction marks. `items` arrives
 *  oldest-first from the backend (`ThreadDetailRow`'s own `position asc` ordering); the toggle
 *  flips the display order without a second fetch. */
function ThreadTimeline({ items }: { items: ThreadTimelineItem[] }) {
  const [oldestFirst, setOldestFirst] = useState(false)
  if (items.length === 0) return null
  const ordered = orderTimeline(items, oldestFirst)

  return (
    <section aria-labelledby="tlT">
      <div className="sechead">
        <h2 className="sechead__t" id="tlT">
          Chronologie vlákna
        </h2>
        <span className="sechead__rule" />
        <span className="tl__order">
          <button className="btn btn--micro" type="button" onClick={() => setOldestFirst((v) => !v)}>
            {oldestFirst ? 'Od nejnovějšího' : 'Od nejstaršího'}
          </button>
        </span>
      </div>
      <div className="tl">
        {ordered.map((item) => (
          <div className="tl__i" key={item.analysisId}>
            <span className="tl__t">{formatDate(item.eventTime)}</span>
            <div>
              <Link to={articlePath(item.analysisId)}>
                <p className="tl__h hl">{item.title}</p>
              </Link>
              <p className="byline tl__b">
                <span className="byline__grp">
                  <b>{item.sourceCount}</b> zdrojů
                </span>
                {item.sourceOverlap && (
                  <>
                    <span className="byline__sep">·</span>
                    <span className="byline__grp">
                      <b>{item.sourceOverlap.percentage} %</b>
                      {item.sourceOverlap.sourceCount >= MIN_SOURCES_FOR_GAUGE && (
                        <Gauge
                          pct={item.sourceOverlap.percentage}
                          bad={item.sourceOverlap.tier === 'bad'}
                          ariaLabel={`Překryv zdrojů ${item.sourceOverlap.percentage} procent`}
                        />
                      )}
                    </span>
                  </>
                )}
                <span className="byline__sep">·</span>
                <span className={`chip ${AGREEMENT_CATEGORY_CHIP[item.agreementCategory]}`}>
                  {AGREEMENT_CATEGORY_LABEL[item.agreementCategory]}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Individual-outlet-article granularity (ticket 65's grilling session) — the honest alternative
 *  to the reference design's fabricated per-row "Shoda %": each row's tags are derived by
 *  matching its own `articleUrl` against every dimension item's `Attribution.articleUrl` on its
 *  Analysis (backend, mappers/threadDetail.ts), never invented here. */
function ThreadArticlesTable({ rows }: { rows: ThreadArticleRow[] }) {
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="tAllT">
      <div className="sechead">
        <h2 className="sechead__t" id="tAllT">
          Všechny články ve vlákně
        </h2>
        <span className="sechead__rule" />
        <span className="sechead__more">{rows.length} celkem</span>
      </div>
      <div className="u-scroll-x">
        <table className="artable">
          <thead>
            <tr>
              <th scope="col">Zdroj</th>
              <th scope="col">Kdy</th>
              <th scope="col">Titulek</th>
              <th scope="col">Zjištění</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.articleUrl}>
                <td className="artable__who">{row.outlet}</td>
                <td className="artable__d">{formatDate(row.publishedAt)}</td>
                <td className="artable__t">
                  <a className="hl" href={row.articleUrl} target="_blank" rel="noopener noreferrer">
                    {row.title ?? 'Bez názvu'}
                  </a>
                </td>
                <td className="artable__m">
                  {row.tags.length === 0
                    ? '—'
                    : row.tags.map((tag) => (
                        <span className={`chip ${ARTICLE_TAG_CHIP[tag]}`} key={tag}>
                          {ARTICLE_TAG_LABEL[tag]}
                        </span>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Real aggregated per-outlet Coverage counts across the whole thread — no invented editorial
 *  role labels (ticket 65's grilling session rejected the reference design's "primární zdroj" /
 *  "přebírá" / "vlastní zjištění" text, which has no real classification behind it). */
function ThreadSourcesRail({ sources }: { sources: ThreadSourceRow[] }) {
  if (sources.length === 0) return null
  return (
    <section aria-labelledby="tSrcT">
      <div className="railhead">
        <h2 className="railhead__t" id="tSrcT">
          Zdroje ve vlákně
        </h2>
        <span className="railhead__x">{sources.length}</span>
      </div>
      <ol className="srclist">
        {sources.map((s) => (
          <li className="srcrow" key={s.outlet}>
            <span className="srcrow__w">{s.outlet}</span>
            <span className="srcrow__b">
              <b>{s.coverageCount}</b> {s.coverageCount === 1 ? 'článek' : 'článků'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ThreadEntitiesRail({ entities }: { entities: EntityMentionItem[] }) {
  if (entities.length === 0) return null
  return (
    <section>
      <div className="railhead">
        <h2 className="railhead__t">Entity ve vlákně</h2>
        <span className="railhead__x">{entities.length}</span>
      </div>
      <div className="ents">
        {entities.map((e) => (
          <Link className="erow" to={`/entity/${e.key}`} key={e.key}>
            <span className="erow__dot">{ENTITY_TYPE_LABELS[e.type][0]}</span>
            <span>
              <span className="erow__n hl">{e.canonicalName}</span>
              <span className="erow__k">{ENTITY_TYPE_LABELS[e.type]}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Placeholder content, not computed from real data — ticket 67 (thread-level open-questions
 *  synthesis) is unresolved, and ticket 65's grilling session decided this rail still ships now
 *  rather than being dropped, since there are no real readers of this deployment yet. Must never
 *  be mistaken for a real finding — every line here says so explicitly. */
function ThreadOpenQuestionsRail() {
  return (
    <section aria-labelledby="tOpenT">
      <div className="railhead">
        <h2 className="railhead__t" id="tOpenT">
          Otevřené otázky
        </h2>
        <span className="railhead__x">brzy</span>
      </div>
      <ul className="qa">
        <li>
          <p className="qa__q">
            <span>Tato sekce zatím nezobrazuje skutečná zjištění.</span>
          </p>
          <p className="qa__d">
            Syntéza otevřených otázek napříč vláknem ještě není postavena (ticket 67) — zde bude, jakmile bude
            hotová.
          </p>
        </li>
      </ul>
    </section>
  )
}

function ThreadExplainerBox() {
  return (
    <section>
      <div className="box">
        <p className="box__t">Jak vlákno vzniká</p>
        <p className="note">
          Vlákno spojuje zprávy o téže vyvíjející se události, propojené jako navazující. Vzniká a doplňuje se
          automaticky, jakmile najdeme novou navazující zprávu. Bez nové zprávy déle než 30 dní vlákno přejde
          do stavu „bez aktivity" — zůstává čitelné, jen se dál nesleduje, dokud nepřibude další navazující
          zpráva.
        </p>
      </div>
    </section>
  )
}

function CompleteThread({ thread }: { thread: ThreadDetail }) {
  return (
    <>
      <div className="u-wrap">
        <nav className="crumbs" aria-label="Cesta">
          <Link to="/">Domů</Link>
          <span className="crumbs__sep">/</span>
          <span aria-current="page">Vlákno tématu</span>
        </nav>
      </div>

      <div className="u-wrap">
        <header className="arthead" style={{ paddingTop: 'var(--sp-2)' }}>
          <h1 className="arthead__h">{thread.title}</h1>
          <ThreadByline thread={thread} />
        </header>
      </div>

      <ThreadStats thread={thread} />

      <main className="u-wrap layout">
        <div className="artbody">
          <ThreadTimeline items={thread.timeline} />
          <ThreadArticlesTable rows={thread.articles} />
        </div>

        <aside className="layout__rail">
          <ThreadOpenQuestionsRail />
          <ThreadSourcesRail sources={thread.sources} />
          <ThreadEntitiesRail entities={thread.entities} />
          <ThreadExplainerBox />
        </aside>
      </main>
    </>
  )
}

/** The dedicated Thread page (ticket 68/69) — `/thread/:slug`, public, reachable from the
 *  existing `ArticlePage` inline `ThreadSection`'s heading link. Mirrors `ArticlePage`'s own
 *  loading/error/not-found handling exactly. */
export default function ThreadPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: thread, isLoading, isError, error } = useThreadDetail(slug)

  if (isLoading) {
    return (
      <div className="u-wrap" style={{ paddingBlock: 'var(--sp-6)' }}>
        <p className="note">Načítání vlákna…</p>
      </div>
    )
  }

  // Distinguishes the backend's deliberate never-leak-existence 404 (unknown slug, or a Thread
  // that dropped below 2 visible members — threadDetailService.ts) from a genuine fetch failure:
  // the former renders the same NotFoundPage a public reader sees for any dead link, the latter
  // gets a retryable ErrorState. Without checking the error type, both looked identical via
  // isError alone (see code-review finding on this ticket).
  if (isError) {
    if (error instanceof ThreadNotFoundError) return <NotFoundPage />
    return <ErrorState message="Nepodařilo se načíst vlákno." />
  }

  if (!thread) {
    return <NotFoundPage />
  }

  return <CompleteThread thread={thread} />
}
