import { Link } from 'react-router-dom'
import { Gauge } from '@/components/Gauge'
import type { AnalysisListSummary } from '@/services/analyses'
import type { HomepageArticleItem } from '@/services/homepageStats'
import {
  useHomepageArticles,
  useHomepageContradictions,
  useHomepageEntityStats,
  useHomepageMinuteFeed,
  useHomepageMostRead,
  useHomepageSummaryStats,
} from '@/services/homepageStats/hooks'
import { articlePath } from '@/lib/analysisRoutes'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import {
  entityTrendClass,
  formatCzechCount,
  formatEntityTrend,
  getEntityDotSize,
  getStorySignal,
} from './homePageViewModel'
import './HomePage.css'

const SOURCE_OVERLAP_BAD_THRESHOLD = 65

const TIME = new Intl.DateTimeFormat('cs-CZ', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Prague',
})

function StoryByline({ story, big }: { story: HomepageArticleItem; big?: boolean }) {
  const overlap = story.summary.sourceOverlap
  const signal = getStorySignal(story.summary)

  return (
    <div className="byline">
      <span className="byline__time">{TIME.format(new Date(story.createdAt))}</span>
      <span className="byline__sep">|</span>
      <span>
        <b>{story.coverageCount}</b> zdrojů
      </span>
      {overlap && (
        <>
          <span className="byline__sep">|</span>
          <span className="byline__grp">
            shoda <b>{overlap.percentage} %</b>
            <Gauge
              pct={overlap.percentage}
              bad={signal.bad}
              big={big}
              ariaLabel={`Shoda zdrojů ${overlap.percentage} procent`}
            />
          </span>
        </>
      )}
      <span className={signal.chipClass}>{signal.chipLabel}</span>
    </div>
  )
}

function imageAttribution(summary: AnalysisListSummary): string {
  const parts = [summary.leadImage?.author, summary.leadImage?.license].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Zdroj fotografie'
}

function StoryFigure({
  story,
  thumb,
  caption,
}: {
  story: HomepageArticleItem
  thumb?: boolean
  caption?: boolean
}) {
  const image = story.summary.leadImage

  return (
    <figure className={`fig${thumb ? ' fig--thumb' : ''}`}>
      {image ? (
        <img src={image.imageUrl} alt="Ilustrační foto" loading={thumb ? 'lazy' : 'eager'} />
      ) : (
        <div className="fig__ph" aria-label="Ilustrační foto není k dispozici" />
      )}
      {caption && image && (
        <figcaption>
          <a href={image.sourceUrl} target="_blank" rel="noreferrer">
            {imageAttribution(story.summary)}
          </a>
          <span>Ilustrační foto</span>
        </figcaption>
      )}
    </figure>
  )
}

/** Main-column section header ("Ve středu pozornosti", "Další zprávy dne") — e.css's `.sec`.
 *  `linkText` always points at `/history` (ticket 61's own demo-data cleanup): the reference
 *  mockup's own trailing link was a `#`-placeholder, and `/history` — the reader-facing "Články"
 *  archive — is the one real destination that already exists for "see more than what's on this
 *  homepage." Not filtered to "today only," since HistoryPage has no date filter; the label still
 *  reads honestly as "go see more," not as a promise of a same-day-only view. */
function Sec({ title, linkText }: { title: string; linkText: string }) {
  return (
    <div className="sec">
      <h2>{title}</h2>
      <span className="rule" aria-hidden="true" />
      <Link to="/history">{linkText}</Link>
    </div>
  )
}

/** Right-rail section header ("Entity dne", "Minuta", "Nejčtenější", "Jak čteme shodu") — e.css's
 *  `.bhead`, a distinct treatment from `.sec` above (border-bottom, trailing span pushed right).
 *  `noBorder` matches e.html's own inline override on the "Entity dne" instance specifically
 *  (`style="border-bottom:0;padding-bottom:0;margin-bottom:2px"`) — every other .bhead keeps it. */
function BHead({
  title,
  trailing,
  noBorder,
}: {
  title: string
  trailing?: React.ReactNode
  noBorder?: boolean
}) {
  return (
    <div
      className="bhead"
      style={noBorder ? { borderBottom: 0, paddingBottom: 0, marginBottom: '2px' } : undefined}
    >
      <h2>{title}</h2>
      {trailing}
    </div>
  )
}

