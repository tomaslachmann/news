;(function () {
  const $ = (id) => document.getElementById(id)
  const D = window.NT,
    S = D.stories,
    E = D.entities
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const cs = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()

  /* ── ukazatel shody ─────────────────────────────────────────────── */
  function gauge(pct, mod) {
    const on = Math.round(pct / 10)
    const tone = pct >= 85 ? '' : pct >= 65 ? ' is-mid' : ' is-bad'
    let out = ''
    for (let i = 0; i < 10; i++) out += `<i class="${i < on ? 'is-on' + tone : ''}"></i>`
    return `<span class="gauge${mod || ''}" role="img" aria-label="Shoda zdrojů ${pct} procent">${out}</span>`
  }
  function fillGauge(el, pct) {
    if (el) el.outerHTML = gauge(pct, el.classList.contains('gauge--lg') ? ' gauge--lg' : '')
  }
  fillGauge($('g62'), 62)
  fillGauge($('g94'), 94)
  fillGauge($('g62b'), 62)

  /* ── barevné vzorky ─────────────────────────────────────────────── */
  const surfaces = [
    ['--paper', 'Pozadí stránky', 'papír, na kterém vše leží'],
    ['--surface', 'Plocha', 'boxy, karty, vyvýšené prvky'],
    ['--surface-2', 'Plocha 2', 'patička, hover řádku, zebra'],
    ['--surface-3', 'Plocha 3', 'prázdné stavy, načítání'],
    ['--line-2', 'Linka jemná', 'vnitřní dělení seznamu'],
    ['--line', 'Linka běžná', 'rámy boxů, dělení sekcí'],
    ['--line-strong', 'Řez sekce', 'hlavní horizontální řez'],
  ]
  const texts = [
    ['--ink', 'Text hlavní', 'titulky a běžný text'],
    ['--ink-2', 'Text sekundární', 'perex, popisné odstavce'],
    ['--ink-3', 'Text metadat', 'časy, zdroje, popisky'],
    ['--ink-4', 'Text zakázaný', 'nedostupné prvky'],
  ]
  const semantic = [
    ['--accent', 'Akcent', 'čas, rozpor, aktivní rubrika, primární akce'],
    ['--accent-soft', 'Akcent tlumený', 'podklad kruhu entity, chybový box'],
    ['--ok', 'Shoda vysoká', '85–100 %, primární zdroj dohledán'],
    ['--mid', 'Shoda částečná', '65–84 %, zdroje se drobně liší'],
    ['--bad', 'Rozpor', 'pod 65 %, věcný rozpor mezi zdroji'],
  ]
  const swatch = (t, n, d, textMode) => `
    <div class="sw${textMode ? ' sw--text' : ''}">
      <div class="sw__p" ${textMode ? `style="color:var(${t})"` : `style="background:var(${t})"`}>${textMode ? 'Aa' : ''}</div>
      <div class="sw__b"><span class="sw__n">${n}</span><span class="sw__t">${d}</span><span class="sw__u">var(${t})</span></div>
    </div>`

  $('sgSurfaces').innerHTML =
    surfaces.map((s) => swatch(s[0], s[1], s[2], false)).join('') +
    texts.map((s) => swatch(s[0], s[1], s[2], true)).join('')
  $('sgSemantic').innerHTML = semantic.map((s) => swatch(s[0], s[1], s[2], false)).join('')

  /* ── typografická stupnice ──────────────────────────────────────── */
  const scale = [
    ['--text-mast', 'News Triangulator', 'značka', 'serif', 72],
    ['--text-h1', 'Vláda schválila úpravu rozpočtu', 'lead', 'serif', 60],
    ['--text-h2', 'ČEZ oznámil investici do přenosové sítě', 'titulek v seznamu', 'serif', 28],
    ['--text-h3', 'ČNB ponechala úrokové sazby bez změny', 'titulek karty', 'serif', 28],
    ['--text-h4', 'Tři redakce citují pasáž, která chybí', 'mezititulek, citace', 'serif', 20],
    ['--text-lead', 'Sedm redakcí popisuje stejný krok, rozcházejí se v čísle.', 'perex leadu', 'serif', 18],
    ['--text-body', 'Základní text článku a delších odstavců v obsahu.', 'běžný text', 'serif', 16],
    ['--text-small', 'Perex v seznamu zpráv a v pravém sloupci.', 'perex seznamu', 'serif', 16],
    ['--text-meta', 'Jana Křížová · 15:12 · 9 zdrojů · shoda 62 %', 'metadata, byline', 'sans', 0],
    ['--text-micro', 'EKONOMIKA · SLEDOVANÉ ZDROJE', 'nadrubriky, štítky', 'sans', 0],
  ]
  $('sgType').innerHTML = scale
    .map(([t, sample, use, fam, opsz]) => {
      const px = Math.round(parseFloat(getComputedStyle(document.body).fontSize) * 0) // jen pro čitelnost kódu
      return `<div class="ty">
      <span class="ty__n">${t}</span>
      <span class="ty__s" style="font-size:var(${t});${fam === 'sans' ? 'font-family:var(--font-sans);font-optical-sizing:none;' : `font-variation-settings:'opsz' ${opsz};`}">${esc(sample)}</span>
      <span class="ty__m">${use}</span>
    </div>`
    })
    .join('')

  // doplníme skutečně vypočtenou velikost v px
  document.querySelectorAll('.sgtype .ty').forEach((row) => {
    const s = row.querySelector('.ty__s')
    const m = row.querySelector('.ty__m')
    const px = Math.round(parseFloat(getComputedStyle(s).fontSize) * 10) / 10
    m.textContent = px + ' px · ' + m.textContent
  })

  /* ── stupnice mezer ─────────────────────────────────────────────── */
  const steps = ['--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6', '--sp-7', '--sp-8', '--sp-9']
  $('sgSpace').innerHTML = steps
    .map((t) => {
      const px = Math.round(parseFloat(cs(t)) * 16)
      return `<div class="sp"><span class="sp__n">${t}</span><span class="sp__b" style="inline-size:${px}px"></span><span class="sp__v">${px} px</span></div>`
    })
    .join('')

  /* ── entity ─────────────────────────────────────────────────────── */
  const max = Math.max(...E.map((e) => e.mentions)),
    min = Math.min(...E.map((e) => e.mentions))
  const size = (m, a, b) => a + Math.round(((m - min) / (max - min)) * (b - a))

  $('sgEnts').innerHTML = E.slice(0, 6)
    .map((e) => {
      const s = size(e.mentions, 26, 50)
      const cls = e.trend > 0 ? 'is-up' : e.trend < 0 ? 'is-down' : ''
      const tr = e.trend > 0 ? '+' + e.trend + ' %' : e.trend < 0 ? e.trend + ' %' : '0 %'
      return `<a class="erow" href="#" title="${esc(e.name)} — ${e.mentions} zmínek ve ${e.sources} zdrojích">
      <span class="erow__c"><span class="erow__dot" style="inline-size:${s}px;block-size:${s}px">${e.mentions}</span></span>
      <span><span class="erow__n hl">${esc(e.name)}</span><span class="erow__k">${e.kind} · ${e.sources} zdrojů</span></span>
      <span class="erow__t ${cls}">${tr}</span>
    </a>`
    })
    .join('')

  $('sgBand').innerHTML = E.slice(0, 6)
    .map((e) => {
      const s = size(e.mentions, 34, 76)
      return `<a class="entband__i" href="#" title="${esc(e.name)} — ${e.mentions} zmínek">
      <span class="erow__dot" style="inline-size:${s}px;block-size:${s}px;margin:0 auto">${e.mentions}</span>
      <span class="entband__n hl">${esc(e.name)}</span></a>`
    })
    .join('')

  /* ── byline generátor ───────────────────────────────────────────── */
  const authors = [
    'Jana Křížová',
    'Martin Bláha',
    'Tereza Novotná',
    'Ondřej Sýkora',
    'Klára Vondráčková',
    'Pavel Hruška',
  ]
  function byline(s, i) {
    return `<div class="byline">
      <span class="byline__who">${authors[i % authors.length]}</span><span class="byline__sep">|</span>
      <span class="byline__time u-num">${s.clock}</span><span class="byline__sep">|</span>
      <span><b>${s.sources}</b> zdrojů</span><span class="byline__sep">|</span>
      <span class="byline__grp">shoda <b>${s.agreement} %</b>${gauge(s.agreement)}</span>
      ${s.conflict ? '<span class="chip chip--bad">rozpor</span>' : '<span class="chip chip--ok">primární zdroj</span>'}
    </div>`
  }

  /* ── ukazatele: přehled rozsahů ─────────────────────────────────── */
  const rows = [
    [96, 'vysoká shoda'],
    [78, 'částečná shoda'],
    [62, 'rozpor'],
    [41, 'silný rozpor'],
  ]
  $('sgGauges').innerHTML =
    rows
      .map(
        ([p, l]) =>
          `<div class="sgrow"><span class="byline__grp u-sans" style="font-size:var(--text-meta);color:var(--ink-3)">shoda <b style="color:var(--ink)">${p} %</b>${gauge(p, ' gauge--lg')}</span><span class="note">${l}</span></div>`
      )
      .join('') +
    `<div class="sgrow" style="align-items:center">
      <span class="stack"><i class="s-ok" style="inline-size:62%"></i><i class="s-bad" style="inline-size:23%"></i><i class="s-non" style="inline-size:15%"></i></span>
      <span class="note"><b>skládaný pruh</b> — 62 % ve shodě · 23 % v rozporu · 15 % bez potvrzení</span>
    </div>`

  /* ── karty ──────────────────────────────────────────────────────── */
  $('sgCards').innerHTML = S.slice(1, 4)
    .map(
      (s, i) => `
    <article class="card">
      <a href="#"><figure class="fig"><img src="img/${s.img}.jpg" alt="" loading="lazy"></figure></a>
      <span class="kicker kicker--muted">${s.topic}</span>
      <a href="#"><h3 class="card__h hl">${esc(s.title)}</h3></a>
      <div>${byline(s, i + 1)}<p class="card__p">${esc(s.lead)}</p></div>
    </article>`
    )
    .join('')

  /* ── seznam ─────────────────────────────────────────────────────── */
  $('sgList').innerHTML = S.slice(3, 6)
    .map(
      (s, i) => `
    <article class="story">
      <div>
        <span class="kicker kicker--muted">${s.topic}</span>
        <a href="#"><h2 class="hl">${esc(s.title)}</h2></a>
        ${byline(s, i + 3)}
        <p class="story__p">${esc(s.lead)}</p>
        <p class="story__meta">Entity: ${s.entities.map((e) => `<a href="#">${esc(e)}</a>`).join(' · ')} &nbsp;·&nbsp; Zdroje: ${s.outlets.join(', ')}</p>
      </div>
      <a href="#"><figure class="fig fig--thumb"><img src="img/${s.img}-t.jpg" alt="" loading="lazy"></figure></a>
    </article>`
    )
    .join('')

  /* ── minutový servis a rozpory ──────────────────────────────────── */
  $('sgFeed').innerHTML = D.feed
    .slice(0, 5)
    .map(
      (f) => `
    <a class="minute" href="#">
      <span class="minute__t">${f.t}</span>
      <span><span class="minute__x hl">${esc(f.title)}</span><span class="minute__s"><span class="u-num">${f.src}</span> zdrojů${f.conflict ? ' · <span class="is-bad">rozpor</span>' : ''}</span></span>
    </a>`
    )
    .join('')

  $('sgConf').innerHTML = D.conflicts
    .slice(0, 3)
    .map(
      (c) => `
    <a href="#" style="display:block;padding:var(--sp-3) 0;border-top:1px solid var(--line-2)">
      <span class="minute__x hl">${esc(c.title)}</span>
      <span class="minute__s">${esc(c.detail)}</span>
      <span class="byline" style="margin:.35rem 0 0">shoda <b>${c.pct} %</b>${gauge(c.pct)}</span>
    </a>`
    )
    .join('')

  /* ── pás dne ────────────────────────────────────────────────────── */
  $('sgStats').innerHTML = D.ticker
    .map((t) => `<div class="stat${t.warn ? ' stat--warn' : ''}"><b>${t.v}</b>${t.k}</div>`)
    .join('')

  /* ── přepnutí režimu ────────────────────────────────────────────── */
  $('sgTheme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.dataset.theme = cur
      ? cur === 'dark'
        ? 'light'
        : 'dark'
      : sysDark
        ? 'light'
        : 'dark'
  })
})()

