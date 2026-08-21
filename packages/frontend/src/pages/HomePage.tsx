import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Gauge } from '@/components/Gauge'
import type { AnalysisListSummary } from '@/services/analyses'
import { useArticlesList } from '@/services/analyses/hooks'
import { articlePath } from '@/lib/analysisRoutes'
import { getStorySignal, splitHomePageStories, type HomePageStory } from './homePageViewModel'
import './HomePage.css'

const SAMPLE_BAD_THRESHOLD = 65

const TIME = new Intl.DateTimeFormat('cs-CZ', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Prague',
})

// Entities already sorted by mentions desc, matching data2.js's window.NT.entities.sort().
const SAMPLE_ENTITIES = [
  { name: 'Andrej Babiš', kind: 'osoba', mentions: 176, trend: 12, sources: 24 },
  { name: 'Ukrajina', kind: 'místo', mentions: 158, trend: 8, sources: 27 },
  { name: 'Petr Fiala', kind: 'osoba', mentions: 148, trend: -4, sources: 21 },
  { name: 'Donald Trump', kind: 'osoba', mentions: 133, trend: 21, sources: 19 },
  { name: 'ČNB', kind: 'instituce', mentions: 121, trend: 3, sources: 17 },
  { name: 'Evropská komise', kind: 'instituce', mentions: 96, trend: -9, sources: 15 },
  { name: 'NATO', kind: 'instituce', mentions: 88, trend: 5, sources: 14 },
  { name: 'Praha', kind: 'místo', mentions: 74, trend: 0, sources: 12 },
  { name: 'ČEZ', kind: 'firma', mentions: 61, trend: 7, sources: 11 },
  { name: 'Ministerstvo financí', kind: 'instituce', mentions: 54, trend: -2, sources: 9 },
]

const SAMPLE_TICKER = [
  { k: 'Zpracováno dnes', v: '1 284 článků' },
  { k: 'Aktivní zdroje', v: '41' },
  { k: 'Nové rozpory', v: '12', warn: true },
  { k: 'Průměrná shoda', v: '73 %' },
  { k: 'Nejrychlejší zdroj', v: 'ČTK · 3 min' },
]

const SAMPLE_FEED = [
  { t: '15:24', title: 'Ministerstvo financí zpřesnilo odhad salda na 241 mld. Kč', src: 4 },
  { t: '15:11', title: 'Sněmovní výbor odložil hlasování o novele o veřejných zakázkách', src: 3 },
  { t: '14:58', title: 'Kurz koruny se po jednání ČNB pohybuje u 24,60 za euro', src: 6 },
  {
    t: '14:36',
    title: 'Do stávky se podle odborů zapojilo 38 škol v Moravskoslezském kraji',
    src: 5,
    conflict: true,
  },
  { t: '14:12', title: 'Rada EU odsunula rozhodnutí o dovozních kvótách na příští týden', src: 7 },
  { t: '13:49', title: 'ČEZ potvrdil odstávku bloku v Dukovanech na plánované datum', src: 3 },
  {
    t: '13:20',
    title: 'Policie zahájila úkony v trestním řízení kvůli dotacím pro obce',
    src: 8,
    conflict: true,
  },
  { t: '12:55', title: 'Praha vypsala tendr na obnovu tramvajové trati na Smíchově', src: 2 },
  { t: '12:31', title: 'Ukrajinská delegace přijede do Prahy koncem měsíce', src: 5 },
]

const SAMPLE_MOSTREAD = [
  { title: 'Rozpor: kolik bytů se skutečně dotkne nová pražská vyhláška', src: 7 },
  { title: 'Tři redakce citují pasáž, která v oficiálním přepisu chybí', src: 11 },
  { title: 'Jak se za 24 hodin změnilo číslo o objemu investice ČEZ', src: 6 },
  { title: 'Kdo první uvedl termín září u dodávek munice', src: 8 },
  { title: 'Přehled: kde se agentury nejčastěji rozcházejí', src: 14 },
]

const SAMPLE_CONFLICTS = [
  { title: 'Saldo rozpočtu', detail: 'rozdíl 18 mld. Kč mezi 7 zdroji', pct: 62 },
  { title: 'Objem investice ČEZ', detail: 'dvojnásobný rozdíl v údaji', pct: 71 },
  { title: 'Citace z auditu', detail: 'pasáž chybí v primárním přepisu', pct: 48 },
  { title: 'Termín dodávek munice', detail: 'původní zdroj nedohledán', pct: 55 },
]

