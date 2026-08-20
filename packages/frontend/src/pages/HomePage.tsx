import './HomePage.css'

// ============================================================================
// Sample content — a 1:1 port of e.html's own literal data (shared/data.js +
// data2.js), not real API data. This is a visual/component port: reusable
// components (Gauge, SampleByline, LeadArticle, TwoCards, StoryListSection,
// EntsPanel, MinuteFeedSection, ConflictsSection, MostReadSection) built
// against this fixed sample content now; wiring them to real Analysis data is
// separate, later work.
// ============================================================================

interface SampleStory {
  title: string
  lead: string
  sources: number
  agreement: number
  conflict: boolean
  clock: string
  topic: string
  entities: string[]
  outlets: string[]
  img: string
}

// clocks from data2.js overwrite each story's original `time` field before render — only the
// final clock value actually reaches the page, so that's the only one kept here.
const SAMPLE_STORIES: SampleStory[] = [
  {
    title: 'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu',
    lead: 'Sedm redakcí popisuje stejný krok, rozcházejí se ale v čísle výsledného salda — rozdíl činí 18 mld. Kč.',
    sources: 9,
    agreement: 62,
    conflict: true,
    clock: '15:12',
    topic: 'Ekonomika',
    entities: ['Ministerstvo financí', 'Petr Fiala', 'ODS'],
    outlets: ['ČTK', 'iRozhlas', 'Seznam Zprávy', 'Deník N'],
    img: 'parlament',
  },
  {
    title: 'ČNB ponechala úrokové sazby bez změny',
    lead: 'Shodné znění napříč zdroji, tři z nich přebírají identickou formulaci z tiskové zprávy banky.',
    sources: 12,
    agreement: 94,
    conflict: false,
    clock: '14:41',
    topic: 'Ekonomika',
    entities: ['ČNB'],
    outlets: ['ČTK', 'E15', 'Hospodářské noviny'],
    img: 'cnb',
  },
  {
    title: 'Jednání o dodávkách munice pro Ukrajinu se posunulo na září',
    lead: 'Dva zdroje uvádějí odklad kvůli logistice, tři zmiňují politický spor v Radě EU. Původní zdroj nedohledán.',
    sources: 8,
    agreement: 55,
    conflict: true,
    clock: '14:03',
    topic: 'Zahraničí',
    entities: ['Ukrajina', 'Evropská komise', 'NATO'],
    outlets: ['Reuters', 'ČTK', 'Novinky'],
    img: 'munice',
  },
  {
    title: 'ČEZ oznámil investici do přenosové sítě na severní Moravě',
    lead: 'Údaj o objemu investice se mezi zdroji liší dvojnásobně; nejnižší hodnota pochází z výroční zprávy.',
    sources: 6,
    agreement: 71,
    conflict: true,
    clock: '13:18',
    topic: 'Energetika',
    entities: ['ČEZ', 'Ostrava'],
    outlets: ['ČTK', 'Deník', 'Ekonomický deník'],
    img: 'energetika',
  },
  {
    title: 'Trump podepsal exekutivní příkaz k dovozním tarifům',
    lead: 'Agentury se shodují na obsahu, komentáře k dopadu na český export se rozcházejí.',
    sources: 14,
    agreement: 88,
    conflict: false,
    clock: '12:44',
    topic: 'Zahraničí',
    entities: ['Donald Trump', 'Evropská komise'],
    outlets: ['Reuters', 'AP', 'ČTK', 'BBC'],
    img: 'eu',
  },
  {
    title: 'Praha upravuje pravidla pro krátkodobé ubytování',
    lead: 'Shoda na datu účinnosti, rozpor v tom, kolika bytů se změna dotkne.',
    sources: 7,
    agreement: 76,
    conflict: false,
    clock: '10:29',
    topic: 'Domácí',
    entities: ['Praha'],
    outlets: ['iDNES', 'Seznam Zprávy', 'Pražský deník'],
    img: 'praha',
  },
  {
    title: 'Babiš vystoupil k výsledkům auditu evropských dotací',
    lead: 'Citace se v pěti zdrojích liší ve formulaci; jeden zdroj cituje pasáž, která v přepisu není.',
    sources: 11,
    agreement: 48,
    conflict: true,
    clock: '08:57',
    topic: 'Domácí',
    entities: ['Andrej Babiš', 'Evropská komise'],
    outlets: ['ČTK', 'Deník N', 'Blesk', 'Info.cz'],
    img: 'tiskovka',
  },
  {
    title: 'NATO potvrdilo termín cvičení ve Střední Evropě',
    lead: 'Vysoká shoda, primární zdroj dohledán a odkázán ve všech redakcích.',
    sources: 10,
    agreement: 91,
    conflict: false,
    clock: '06:20',
    topic: 'Zahraničí',
    entities: ['NATO', 'Ukrajina'],
    outlets: ['ČTK', 'Reuters', 'Aktuálně.cz'],
    img: 'nato',
  },
]

