// ============================================================================
// Interní obrazovky — společný aparát a vykreslování front.
// Admin je zázemí redakce, ne druhý produkt: stejné tokeny a typografie,
// jen hustší sazba, bez fotografií a bez marketingového rámce.
// Rozhraní nikdy nepředstírá, že rozhodl nástroj — u každé fronty stojí,
// odkud položka přišla a co se stane po schválení.
// ============================================================================

window.NTAdmin = (function () {
  const A = window.NT.admin
  const esc = window.NTUI.esc

  const NAV = [
    { href: 'admin-review.html', label: 'Kontrola sběru', n: 14, key: 'review' },
    { href: 'admin-sources.html', label: 'Výběr zdrojů', key: 'sources' },
    { href: 'admin-users.html', label: 'Uživatelé', key: 'users' },
    { href: 'e.html', label: 'Veřejný web', key: '_' },
  ]

  function theme() {
    const p = new URLSearchParams(location.search).get('theme')
    return p === 'dark' || p === 'light' ? p : null
  }

  function mount(opts) {
    const o = opts || {}
    const t = theme()
    if (t) document.documentElement.dataset.theme = t
    const q = t ? '?theme=' + t : ''
    const other = t === 'dark' ? 'light' : 'dark'

    document.querySelectorAll('[data-keep-theme]').forEach((a) => {
      const href = a.getAttribute('href')
      if (t && href && href.indexOf('?') === -1) a.setAttribute('href', href + q)
    })

    const bar = document.getElementById('ntBar')
    if (bar) {
      bar.innerHTML = `<div class="u-wrap abar__in">
        <a class="abar__brand" href="e.html${q}">Trian<em>gulátor</em></a>
        <span class="abar__tag">Interní</span>
        <nav class="abar__nav" aria-label="Interní sekce">
          ${NAV.map(
            (i) =>
              `<a href="${i.href}${q}"${i.key === o.page ? ' aria-current="page"' : ''}>${i.label}${
                i.n ? `<b class="u-num">${i.n}</b>` : ''
              }</a>`
          ).join('')}
        </nav>
        <span class="abar__side">
          <span class="abar__who">${esc(A.me.email)}</span>
          <span class="pill pill--admin">${A.me.role === 'ADMIN' ? 'Admin' : 'Pouze pro čtení'}</span>
          <a href="?theme=${other}">${other === 'dark' ? 'Tmavý' : 'Světlý'} režim</a>
          <a href="login.html${q}">Odhlásit</a>
        </span>
      </div>`
    }

    const foot = document.getElementById('ntFoot')
    if (foot) {
      foot.innerHTML = `<div class="u-wrap">
        <div class="foot__bottom">
          <span>© 2026 News Triangulator — interní rozhraní</span>
          <span>Ukázková data pro účely návrhu</span>
          <span>Poslední sběr článků: ${esc(A.run.at)}</span>
        </div>
      </div>`
    }
  }

  // ── číselný pás ───────────────────────────────────────────────────────────
  function stats(el, list) {
    el.innerHTML =
      '<div class="u-wrap astats__in daystats__in u-scroll-x">' +
      list
        .map(
          (s) =>
            `<div class="stat${s.warn ? ' stat--warn' : ''}"><b class="u-num">${esc(s.v)}</b>${esc(
              s.k
            )}</div>`
        )
        .join('') +
      '</div>'
  }

  // ── fronta 1: koncepty ────────────────────────────────────────────────────
  function drafts(el, list) {
    el.innerHTML = list
      .map(
        (d) => `<article class="qitem${d.thin ? ' qitem--flag' : ''}">
        <div class="qitem__k">
          <span>Koncept</span>
          <span class="pill">${window.NTUI.src(d.sources)}</span>
          ${d.thin ? '<span class="chip chip--mid">málo zdrojů</span>' : ''}
        </div>
        <h3 class="qitem__t"><a href="admin-sources.html" data-keep-theme>${esc(d.title)}</a></h3>
        <p class="qitem__m">
          <span>Vytvořeno ${esc(d.created)}</span><span aria-hidden="true">·</span>
          <span>první zdroj <b>${esc(d.first)}</b></span><span aria-hidden="true">·</span>
          <span class="u-mono">${esc(d.id)}</span>
        </p>
        <p class="qitem__why"><span>Poznámka nástroje</span>${esc(d.note)}</p>
        <div class="qitem__act">
          <a class="btn btn--strong" href="admin-sources.html" data-keep-theme>Schválit</a>
          <button class="btn" type="button">Zamítnout</button>
        </div>
      </article>`
      )
      .join('')
  }

  // ── fronta 2: možná doplnění ──────────────────────────────────────────────
  function additions(el, list) {
    el.innerHTML = list
      .map(
        (a) => `<article class="qitem">
        <div class="qitem__k"><span>Nové pokrytí</span><span class="pill">${esc(a.who)}</span></div>
        <h3 class="qitem__t">${esc(a.title)}</h3>
        <p class="qitem__m">
          <span>Vyšlo ${esc(a.published)}</span><span aria-hidden="true">·</span>
          <span>k článku <a href="article.html" data-keep-theme>${esc(a.to)}</a></span>
        </p>
        <p class="qitem__u">${esc(a.url)}</p>
        <div class="qitem__act">
          <a class="btn" href="article.html" data-keep-theme>Otevřít článek</a>
          <button class="btn btn--strong" type="button">Schválit</button>
          <button class="btn" type="button">Zamítnout</button>
        </div>
      </article>`
      )
      .join('')
  }

  // ── fronta 3: vztahy mezi událostmi ───────────────────────────────────────
  function relations(el, list) {
    el.innerHTML = list
      .map(
        (r) => `<article class="qitem${r.weak ? ' qitem--flag' : ''}">
        <div class="qitem__k">
          <span>${r.type === 'FOLLOW_UP' ? 'Pokračování' : 'Souvislost'}</span>
          <span class="chip ${r.weak ? 'chip--mid' : ''}">${r.weak ? 'nižší jistota' : 'vyšší jistota'}</span>
        </div>
        <div class="pair">
          <div class="pair__r"><span class="pair__a">Z</span><span>${esc(r.from)}</span></div>
          <div class="pair__r"><span class="pair__a">Na</span><span>${esc(r.to)}</span></div>
        </div>
        <p class="qitem__why"><span>Zdůvodnění nástroje</span>${esc(r.why)}</p>
        <p class="qitem__m"><span>Navrženo ${esc(r.created)}</span><span aria-hidden="true">·</span><span class="u-mono">${esc(
          r.id
        )}</span></p>
        <div class="qitem__act">
          <button class="btn btn--strong" type="button">Schválit</button>
          <button class="btn" type="button">Zamítnout</button>
        </div>
      </article>`
      )
      .join('')
  }

  // ── uživatelé ─────────────────────────────────────────────────────────────
  function users(el, list) {
    el.innerHTML = list
      .map(
        (u) => `<tr${u.self ? ' class="is-self"' : ''}>
        <td>${esc(u.email)}${u.self ? '<span class="dtable__self">to jste vy</span>' : ''}</td>
        <td data-l="Role"><span class="pill${u.role === 'ADMIN' ? ' pill--admin' : ''}">${
          u.role === 'ADMIN' ? 'Admin' : 'Pouze pro čtení'
        }</span></td>
        <td class="dtable__d" data-l="Vytvořeno">${esc(u.created)}</td>
        <td class="dtable__act">${
          u.self
            ? '<button class="btn" type="button" disabled title="Svůj vlastní účet zde nemůžete upravit">Upravit</button><button class="btn" type="button" disabled title="Svůj vlastní účet nemůžete smazat">Smazat</button>'
            : '<button class="btn" type="button">Upravit</button><button class="btn" type="button">Smazat</button>'
        }</td>
      </tr>`
      )
      .join('')
  }

  // ── krok výběru zdrojů ────────────────────────────────────────────────────
  function pick(el, r) {
    const rows = r.candidates
      .map(
        (c) => `<div class="pick__i${c.on ? '' : ' is-off'}${c.state === 'fail' ? ' pick__i--fail' : ''}">
        <span class="pick__c"><input type="checkbox"${c.on ? ' checked' : ''} aria-label="Zahrnout zdroj ${esc(
          c.who
        )}"></span>
        <span class="pick__w">
          <span>${esc(c.who)}</span>
          ${c.seed ? '<span class="pill">výchozí zdroj</span>' : ''}
          ${c.state === 'fail' ? '<span class="chip chip--bad">extrakce selhala</span>' : ''}
        </span>
        <h3 class="pick__t">${esc(c.title)}</h3>
        <span class="pick__x">${esc(c.published)}</span>
        <p class="pick__u">${esc(c.url)}</p>
        ${c.note ? `<p class="pick__n">${esc(c.note)}</p>` : ''}
        ${
          c.state === 'fail'
            ? `<div class="pick__paste">
                 <label class="field__l" for="pt-${c.id}">Vložit text článku ručně</label>
                 <textarea class="input" id="pt-${c.id}" placeholder="Sem vložte text článku…"></textarea>
                 <span><button class="btn" type="button">Uložit text</button></span>
               </div>`
            : ''
        }
      </div>`
      )
      .join('')

    const custom = r.custom
      .map(
        (u) => `<div class="pick__i">
        <span class="pick__c"><input type="checkbox" checked aria-label="Zahrnout vlastní odkaz"></span>
        <span class="pick__w"><span>Vlastní odkaz</span></span>
        <h3 class="pick__t">Doplněno redakcí</h3>
        <p class="pick__u">${esc(u)}</p>
      </div>`
      )
      .join('')

    el.innerHTML = rows + custom
  }

  return { mount, stats, drafts, additions, relations, users, pick }
})()