function StoryByline({ story, big }: { story: HomePageStory; big?: boolean }) {
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
  story: HomePageStory
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

/** Main-column section header ("Ve středu pozornosti", "Další zprávy dne") — e.css's `.sec`. */
function Sec({ title, linkText }: { title: string; linkText: string }) {
  return (
    <div className="sec">
      <h2>{title}</h2>
      <span className="rule" aria-hidden="true" />
      <a href="#" onClick={(e) => e.preventDefault()}>
        {linkText}
      </a>
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

function LeadArticle({ story }: { story: HomePageStory }) {
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
        <Link to={articlePath(story.id)}>
          <StoryFigure story={story} caption />
        </Link>
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

function TwoCards({ stories }: { stories: HomePageStory[] }) {
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

function StoryListSection({ stories }: { stories: HomePageStory[] }) {
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

function EntsPanel() {
  const mentions = SAMPLE_ENTITIES.map((e) => e.mentions)
  const max = Math.max(...mentions)
  const min = Math.min(...mentions)
  return (
    <section className="ents">
      <BHead
        title="Entity dne"
        noBorder
        trailing={
          <span>
            <a href="#" onClick={(e) => e.preventDefault()}>
              přehled →
            </a>
          </span>
        }
      />
      <p className="ents__note">Velikost kruhu odpovídá počtu zmínek za 24 hodin.</p>
      {SAMPLE_ENTITIES.map((e) => {
        const size = 26 + Math.round(((e.mentions - min) / (max - min)) * 24)
        const cls = e.trend > 0 ? 'is-up' : e.trend < 0 ? 'is-down' : ''
        const trend = e.trend > 0 ? `+${e.trend} %` : e.trend < 0 ? `${e.trend} %` : '0 %'
        return (
          <a className="erow" href="#" key={e.name} onClick={(ev) => ev.preventDefault()}>
            <span className="erow__c">
              <span className="erow__dot" style={{ inlineSize: size, blockSize: size }}>
                {e.mentions}
              </span>
            </span>
            <span>
              <span className="erow__n hl">{e.name}</span>
              <span className="erow__k">
                {e.kind} · {e.sources} zdrojů
              </span>
            </span>
            <span className={`erow__t ${cls}`}>{trend}</span>
          </a>
        )
      })}
    </section>
  )
}

function PullQuoteSection() {
  return (
    <section className="pull">
      <q>Tři redakce citují pasáž, která se v oficiálním přepisu nenachází.</q>
      <cite>Z dnešní analýzy rozporů</cite>
    </section>
  )
}

function MinuteFeedSection() {
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
      {SAMPLE_FEED.map((f) => (
        <a className="minute" href="#" key={f.t} onClick={(e) => e.preventDefault()}>
          <span className="minute__t">{f.t}</span>
          <span>
            <span className="minute__x hl">{f.title}</span>
            <span className="minute__s">
              {f.src} zdrojů{f.conflict && <span className="is-bad"> · rozpor</span>}
            </span>
          </span>
        </a>
      ))}
    </section>
  )
}

function ConflictsSection() {
  return (
    <section>
      <div className="qbox">
        <h2>Rozpory ve zdrojích</h2>
        {SAMPLE_CONFLICTS.map((c) => (
          <a className="q" href="#" key={c.title} onClick={(e) => e.preventDefault()}>
            <span className="q__t hl">{c.title}</span>
            <span className="q__d">{c.detail}</span>
            <span className="byline" style={{ margin: 0 }}>
              shoda <b>{c.pct} %</b>
              <Gauge
                pct={c.pct}
                bad={c.pct < SAMPLE_BAD_THRESHOLD}
                ariaLabel={`Shoda zdrojů ${c.pct} procent`}
              />
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}

function MostReadSection() {
  return (
    <section>
      <BHead title="Nejčtenější" trailing={<span>dnes</span>} />
      {SAMPLE_MOSTREAD.map((m, i) => (
        <a className="minute" href="#" key={m.title} onClick={(e) => e.preventDefault()}>
          <span className="minute__t">{i + 1}.</span>
          <span>
            <span className="minute__x hl">{m.title}</span>
            <span className="minute__s">{m.src} zdrojů</span>
          </span>
        </a>
      ))}
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
  return (
    <div className="daystats">
      <div className="u-wrap daystats__in">
        {SAMPLE_TICKER.map((t) => (
          <div className={`stat${t.warn ? ' stat--warn' : ''}`} key={t.k}>
            <b>{t.v}</b>
            {t.k}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HomePage() {
  const { data, isLoading, isError } = useArticlesList()
  const sections = useMemo(() => {
    const items = data?.pages.flatMap((page) => page.items) ?? []
    return splitHomePageStories(items)
  }, [data])
  const { lead, twoCards, listStories } = sections

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
            ) : lead ? (
              <>
                <LeadArticle story={lead} />

                {twoCards.length > 0 && (
                  <>
                    <Sec title="Ve středu pozornosti" linkText="Vše z dneška" />
                    <TwoCards stories={twoCards} />
                  </>
                )}

                {listStories.length > 0 && (
                  <>
                    <Sec title="Další zprávy dne" linkText="Archiv" />
                    <StoryListSection stories={listStories} />
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
            <PullQuoteSection />
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