const IMG_CAPTIONS: Record<string, string> = {
  parlament: 'Jednání Poslanecké sněmovny o úpravě rozpočtu',
  cnb: 'Sídlo centrální banky v centru Prahy',
  munice: 'Sklad dělostřelecké munice připravené k odeslání',
  energetika: 'Přenosová soustava na severní Moravě',
  tiskovka: 'Tisková konference po jednání',
  praha: 'Historické centrum Prahy s krátkodobým ubytováním',
  eu: 'Vlajky členských států před institucemi v Bruselu',
  nato: 'Mnohonárodní vojenské cvičení',
}

const AUTHORS = [
  'Jana Křížová',
  'Martin Bláha',
  'Tereza Novotná',
  'Ondřej Sýkora',
  'Klára Vondráčková',
  'Pavel Hruška',
  'Lucie Marešová',
  'Adam Doležal',
]

const readingMinutes = (sources: number) => 2 + (sources % 4)

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

function Gauge({ pct, big }: { pct: number; big?: boolean }) {
  const on = Math.round(pct / 10)
  return (
    <span className={`gauge${big ? ' gauge--lg' : ''}`} role="img" aria-label={`Shoda zdrojů ${pct} procent`}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={i < on ? `is-on${pct < 65 ? ' is-bad' : ''}` : ''} />
      ))}
    </span>
  )
}

function SampleByline({ story, index, big }: { story: SampleStory; index: number; big?: boolean }) {
  return (
    <div className="byline">
      <span className="byline__who">{AUTHORS[index % AUTHORS.length]}</span>
      <span className="byline__sep">|</span>
      <span className="byline__time">{story.clock}</span>
      <span className="byline__sep">|</span>
      <span>{readingMinutes(story.sources)} min čtení</span>
      <span className="byline__sep">|</span>
      <span>
        <b>{story.sources}</b> zdrojů
      </span>
      <span className="byline__sep">|</span>
      <span className="byline__grp">
        shoda <b>{story.agreement} %</b>
        <Gauge pct={story.agreement} big={big} />
      </span>
      {story.conflict ? (
        <span className="chip chip--bad">rozpor</span>
      ) : (
        <span className="chip chip--ok">primární zdroj</span>
      )}
    </div>
  )
}

// ADR 0031: no image field exists in the data model (ADR 0004 keeps article content unstored),
// so this renders an aspect-ratio placeholder instead of e.html's actual <img> — that's the one
// deliberate deviation. The caption text itself is e.html's own literal two-line content
// (IMG_CAPTIONS + "Ilustrační snímek"), unchanged.
/** e.js only gives the LEAD image a figcaption (two spans: named caption + "Ilustrační snímek").
 *  Card/list thumbnails have no figcaption at all in the reference — just an `alt` attribute,
 *  which has no visual equivalent once the `<img>` itself is replaced by ADR 0031's placeholder,
 *  so thumbnails render silently (an aria-label carries the same text for accessibility). */