function joinNames(names: string[], totalCount?: number): string {
  if (names.length === 0) return ''
  const shown = names.join(' · ')
  return totalCount && totalCount > names.length ? `${shown} a další` : shown
}

function LeadArticle({ story }: { story: HomepageArticleItem }) {
  return (
    <article className="lead">
      <span className="kicker">analýza {story.coverageCount} zdrojů</span>
      <h1 className="lead__h">
        <Link to={articlePath(story.id)} className="hl">
          {story.title}
        </Link>
      </h1>
      <StoryByline story={story} big />
      <div className="lead__body">
        <StoryFigure story={story} caption />
        <div>
          <p className="lead__perex">{story.summary.teaser}</p>
          {story.summary.entities.length > 0 && (
            <p className="story__meta" style={{ marginTop: '0.9rem' }}>
              Entity: {joinNames(story.summary.entities)}
            </p>
          )}
          {story.summary.outlets.length > 0 && (
            <p className="story__meta" style={{ marginTop: '0.3rem' }}>
              Zdroje: {joinNames(story.summary.outlets, story.coverageCount)}
            </p>
          )}
          <p style={{ marginTop: '1rem' }}>
            <Link to={articlePath(story.id)} className="kicker">
              Srovnání zdrojů →
            </Link>
          </p>
        </div>
      </div>
    </article>
  )
}

function TwoCards({ stories }: { stories: HomepageArticleItem[] }) {
  return (
    <div className="cards">
      {stories.map((story) => (
        <article className="card" key={story.id}>
          <Link to={articlePath(story.id)}>
            <StoryFigure story={story} />
          </Link>
          <span className="kicker kicker--ink">analýza {story.coverageCount} zdrojů</span>
          <Link to={articlePath(story.id)}>
            <h3 className="card__h hl">{story.title}</h3>
          </Link>
          <StoryByline story={story} />
          <p className="card__p">{story.summary.teaser}</p>
        </article>
      ))}
    </div>
  )
}

function StoryListSection({ stories }: { stories: HomepageArticleItem[] }) {
  return (
    <section className="storylist">
      {stories.map((story) => (
        <article className="story" key={story.id}>
          <div>
            <span className="kicker kicker--ink">analýza {story.coverageCount} zdrojů</span>
            <Link to={articlePath(story.id)}>
              <h3 className="hl">{story.title}</h3>
            </Link>
            <StoryByline story={story} />
            <p className="story__p">{story.summary.teaser}</p>
            {(story.summary.entities.length > 0 || story.summary.outlets.length > 0) && (
              <p className="story__meta">
                {story.summary.entities.length > 0 && `Entity: ${joinNames(story.summary.entities)}`}
                {story.summary.entities.length > 0 && story.summary.outlets.length > 0 && ' · '}
                {story.summary.outlets.length > 0 &&
                  `Zdroje: ${joinNames(story.summary.outlets, story.coverageCount)}`}
              </p>
            )}
          </div>
          <Link to={articlePath(story.id)}>
            <StoryFigure story={story} thumb />
          </Link>
        </article>
      ))}
    </section>
  )
}

/** "Entity dne" rail (ticket 59). `přehled →` points at `/search` — the reader-facing entity
 *  search page (ticket 43/`SearchPage.tsx`) is the one real "browse entities" destination that
 *  already exists; not a dedicated "today's entities" view, since no such page exists. */
