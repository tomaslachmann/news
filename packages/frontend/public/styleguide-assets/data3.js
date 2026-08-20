// ============================================================================
// Ukázková data pro detail zprávy a vlákno tématu.
// Slouží jen k předvedení designu — čísla i formulace jsou vymyšlené,
// zároveň ale mají tvar, jaký bude mít skutečné rozhraní.
// ============================================================================

window.NT = window.NT || {}

window.NT.article = {
  id: 'uprava-rozpoctu-saldo',
  rubric: 'Ekonomika',
  kicker: 'Rozpočet · analýza 9 zdrojů',
  title: 'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu',
  perex:
    'Sedm z devíti sledovaných redakcí popisuje stejný krok vlády, rozcházejí se ale ' +
    've výsledném saldu. Nejnižší a nejvyšší udávané číslo se liší o 18 miliard korun.',
  author: 'Jana Křížová',
  authorRole: 'redakce triangulace',
  published: 'dnes 15:12',
  updated: 'dnes 16:48',
  readMin: 4,
  sources: 9,
  agreement: 62,
  state: 'bad',
  img: 'parlament',
  caption: 'Jednání Poslanecké sněmovny o úpravě rozpočtu',
  credit: 'Ilustrační snímek',

  // Co lze o zprávě říct napříč zdroji. Tři kategorie, nikdy jen dvě —
  // „nepotvrzené“ je stejně důležité jako „shoda“ a „rozpor“.
  summary: {
    agree: [
      'Vláda návrh schválila na jednání ve středu odpoledne.',
      'Úprava mění výdajové stropy tří resortů.',
      'Novela půjde do Sněmovny v prvním čtení do konce srpna.',
    ],
    differ: [
      'Výsledné saldo rozpočtu — udávané hodnoty se liší o 18 mld. Kč.',
      'Termín, od kdy má úprava platit: dva zdroje uvádějí září, pět říjen.',
    ],
    open: ['Dopad na rozpočty krajů. Tři zdroje ho zmiňují, primární doklad se nepodařilo dohledat.'],
    // ticket 39: 4. sloupec přidaný nad rámec reference — nese Framing dimenzi (ADR 0012 / čtyři
    // dimenze analýzy), barva --mid, žádný nový akcent.
    framing: ['Tři redakce vedou zprávu jako „škrty“, dvě jako „úpravu stropů“ — stejná čísla, jiný rámec.'],
  },

  // Tvrzení po jednom. Toto je jádro produktu: nikoli „článek je pravdivý“,
  // ale „která věta má kolik opory“.
  claims: [
    {
      t: 'Vláda návrh úpravy rozpočtu schválila ve středu odpoledne.',
      n: 9,
      of: 9,
      pct: 100,
      state: 'ok',
      note: 'Shodné znění napříč všemi zdroji, tři přebírají formulaci z tiskové zprávy.',
    },
    {
      t: 'Úprava mění výdajové stropy ministerstev práce, dopravy a zdravotnictví.',
      n: 8,
      of: 9,
      pct: 91,
      state: 'ok',
      note: 'Jeden zdroj uvádí čtyři resorty, navíc školství.',
    },
    {
      t: 'Výsledné saldo rozpočtu má být 241 miliard korun.',
      n: 7,
      of: 9,
      pct: 62,
      state: 'bad',
      note: 'Hodnoty se rozcházejí v rozsahu 223 až 241 mld. Kč. Nejnižší číslo pochází z vlastního propočtu redakce, nejvyšší z tiskové zprávy ministerstva.',
      values: [
        { v: '241 mld. Kč', who: 'ČTK, iRozhlas, Seznam Zprávy' },
        { v: '235 mld. Kč', who: 'Novinky, iDNES' },
        { v: '223 mld. Kč', who: 'Deník N, Hospodářské noviny' },
      ],
    },
    {
      t: 'Opozice podá návrh na svolání mimořádné schůze Sněmovny.',
      n: 5,
      of: 9,
      pct: 74,
      state: 'mid',
      note: 'Dva zdroje mluví o zvažovaném návrhu, tři o rozhodnutém.',
    },
    {
      t: 'Úprava dopadne i na rozpočty krajů.',
      n: 3,
      of: 9,
      pct: 41,
      state: 'bad',
      chip: 'nepotvrzeno',
      note: 'Primární zdroj nedohledán. Všechny tři zmínky odkazují na stejné nejmenované sdělení.',
    },
  ],

  // Tři formulace téhož faktu. Ukazuje, že rozdíl nemusí být ve čísle,
  // ale v tom, jak se o čísle mluví.
  wording: {
    fact: 'Výše salda',
    items: [
      {
        who: 'ČTK',
        time: '15:02',
        q: 'Vláda schválila úpravu rozpočtu se saldem 241 miliard korun.',
        kind: 'agenturní zpráva',
      },
      {
        who: 'Novinky',
        time: '15:17',
        q: 'Saldo by mělo dosáhnout přibližně 235 miliard korun.',
        kind: 'přebírá a upravuje',
      },
      {
        who: 'Deník N',
        time: '15:41',
        q: 'Podle propočtu redakce vychází saldo na 223 miliard; vláda pracuje s vyšším číslem.',
        kind: 'vlastní zjištění',
      },
    ],
  },

  // Kdo, kdy, s jakou mírou shody a v jaké roli.
  srclist: [
    { who: 'ČTK', time: '15:02', pct: 96, role: 'primární zdroj', first: true },
    { who: 'iRozhlas', time: '15:08', pct: 94, role: 'přebírá' },
    { who: 'Seznam Zprávy', time: '15:12', pct: 91, role: 'přebírá a doplňuje' },
    { who: 'Novinky', time: '15:17', pct: 78, role: 'přebírá a upravuje' },
    { who: 'iDNES', time: '15:24', pct: 76, role: 'přebírá a upravuje' },
    { who: 'Deník N', time: '15:41', pct: 54, role: 'vlastní zjištění' },
    { who: 'Hospodářské noviny', time: '16:03', pct: 51, role: 'vlastní zjištění' },
    { who: 'E15', time: '16:20', pct: 72, role: 'přebírá' },
    { who: 'Aktuálně.cz', time: '16:35', pct: 69, role: 'přebírá' },
  ],

  entities: [
    { name: 'Ministerstvo financí', kind: 'instituce', mentions: 54, src: 9 },
    { name: 'Petr Fiala', kind: 'osoba', mentions: 148, src: 6 },
    { name: 'ODS', kind: 'strana', mentions: 38, src: 5 },
    { name: 'Andrej Babiš', kind: 'osoba', mentions: 176, src: 4 },
  ],

  quote: {
    q: 'Se saldem 241 miliard pracujeme jako s horní hranicí, ne jako s odhadem.',
    cite: 'z tiskové konference ministerstva financí, 15:40',
  },

  related: [
    {
      title: 'ČNB ponechala úrokové sazby bez změny',
      rubric: 'Ekonomika',
      img: 'cnb',
      src: 12,
      pct: 94,
      state: 'ok',
      time: '14:41',
    },
    {
      title: 'Sněmovní výbor odložil hlasování o veřejných zakázkách',
      rubric: 'Domácí',
      img: 'tiskovka',
      src: 3,
      pct: 88,
      state: 'ok',
      time: '15:11',
    },
    {
      title: 'ČEZ oznámil investici do přenosové sítě na severní Moravě',
      rubric: 'Energetika',
      img: 'energetika',
      src: 6,
      pct: 71,
      state: 'mid',
      time: '13:18',
    },
  ],
}