function FigPlaceholder({ img, thumb, caption }: { img: string; thumb?: boolean; caption?: boolean }) {
  return (
    <figure className={`fig${thumb ? ' fig--thumb' : ''}`}>
      <div className="fig__ph" aria-label={caption ? undefined : IMG_CAPTIONS[img]} />
      {caption && (
        <figcaption>
          <span>{IMG_CAPTIONS[img]}</span>
          <span>Ilustrační snímek</span>
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

function LeadArticle({ story }: { story: SampleStory }) {
  return (
    <article className="lead">
      <span className="kicker">
        {story.topic} · analýza {story.sources} zdrojů
      </span>
      <h1 className="lead__h">
        <a href="#" className="hl" onClick={(e) => e.preventDefault()}>
          {story.title}
        </a>
      </h1>
      <SampleByline story={story} index={0} big />
      <div className="lead__body">
        <a href="#" onClick={(e) => e.preventDefault()}>
          <FigPlaceholder img={story.img} caption />
        </a>
        <div>
          <p className="lead__perex">{story.lead}</p>
          <p className="story__meta" style={{ marginTop: '0.9rem' }}>
            Entity:{' '}
            {story.entities.map((ent, i) => (
              <span key={ent}>
                {i > 0 && ' · '}
                <a href="#" onClick={(e) => e.preventDefault()}>
                  {ent}
                </a>
              </span>
            ))}
          </p>
          <p className="story__meta" style={{ marginTop: '0.3rem' }}>
            Zdroje: {story.outlets.join(' · ')} a další
          </p>
          <p style={{ marginTop: '1rem' }}>
            <a href="#" className="kicker" onClick={(e) => e.preventDefault()}>
              Srovnání zdrojů →
            </a>
          </p>
        </div>
      </div>
    </article>
  )
}

function TwoCards({ stories }: { stories: SampleStory[] }) {
  return (
    <div className="cards">
      {stories.map((s, i) => (
        <article className="card" key={s.title}>
          <a href="#" onClick={(e) => e.preventDefault()}>
            <FigPlaceholder img={s.img} />
          </a>
          <span className="kicker kicker--ink">{s.topic}</span>
          <a href="#" onClick={(e) => e.preventDefault()}>
            <h3 className="card__h hl">{s.title}</h3>
          </a>
          <SampleByline story={s} index={i + 1} />
          <p className="card__p">{s.lead}</p>
        </article>
      ))}
    </div>
  )
}

function StoryListSection({ stories }: { stories: SampleStory[] }) {
  return (
    <section className="storylist">
      {stories.map((s, i) => (
        <article className="story" key={s.title}>
          <div>
            <span className="kicker kicker--ink">{s.topic}</span>
            <a href="#" onClick={(e) => e.preventDefault()}>
              <h3 className="hl">{s.title}</h3>
            </a>
            <SampleByline story={s} index={i + 3} />
            <p className="story__p">{s.lead}</p>
            <p className="story__meta">
              Entity:{' '}
              {s.entities.map((ent, j) => (
                <span key={ent}>
                  {j > 0 && ' · '}
                  <a href="#" onClick={(e) => e.preventDefault()}>
                    {ent}
                  </a>
                </span>
              ))}{' '}
              · Zdroje: {s.outlets.join(', ')}
            </p>
          </div>
          <a href="#" onClick={(e) => e.preventDefault()}>
            <FigPlaceholder img={s.img} thumb />
          </a>
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
              <Gauge pct={c.pct} />
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
  const [lead, ...restStories] = SAMPLE_STORIES
  const twoCards = restStories.slice(0, 2)
  const listStories = restStories.slice(2)

  return (
    <>
      <DayStatsBar />

      <main className="u-wrap">
        <div className="layout">
          <div>
            <LeadArticle story={lead} />

            <Sec title="Ve středu pozornosti" linkText="Vše z dneška" />
            <TwoCards stories={twoCards} />

            <Sec title="Další zprávy dne" linkText="Archiv" />
            <StoryListSection stories={listStories} />
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
