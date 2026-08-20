// ============================================================================
// News Triangulator — sdílené vykreslovací pomůcky
// Jediné místo, kde je zapsán výklad míry shody. Hranice 85 / 65 existují
// v kódu právě jednou; v Reactu z toho bude jedna funkce, ne rozeseté podmínky.
// ============================================================================

window.NTUI = (function () {
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  // České skloňování po číslu: 1 / 2–4 / 5 a více.
  function pl(n, forms) {
    const i = n === 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2
    return n + ' ' + forms[i]
  }
  const src = (n) => pl(n, ['zdroj', 'zdroje', 'zdrojů'])
  const art = (n) => pl(n, ['článek', 'články', 'článků'])
  const rec = (n) => pl(n, ['záznam', 'záznamy', 'záznamů'])

  // Výklad procenta shody. Vrací token, slovo do UI a delší popis.
  function state(pct) {
    if (pct >= 85) return { key: 'ok', word: 'vysoká shoda', chip: 'potvrzeno' }
    if (pct >= 65) return { key: 'mid', word: 'částečná shoda', chip: 'částečná shoda' }
    return { key: 'bad', word: 'rozpor', chip: 'rozpor' }
  }

  // Ukazatel shody. Nikdy nestojí bez číselné hodnoty — proto ho skládáme
  // společně s číslem v gaugeWith().
  function gauge(pct, mod) {
    const s = state(pct)
    const on = Math.max(1, Math.round(pct / 10))
    const extra = s.key === 'ok' ? '' : ' is-' + s.key
    let h = `<span class="gauge${mod ? ' gauge--' + mod : ''}" role="img" aria-label="shoda ${pct} procent, ${s.word}">`
    for (let i = 0; i < 10; i++) h += `<i class="${i < on ? 'is-on' + extra : ''}"></i>`
    return h + '</span>'
  }

  // Číslo a ukazatel jako jeden nezlomitelný celek.
  function gaugeWith(pct, mod) {
    return `<span class="byline__grp">shoda <b>${pct} %</b>${gauge(pct, mod)}</span>`
  }

  function chip(pct, text) {
    const s = state(pct)
    return `<span class="chip chip--${s.key}">${esc(text || s.chip)}</span>`
  }

  // Kruh entity: průměr proporční počtu zmínek, číslo vždy uvnitř.
  function dot(mentions, max, lo, hi) {
    const a = lo || 26,
      b = hi || 88
    const d = Math.round(a + (Math.min(mentions, max) / max) * (b - a))
    return `<span class="erow__dot" style="inline-size:${d}px;block-size:${d}px" title="${mentions} zmínek za 24 hodin">${mentions}</span>`
  }

  function entRows(list, max, lo, hi) {
    return list
      .map(
        (e) => `<a class="erow" href="#">
          <span class="erow__c">${dot(e.mentions, max || 180, lo, hi)}</span>
          <span>
            <span class="erow__n">${esc(e.name)}</span>
            <span class="erow__k">${esc(e.kind)} · ${src(e.src)}</span>
          </span>
          <span class="erow__t">${e.mentions} zmínek</span>
        </a>`
      )
      .join('')
  }

  return { esc, pl, src, art, rec, state, gauge, gaugeWith, chip, dot, entRows }
})()