window.NT.thread = {
  id: 'saldo-rozpoctu',
  title: 'Úprava rozpočtu a spor o saldo',
  perex:
    'Vlákno sleduje jediný údaj — výsledné saldo státního rozpočtu po srpnové úpravě — ' +
    'a to, jak se za šest dní měnil napříč devatenácti redakcemi. Rozptyl udávaných ' +
    'hodnot se zúžil z 52 na 18 miliard korun, shodu se ale zatím nepodařilo uzavřít.',
  opened: '13. srpna 2026',
  updated: 'dnes 16:48',
  days: 6,
  articles: 34,
  sources: 19,
  agreement: 68,
  conflicts: 5,

  stats: [
    { k: 'Otevřeno', v: '13. 8.' },
    { k: 'Článků ve vlákně', v: '34' },
    { k: 'Zdrojů', v: '19' },
    { k: 'Průměrná shoda', v: '68 %' },
    { k: 'Otevřené rozpory', v: '2', warn: true },
    { k: 'Poslední změna', v: '16:48' },
  ],

  // Vývoj sledovaného čísla. Pro každý den rozsah udávaných hodnot a medián.
  trend: {
    unit: 'mld. Kč',
    label: 'Saldo rozpočtu podle jednotlivých zdrojů',
    min: 200,
    max: 270,
    points: [
      { d: '13. 8.', lo: 210, hi: 262, med: 240, n: 4 },
      { d: '14. 8.', lo: 214, hi: 258, med: 238, n: 7 },
      { d: '15. 8.', lo: 220, hi: 250, med: 236, n: 9 },
      { d: '16. 8.', lo: 221, hi: 246, med: 235, n: 12 },
      { d: '17. 8.', lo: 223, hi: 241, med: 235, n: 15 },
      { d: '18. 8.', lo: 223, hi: 241, med: 238, n: 9 },
    ],
    note:
      'Svislá úsečka je rozsah hodnot udávaných v daný den, značka medián. ' +
      'Do 15. srpna se rozptyl zúžil hlavně tím, že tři zdroje opravily původní údaj.',
  },

  // Chronologie. Nejnovější první, přepínatelné.
  timeline: [
    {
      day: 'dnes · 18. srpna',
      items: [
        {
          t: '16:48',
          title: 'Ministerstvo financí zpřesnilo odhad salda na 241 mld. Kč',
          what: 'První oficiální číslo z primárního zdroje. Dvě redakce svůj údaj do hodiny opravily.',
          src: 4,
          pct: 88,
          state: 'ok',
          mark: 'zlom',
        },
        {
          t: '15:41',
          title: 'Deník N publikoval vlastní propočet se saldem 223 mld. Kč',
          what: 'Rozdíl 18 mld. Kč proti agenturnímu údaji. Redakce uvádí metodiku propočtu.',
          src: 1,
          pct: 54,
          state: 'bad',
        },
        {
          t: '15:12',
          title: 'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu',
          what: 'Hlavní zpráva dne, devět zdrojů. Saldo uvádí sedm z nich, ve třech různých hodnotách.',
          src: 9,
          pct: 62,
          state: 'bad',
          current: true,
        },
      ],
    },
    {
      day: '17. srpna',
      items: [
        {
          t: '18:20',
          title: 'Patnáct zdrojů uvedlo saldo v rozsahu 223 až 241 mld. Kč',
          what: 'Rozptyl poprvé pod 20 mld. Kč. Krajní hodnoty už nikdo neopakuje.',
          src: 15,
          pct: 71,
          state: 'mid',
        },
        {
          t: '11:05',
          title: 'Opozice svolala tiskovou konferenci ke skrytému deficitu',
          what: 'Nová formulace „skrytý deficit“, kterou přebírá šest redakcí bez uvedení zdroje výpočtu.',
          src: 6,
          pct: 64,
          state: 'bad',
        },
      ],
    },
    {
      day: '16. srpna',
      items: [
        {
          t: '14:32',
          title: 'Tři zdroje opravily původní údaj o saldu',
          what: 'Opravy bez viditelné poznámky o změně. Zaznamenali jsme rozdíl proti své předchozí verzi.',
          src: 3,
          pct: 82,
          state: 'ok',
          mark: 'oprava',
        },
        {
          t: '09:14',
          title: 'Ministerstvo odmítlo komentovat konkrétní číslo',
          what: 'Primární zdroj mlčí, sedm zdrojů proto dál pracuje s odhadem.',
          src: 7,
          pct: 60,
          state: 'bad',
        },
      ],
    },
    {
      day: '15. srpna',
      items: [
        {
          t: '16:55',
          title: 'Devět zdrojů uvádí saldo, rozptyl 30 mld. Kč',
          what: 'Poprvé se objevuje hodnota 236 mld. Kč, která se později stane mediánem.',
          src: 9,
          pct: 58,
          state: 'bad',
        },
      ],
    },
    {
      day: '14. srpna',
      items: [
        {
          t: '13:40',
          title: 'Hospodářské noviny zpochybnily metodiku výpočtu',
          what: 'První text, který popisuje, proč se čísla rozcházejí. Rozpor je od té chvíle sledovatelný.',
          src: 1,
          pct: 49,
          state: 'bad',
          mark: 'zlom',
        },
        {
          t: '08:12',
          title: 'Sedm zdrojů převzalo agenturní údaj bez ověření',
          what: 'Shodná formulace ve všech sedmi textech, jediný původ.',
          src: 7,
          pct: 92,
          state: 'ok',
        },
      ],
    },
    {
      day: '13. srpna',
      items: [
        {
          t: '17:30',
          title: 'První zmínka o úpravě rozpočtu, čtyři zdroje',
          what: 'Vlákno otevřeno. Rozsah udávaných hodnot 210 až 262 mld. Kč.',
          src: 4,
          pct: 44,
          state: 'bad',
          mark: 'otevřeno',
        },
      ],
    },
  ],

  open: [
    {
      q: 'Z jaké metodiky vychází číslo 223 mld. Kč?',
      detail: 'Deník N popisuje propočet, ministerstvo ho nepotvrdilo ani nevyvrátilo.',
    },
    {
      q: 'Kdo první použil formulaci „skrytý deficit“?',
      detail: 'Šest zdrojů ji uvádí bez atribuce, primární výskyt se nepodařilo dohledat.',
    },
  ],

  srclist: [
    { who: 'ČTK', n: 6, pct: 93, role: 'primární zdroj' },
    { who: 'Seznam Zprávy', n: 5, pct: 84, role: 'přebírá a doplňuje' },
    { who: 'iRozhlas', n: 4, pct: 88, role: 'přebírá' },
    { who: 'Deník N', n: 4, pct: 57, role: 'vlastní zjištění' },
    { who: 'Hospodářské noviny', n: 3, pct: 52, role: 'vlastní zjištění' },
    { who: 'Novinky', n: 3, pct: 74, role: 'přebírá a upravuje' },
    { who: 'iDNES', n: 3, pct: 72, role: 'přebírá a upravuje' },
    { who: 'E15', n: 2, pct: 70, role: 'přebírá' },
    { who: 'Aktuálně.cz', n: 2, pct: 68, role: 'přebírá' },
    { who: 'Info.cz', n: 2, pct: 61, role: 'přebírá' },
  ],

  entities: [
    { name: 'Ministerstvo financí', kind: 'instituce', mentions: 54, src: 17 },
    { name: 'Petr Fiala', kind: 'osoba', mentions: 148, src: 12 },
    { name: 'Andrej Babiš', kind: 'osoba', mentions: 176, src: 11 },
    { name: 'ODS', kind: 'strana', mentions: 38, src: 9 },
    { name: 'Evropská komise', kind: 'instituce', mentions: 96, src: 4 },
  ],

  // Plný výpis pro tabulku na konci stránky.
  all: [
    {
      who: 'ČTK',
      d: '18. 8.',
      t: '16:48',
      title: 'Ministerstvo financí zpřesnilo odhad salda na 241 mld. Kč',
      pct: 88,
      state: 'ok',
    },
    {
      who: 'Deník N',
      d: '18. 8.',
      t: '15:41',
      title: 'Propočet redakce: saldo vychází na 223 miliard',
      pct: 54,
      state: 'bad',
    },
    {
      who: 'Seznam Zprávy',
      d: '18. 8.',
      t: '15:12',
      title: 'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu',
      pct: 62,
      state: 'bad',
    },
    {
      who: 'Novinky',
      d: '18. 8.',
      t: '15:17',
      title: 'Rozpočet se mění, saldo má být okolo 235 miliard',
      pct: 78,
      state: 'mid',
    },
    {
      who: 'iRozhlas',
      d: '17. 8.',
      t: '18:20',
      title: 'Kolik má být saldo? Zdroje se stále liší o 18 miliard',
      pct: 71,
      state: 'mid',
    },
    {
      who: 'Hospodářské noviny',
      d: '17. 8.',
      t: '11:05',
      title: 'Opozice mluví o skrytém deficitu, výpočet nezveřejnila',
      pct: 64,
      state: 'bad',
    },
    {
      who: 'iDNES',
      d: '16. 8.',
      t: '14:32',
      title: 'Rozpočet: údaj o saldu se opravil bez poznámky',
      pct: 82,
      state: 'ok',
    },
    {
      who: 'E15',
      d: '16. 8.',
      t: '09:14',
      title: 'Ministerstvo číslo nekomentuje, odhady se drží',
      pct: 60,
      state: 'bad',
    },
    {
      who: 'Aktuálně.cz',
      d: '15. 8.',
      t: '16:55',
      title: 'Devět redakcí, tři různá čísla o saldu',
      pct: 58,
      state: 'bad',
    },
    {
      who: 'Hospodářské noviny',
      d: '14. 8.',
      t: '13:40',
      title: 'Proč se čísla o rozpočtu rozcházejí. Otázka metodiky',
      pct: 49,
      state: 'bad',
    },
    {
      who: 'ČTK',
      d: '14. 8.',
      t: '08:12',
      title: 'Vláda projedná úpravu rozpočtu, saldo podle odhadu 240 miliard',
      pct: 92,
      state: 'ok',
    },
    {
      who: 'ČTK',
      d: '13. 8.',
      t: '17:30',
      title: 'Rozpočet se bude upravovat, resorty dostanou nové stropy',
      pct: 44,
      state: 'bad',
    },
  ],
}