// ── 06 Komponenty stránek ───────────────────────────────────────────────────
// Ukázky se skládají ze stejných dat jako živé stránky, aby se přehled nemohl
// rozejít se skutečností.
;(function pages() {
  const U = window.NTUI
  const A = window.NT && window.NT.article
  const T = window.NT && window.NT.thread
  if (!U || !A || !T) return
  const esc = U.esc
  const set = (id, html) => {
    const n = document.getElementById(id)
    if (n) n.innerHTML = html
  }

  const col = (mod, title, items) =>
    `<div class="sumbox__col sumbox--${mod}">
      <p class="sumbox__t">${title}<span class="sumbox__n">${items.length}</span></p>
      <ul class="sumbox__l">${items.map((i) => `<li><span>${esc(i)}</span></li>`).join('')}</ul>
    </div>`
  const sum = document.getElementById('sgSum')
  if (sum) {
    // ticket 39: widened from 3 to 4 columns to carry all four Analysis Dimensions — the
    // reference's own third column ("Nepotvrzeno"/open questions) had no data behind it and is
    // repurposed here for uniqueReporting instead of dropped outright; framing is new, --mid.
    sum.className = 'sumbox'
    sum.innerHTML =
      col('agree', 'Zdroje se shodují', A.summary.agree) +
      col('differ', 'Zdroje se rozcházejí', A.summary.differ) +
      col('open', 'Unikátní zprávy', A.summary.open) +
      col('framing', 'Framing', A.summary.framing)
  }

  // Marginálie ve všech třech stavech.
  set(
    'sgClaims',
    [A.claims[0], A.claims[3], A.claims[2]]
      .map((c) => {
        const st = U.state(c.pct)
        const lbl =
          st.key === 'ok'
            ? 'Tvrzení potvrzeno'
            : st.key === 'mid'
              ? 'Tvrzení částečně potvrzeno'
              : 'Tvrzení v rozporu'
        return `<div class="claim claim--${st.key}">
          <span class="claim__l">${lbl} — shoda ${c.pct} %</span>
          <p class="claim__t">„${esc(c.t)}“</p>
          <p class="claim__d">${esc(c.note)}</p>
        </div>`
      })
      .join('')
  )

  // Srovnání tvrzení — dva řádky, z toho jeden s rozcházejícími se hodnotami.
  set(
    'sgCmp',
    [A.claims[0], A.claims[2]]
      .map((c) => {
        const vals = c.values
          ? `<div class="cmp__v"><ul class="vals">${c.values
              .map(
                (v) =>
                  `<li><span class="vals__v">${esc(v.v)}</span><span class="vals__w">${esc(v.who)}</span></li>`
              )
              .join('')}</ul></div>`
          : ''
        return `<li class="cmp">
          <p class="cmp__t">${esc(c.t)}</p>
          <div class="cmp__m">
            <span><b>${c.n}</b> z ${U.src(c.of)}</span>
            ${U.gaugeWith(c.pct, 'sm')}
            ${U.chip(c.pct, c.chip)}
          </div>
          <p class="cmp__n">${esc(c.note)}</p>
          ${vals}
        </li>`
      })
      .join('')
  )

  const q = document.getElementById('sgQcmp')
  if (q) {
    q.className = 'qcmp'
    q.innerHTML = A.wording.items
      .map(
        (w) => `<div class="qcmp__i">
          <p class="qcmp__h"><span class="qcmp__w">${esc(w.who)}</span><span class="qcmp__t">${esc(w.time)}</span></p>
          <p class="qcmp__q">${esc(w.q)}</p>
          <span class="qcmp__k">${esc(w.kind)}</span>
        </div>`
      )
      .join('')
  }

  set(
    'sgSrc',
    A.srclist
      .slice(0, 4)
      .map(
        (s) => `<li class="srcrow">
          <span class="srcrow__w">${esc(s.who)}${s.first ? '<span class="chip chip--solid">první</span>' : ''}</span>
          <span class="srcrow__t">${esc(s.time)}</span>
          <span class="srcrow__b">${U.gauge(s.pct, 'sm')}<b>${s.pct} %</b><span class="srcrow__r">${esc(s.role)}</span></span>
        </li>`
      )
      .join('')
  )

  const d = T.timeline[0]
  set(
    'sgTl',
    `<h3 class="tl__day">${esc(d.day)}<span>${U.rec(d.items.length)}</span></h3>` +
      d.items
        .slice(0, 2)
        .map(
          (i) => `<div class="tl__i${i.mark ? ' tl__i--mark' : ''}${i.current ? ' is-current' : ''}">
            <span class="tl__t">${esc(i.t)}</span>
            <div>
              <p class="tl__h">${esc(i.title)}</p>
              <p class="tl__w">${esc(i.what)}</p>
              <p class="byline tl__b">
                <span class="byline__grp"><b>${i.src}</b> ${U.src(i.src).replace(/^\d+\s/, '')}</span>
                <span class="byline__sep">·</span>
                ${U.gaugeWith(i.pct, 'sm')}
                ${U.chip(i.pct)}
                ${i.mark ? `<span class="chip chip--solid">${esc(i.mark)}</span>` : ''}
              </p>
            </div>
          </div>`
        )
        .join('')
  )

  set(
    'sgTab',
    `<thead><tr><th>Redakce</th><th>Kdy</th><th>Titulek</th><th>Shoda</th></tr></thead><tbody>` +
      T.all
        .slice(0, 4)
        .map(
          (r) => `<tr>
            <td class="artable__who">${esc(r.who)}</td>
            <td class="artable__d">${esc(r.d)} ${esc(r.t)}</td>
            <td class="artable__t">${esc(r.title)}</td>
            <td class="artable__m"><b>${r.pct} %</b>${U.chip(r.pct)}</td>
          </tr>`
        )
        .join('') +
      '</tbody>'
  )
})()