function EntsPanel() {
  const { data: entities = [], isLoading, isError } = useHomepageEntityStats()
  const mentions = entities.map((e) => e.recentEventCount)
  const max = mentions.length > 0 ? Math.max(...mentions) : 0
  const min = mentions.length > 0 ? Math.min(...mentions) : 0
  return (
    <section className="ents">
      <BHead
        title="Entity dne"
        noBorder
        trailing={
          <span>
            <Link to="/search">přehled →</Link>
          </span>
        }
      />
      <p className="ents__note">Velikost kruhu odpovídá počtu zmínek za 24 hodin.</p>
      {isLoading ? (
        <p className="legend">Načítání entit…</p>
      ) : isError ? (
        <p className="legend">Nepodařilo se načíst entity.</p>
      ) : entities.length === 0 ? (
        <p className="legend">Zatím žádné entity za 24 hodin.</p>
      ) : (
        entities.map((e) => {
          const size = getEntityDotSize(e.recentEventCount, min, max)
          const trend = e.trendPercent
          return (
            <Link className="erow" to={`/entity/${e.key}`} key={e.key}>
              <span className="erow__c">
                <span className="erow__dot" style={{ inlineSize: size, blockSize: size }}>
                  {e.recentEventCount}
                </span>
              </span>
              <span>
                <span className="erow__n hl">{e.canonicalName}</span>
                <span className="erow__k">
                  {ENTITY_TYPE_LABELS[e.type]} · {e.recentSourceCount} zdrojů
                </span>
              </span>
              {trend !== undefined ? (
                <span className={`erow__t ${entityTrendClass(trend)}`}>{formatEntityTrend(trend)}</span>
              ) : (
                <span className="erow__t" />
              )}
            </Link>
          )
        })
      )}
    </section>
  )
}

function MinuteFeedSection() {
  const { data: items = [], isLoading, isError } = useHomepageMinuteFeed()

  return (
    <section>
      <BHead
        title="Minuta"
        trailing={
          <span className="livedot">
            <i /> průběžně
          </span>
        }
      />
      {isLoading ? (
        <p className="legend">Načítání minuty…</p>
      ) : isError ? (
        <p className="legend">Nepodařilo se načíst minutu.</p>
      ) : items.length === 0 ? (
        <p className="legend">Zatím žádné dokončené články.</p>
      ) : (
        items.map((item) => (
          <Link className="minute" to={articlePath(item.analysisId)} key={item.analysisId}>
            <span className="minute__t">{TIME.format(new Date(item.createdAt))}</span>
            <span>
              <span className="minute__x hl">{item.title}</span>
              <span className="minute__s">
                {item.sourceCount} zdrojů{item.hasConflict && <span className="is-bad"> · rozpor</span>}
              </span>
            </span>
          </Link>
        ))
      )}
    </section>
  )
}

