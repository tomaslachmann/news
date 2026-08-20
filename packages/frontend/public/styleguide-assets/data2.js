// Doplňková ukázková data pro portálové návrhy (D/E/F)
;(function () {
  const img = {
    'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu': 'parlament',
    'ČNB ponechala úrokové sazby bez změny': 'cnb',
    'Jednání o dodávkách munice pro Ukrajinu se posunulo na září': 'munice',
    'ČEZ oznámil investici do přenosové sítě na severní Moravě': 'energetika',
    'Trump podepsal exekutivní příkaz k dovozním tarifům': 'eu',
    'Praha upravuje pravidla pro krátkodobé ubytování': 'praha',
    'Babiš vystoupil k výsledkům auditu evropských dotací': 'tiskovka',
    'NATO potvrdilo termín cvičení ve Střední Evropě': 'nato',
  }
  window.NT.stories.forEach((s) => {
    s.img = img[s.title] || 'parlament'
    s.clock = s.time
  })

  // Pevné časy jako na reálném portálu
  const clocks = ['15:12', '14:41', '14:03', '13:18', '12:44', '10:29', '08:57', '06:20']
  window.NT.stories.forEach((s, i) => (s.clock = clocks[i] || '06:00'))

  window.NT.entities.sort((a, b) => b.mentions - a.mentions)

  window.NT.ticker = [
    { k: 'Zpracováno dnes', v: '1 284 článků' },
    { k: 'Aktivní zdroje', v: '41' },
    { k: 'Nové rozpory', v: '12', warn: true },
    { k: 'Průměrná shoda', v: '73 %' },
    { k: 'Nejrychlejší zdroj', v: 'ČTK · 3 min' },
  ]

  window.NT.feed = [
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
      history: true,
      title: 'Policie zahájila úkony v trestním řízení kvůli dotacím pro obce',
      src: 8,
      conflict: true,
    },
    { t: '12:55', title: 'Praha vypsala tendr na obnovu tramvajové trati na Smíchově', src: 2 },
    { t: '12:31', title: 'Ukrajinská delegace přijede do Prahy koncem měsíce', src: 5 },
    { t: '11:58', title: 'Inflace v eurozóně zpomalila třetí měsíc v řadě', src: 9 },
    { t: '11:22', title: 'NATO rozšíří cvičení o logistický modul v Polsku', src: 4 },
    { t: '10:47', title: 'Ostravská univerzita otevře nový program datové žurnalistiky', src: 2 },
  ]

  window.NT.mostread = [
    { title: 'Rozpor: kolik bytů se skutečně dotkne nová pražská vyhláška', src: 7 },
    { title: 'Tři redakce citují pasáž, která v oficiálním přepisu chybí', src: 11 },
    { title: 'Jak se za 24 hodin změnilo číslo o objemu investice ČEZ', src: 6 },
    { title: 'Kdo první uvedl termín září u dodávek munice', src: 8 },
    { title: 'Přehled: kde se agentury nejčastěji rozcházejí', src: 14 },
  ]

  window.NT.conflicts = [
    { title: 'Saldo rozpočtu', detail: 'rozdíl 18 mld. Kč mezi 7 zdroji', pct: 62 },
    { title: 'Objem investice ČEZ', detail: 'dvojnásobný rozdíl v údaji', pct: 71 },
    { title: 'Citace z auditu', detail: 'pasáž chybí v primárním přepisu', pct: 48 },
    { title: 'Termín dodávek munice', detail: 'původní zdroj nedohledán', pct: 55 },
  ]

  window.NT.topics = [
    'Domácí',
    'Ekonomika',
    'Zahraničí',
    'Energetika',
    'Regiony',
    'Bezpečnost',
    'Zdravotnictví',
    'Doprava',
    'Kultura',
    'Sport',
  ]

  window.NT.outlets = [
    'ČTK',
    'iRozhlas',
    'Seznam Zprávy',
    'Deník N',
    'Novinky',
    'iDNES',
    'Reuters',
    'AP',
    'Hospodářské noviny',
    'Aktuálně.cz',
    'E15',
    'Info.cz',
  ]
})()
