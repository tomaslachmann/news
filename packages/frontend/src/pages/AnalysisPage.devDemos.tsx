// Dev-only demo sections for /analysis/:id — no real data exists behind these yet. Each ships
// behind import.meta.env.DEV at its render site in AnalysisPage.tsx, never reachable in a
// production build, per the ticket's own "Mocked and dev-only" convention (already used for
// .trend/.qa elsewhere). Kept in their own file so AnalysisPage.tsx itself stays limited to real
// data paths.

const SAMPLE_QCMP_DEMO = [
  { who: 'ČTK', time: '14:02', q: 'Rozpočet počítá se saldem 241 miliard korun.', kind: 'tisková zpráva' },
  {
    who: 'Deník N',
    time: '14:31',
    q: 'Schodek státního rozpočtu má dosáhnout 241 miliard.',
    kind: 'vlastní formulace',
  },
  {
    who: 'iROZHLAS',
    time: '15:10',
    q: 'Vláda počítá se schodkem 241 miliard korun.',
    kind: 'parafráze tiskové zprávy',
  },
]

// TODO(grill): needs a fixed-cardinality, per-claim wording comparison from synthesis — not in
// AnalysisDimensions today (our contradiction items carry a variable-length attribution list, not
// exactly-N source wordings).
export function WordingDemoSection() {
  return (
    <section>
      <div className="sechead">
        <h2 className="sechead__t">Tři formulace téhož faktu (ukázka)</h2>
        <span className="sechead__rule" />
      </div>
      <div className="qcmp">
        {SAMPLE_QCMP_DEMO.map((w, i) => (
          <div className="qcmp__i" key={i}>
            <p className="qcmp__h">
              <span className="qcmp__w">{w.who}</span>
              <span className="qcmp__t">{w.time}</span>
            </p>
            <p className="qcmp__q">{w.q}</p>
            <span className="qcmp__k">{w.kind}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

const SAMPLE_VALS_DEMO = [
  { v: '241 mld. Kč', who: 'ČTK, Deník N, iROZHLAS' },
  { v: '235 mld. Kč', who: 'Seznam Zprávy, Novinky' },
  { v: '223 mld. Kč', who: 'Hospodářské noviny' },
]

// TODO(grill): needs discrete per-source value extraction from synthesis — our contradiction
// items are prose + attributions only, never structured values.
export function ValueVariantsDemoSection() {
  return (
    <section>
      <div className="sechead">
        <h2 className="sechead__t">Rozcházející se hodnoty (ukázka)</h2>
        <span className="sechead__rule" />
      </div>
      <ol className="compare">
        <li className="cmp">
          <p className="cmp__t">Výsledné saldo rozpočtu</p>
          <div className="cmp__m">
            <span>
              <b>7</b> z 9 zdrojů
            </span>
          </div>
          <div className="cmp__v">
            <ul className="vals">
              {SAMPLE_VALS_DEMO.map((v, i) => (
                <li key={i}>
                  <span className="vals__v">{v.v}</span>
                  <span className="vals__w">{v.who}</span>
                </li>
              ))}
            </ul>
          </div>
        </li>
      </ol>
    </section>
  )
}