function ConflictsSection() {
  const { data: items = [], isLoading, isError } = useHomepageContradictions()

  return (
    <section>
      <div className="qbox">
        <h2>Rozpory ve zdrojích</h2>
        {isLoading ? (
          <p className="legend">Načítání rozporů…</p>
        ) : isError ? (
          <p className="legend">Nepodařilo se načíst rozpory.</p>
        ) : items.length === 0 ? (
          <p className="legend">Za posledních 24 hodin nejsou uložené žádné rozpory.</p>
        ) : (
          items.map((item) => (
            <Link className="q" to={articlePath(item.analysisId)} key={`${item.analysisId}:${item.prose}`}>
              <span className="q__t hl">{item.title}</span>
              <span className="q__d">{item.prose}</span>
              {item.sourceOverlapPercentage !== undefined ? (
                <span className="byline" style={{ margin: 0 }}>
                  shoda <b>{item.sourceOverlapPercentage} %</b>
                  <Gauge
                    pct={item.sourceOverlapPercentage}
                    bad={item.sourceOverlapPercentage < SOURCE_OVERLAP_BAD_THRESHOLD}
                    ariaLabel={`Shoda zdrojů ${item.sourceOverlapPercentage} procent`}
                  />
                </span>
              ) : (
                <span className="byline" style={{ margin: 0 }}>
                  <b>{item.sourceCount}</b> zdrojů v rozporu
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </section>
  )
}

/** Real readership rail (ticket 61) — ranked by `AnalysisView` count in the last 24h, recorded by
 *  `ArticlePage`'s own view beacon. Replaces the old hardcoded `SAMPLE_MOSTREAD` array: a genuinely
 *  empty rail (no reads recorded yet — realistic on a low-traffic/local instance) is shown as such
 *  rather than backfilled with fake ranking. */
function MostReadSection() {
  const { data: items = [], isLoading, isError } = useHomepageMostRead()

  return (
    <section>
      <BHead title="Nejčtenější" trailing={<span>dnes</span>} />
      {isLoading ? (
        <p className="legend">Načítání nejčtenějších…</p>
      ) : isError ? (
        <p className="legend">Nepodařilo se načíst nejčtenější.</p>
      ) : items.length === 0 ? (
        <p className="legend">Zatím žádná čtení za posledních 24 hodin.</p>
      ) : (
        items.map((m, i) => (
          <Link className="minute" to={articlePath(m.analysisId)} key={m.analysisId}>
            <span className="minute__t">{i + 1}.</span>
            <span>
              <span className="minute__x hl">{m.title}</span>
              <span className="minute__s">{formatCzechCount(m.viewCount, 'čtení', 'čtení', 'čtení')}</span>
            </span>
          </Link>
        ))
      )}
    </section>
  )
}

function LegendSection() {
  return (
    <section>
      <BHead title="Jak čteme shodu" />
      <p className="legend">
        <b>Shoda</b> je podíl sledovaných zdrojů, které u dané zprávy uvádějí tvrzení bez věcného rozporu. Pod
        65 % označujeme zprávu jako <b>rozpornou</b> a uvádíme, v čem se zdroje liší.{' '}
        <a href="#" onClick={(e) => e.preventDefault()}>
          Celá metodika →
        </a>
      </p>
    </section>
  )
}

function DayStatsBar() {
  const { data, isLoading, isError } = useHomepageSummaryStats()
  const stats = data
    ? [
        {
          k: 'Zpracováno dnes',
          v: formatCzechCount(data.processedArticleCount, 'článek', 'články', 'článků'),
        },
        { k: 'Aktivní zdroje', v: formatCzechCount(data.activeSourceCount, 'zdroj', 'zdroje', 'zdrojů') },
        {
          k: 'Nové rozpory',
          v: formatCzechCount(data.contradictionCount, 'rozpor', 'rozpory', 'rozporů'),
          warn: data.contradictionCount > 0,
        },
        ...(data.averageSourceOverlapPercentage !== undefined
          ? [{ k: 'Průměrná shoda', v: `${data.averageSourceOverlapPercentage} %` }]
          : []),
      ]
    : []

  return (
    <div className="daystats">
      <div className="u-wrap daystats__in">
        {isLoading ? (
          <div className="stat">
            <b>…</b>
            Načítání statistik
          </div>
        ) : isError ? (
          <div className="stat stat--warn">
            <b>—</b>
            Statistiky nejsou dostupné
          </div>
        ) : (
          stats.map((t) => (
            <div className={`stat${t.warn ? ' stat--warn' : ''}`} key={t.k}>
              <b>{t.v}</b>
              {t.k}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function HomePage() {
  const { data: articles, isLoading, isError } = useHomepageArticles()

  return (
    <>
      <DayStatsBar />

      <main className="u-wrap">
        <div className="layout">
          <div>
            {isLoading ? (
              <p style={{ padding: 'var(--sp-5) 0', color: 'var(--ink-3)' }}>Načítání článků…</p>
            ) : isError ? (
              <div className="error" style={{ marginTop: 'var(--sp-5)' }}>
                <p className="error__p">Nepodařilo se načíst články.</p>
              </div>
            ) : articles?.lead ? (
              <>
                <LeadArticle story={articles.lead} />

                {articles.spotlight.length > 0 && (
                  <>
                    <Sec title="Ve středu pozornosti" linkText="Vše z dneška" />
                    <TwoCards stories={articles.spotlight} />
                  </>
                )}

                {articles.latest.length > 0 && (
                  <>
                    <Sec title="Další zprávy dne" linkText="Archiv" />
                    <StoryListSection stories={articles.latest} />
                  </>
                )}
              </>
            ) : (
              <div className="empty" style={{ marginTop: 'var(--sp-5)' }}>
                <p className="empty__t">Zatím žádné články</p>
                <p className="empty__d">Jakmile se dokončí první triangulace, objeví se tady.</p>
              </div>
            )}
          </div>

          <aside className="layout__rail">
            <EntsPanel />
            <MinuteFeedSection />
            <ConflictsSection />
            <MostReadSection />
            <LegendSection />
          </aside>
        </div>
      </main>
    </>
  )
}