// ── 07 Interní obrazovky ───────────────────────────────────────────────────
;(function () {
  const A = window.NT && window.NT.admin
  if (!A || !window.NTAdmin) return
  const q = (id) => document.getElementById(id)

  if (q('sgBar')) {
    q('sgBar').innerHTML = `<div class="u-wrap abar__in">
      <a class="abar__brand" href="#">Trian<em>gulátor</em></a>
      <span class="abar__tag">Interní</span>
      <nav class="abar__nav" aria-label="Ukázka">
        <a href="#" aria-current="page">Kontrola sběru<b class="u-num">14</b></a>
        <a href="#">Výběr zdrojů</a>
        <a href="#">Uživatelé</a>
        <a href="#">Veřejný web</a>
      </nav>
      <span class="abar__side">
        <span class="abar__who">${NTUI.esc(A.me.email)}</span>
        <span class="pill pill--admin">Admin</span>
        <a href="#">Odhlásit</a>
      </span>
    </div>`
  }
  if (q('sgAStats')) NTAdmin.stats(q('sgAStats'), A.stats.slice(0, 4))
  if (q('sgQ')) NTAdmin.drafts(q('sgQ'), A.drafts.slice(0, 2))
  if (q('sgQR')) NTAdmin.relations(q('sgQR'), A.relations.slice(0, 2))
  if (q('sgU')) NTAdmin.users(q('sgU'), A.users.slice(0, 3))
  if (q('sgP'))
    NTAdmin.pick(q('sgP'), {
      candidates: A.review.candidates.slice(0, 2).concat(A.review.candidates.slice(6, 7)),
      custom: [],
    })
})()
