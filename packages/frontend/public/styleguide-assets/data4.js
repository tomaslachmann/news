// Ukázková data pro interní (administrátorské) obrazovky.
// Struktura odpovídá skutečnému API v repozitáři: koncepty ze sběru článků
// (Analysis DRAFT), možná doplnění k dokončeným článkům (PendingAddition),
// vztahy mezi událostmi ke schválení (StoryRelation PENDING_REVIEW),
// uživatelé (User: ADMIN | READONLY) a krok výběru zdrojů (Coverage).
window.NT = window.NT || {}

window.NT.admin = {
  me: { email: 'jana.krizova@newstriangulator.cz', role: 'ADMIN' },

  // Souhrn nad frontami — čísla, která admin potřebuje vidět první.
  stats: [
    { k: 'Konceptů ke schválení', v: '7' },
    { k: 'Možných doplnění', v: '4' },
    { k: 'Vztahů ke schválení', v: '3', warn: true },
    { k: 'Poslední sběr', v: '16:40' },
    { k: 'Chyb extrakce za 24 h', v: '2', warn: true },
    { k: 'Zdrojů v konfiguraci', v: '31' },
  ],

  // Poslední průběh sběru — přesně ta čísla, která vrací /api/ingestion/run.
  run: {
    at: 'dnes 16:40',
    checked: 312,
    created: 4,
    attached: 11,
    flagged: 2,
    skipped: 295,
  },

  // ── Fronta 1: koncepty ze sběru článků ───────────────────────────────────
  // Analysis se statusem DRAFT, které překročily prahovou hodnotu viditelnosti.
  drafts: [
    {
      id: 'cl9d2k1',
      title: 'Ministerstvo financí zpřesnilo odhad salda na 241 mld. Kč',
      created: 'dnes 16:48',
      sources: 6,
      first: 'ČTK',
      note: 'Šest zdrojů do 40 minut, dva z nich přebírají stejnou tiskovou zprávu.',
    },
    {
      id: 'cl9d2k2',
      title: 'ČEZ oznámil investici do přenosové sítě na severní Moravě',
      created: 'dnes 15:02',
      sources: 5,
      first: 'iRozhlas',
      note: 'Jeden zdroj uvádí odlišnou částku investice — čeká na krok výběru zdrojů.',
    },
    {
      id: 'cl9d2k3',
      title: 'Sněmovní výbor odložil hlasování o veřejných zakázkách',
      created: 'dnes 13:15',
      sources: 4,
      first: 'Deník N',
      note: 'Pod pěti zdroji. Schválení je možné, triangulace bude ale omezená.',
      thin: true,
    },
  ],

  // ── Fronta 2: možná doplnění k dokončeným článkům ────────────────────────
  additions: [
    {
      id: 'pa-1',
      who: 'Hospodářské noviny',
      title: 'Rozpočtové saldo: co přesně se změnilo v příloze č. 3',
      url: 'https://hn.cz/c1-1074512-rozpoctove-saldo-priloha',
      published: 'dnes 16:31',
      toId: 'a-1',
      to: 'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu',
    },
    {
      id: 'pa-2',
      who: 'E15',
      title: 'Analytici: rozdíl mezi 223 a 241 miliardami je otázka metodiky',
      url: 'https://e15.cz/domaci/rozdil-metodika-saldo',
      published: 'dnes 16:12',
      toId: 'a-1',
      to: 'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu',
    },
    {
      id: 'pa-3',
      who: 'Aktuálně.cz',
      title: 'Kraje čekají na vyčíslení dopadu, ministerstvo mlčí',
      url: 'https://aktualne.cz/r~kraje-dopad-rozpoctu',
      published: 'dnes 14:58',
      toId: 'a-1',
      to: 'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu',
    },
  ],

  // ── Fronta 3: vztahy mezi událostmi (nižší jistota) ──────────────────────
  // Zamítnutí je trvalé — nástroj tuto dvojici znovu nenabídne.
  relations: [
    {
      id: 'rel-1',
      type: 'FOLLOW_UP',
      from: 'Ministerstvo financí zpřesnilo odhad salda na 241 mld. Kč',
      to: 'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu',
      why: 'Obě události se týkají stejného rozpočtového dokumentu a mluví o stejném saldu. Novější zpráva uvádí číslo, které starší označuje za nepotvrzené.',
      created: 'dnes 16:52',
    },
    {
      id: 'rel-2',
      type: 'RELATED',
      from: 'ČNB ponechala úrokové sazby bez změny',
      to: 'Vláda schválila úpravu rozpočtu, opozice mluví o skrytém deficitu',
      why: 'Tři zdroje zmiňují rozhodnutí ČNB v souvislosti s deficitem, ale žádný netvrdí přímou souvislost. Sdílená entita: Ministerstvo financí.',
      created: 'dnes 16:20',
      weak: true,
    },
    {
      id: 'rel-3',
      type: 'RELATED',
      from: 'Kraje žádají vyčíslení dopadu úprav',
      to: 'Sněmovní výbor odložil hlasování o veřejných zakázkách',
      why: 'Sdílené entity: Andrej Babiš, ODS. Tématicky se ale překrývají jen okrajově — obě zprávy zmiňují jednání téhož výboru.',
      created: 'dnes 12:44',
      weak: true,
    },
  ],

  // ── Uživatelé ────────────────────────────────────────────────────────────
  users: [
    { id: 'u1', email: 'jana.krizova@newstriangulator.cz', role: 'ADMIN', created: '3. 2. 2026', self: true },
    { id: 'u2', email: 'martin.blaha@newstriangulator.cz', role: 'ADMIN', created: '3. 2. 2026' },
    { id: 'u3', email: 'petra.novakova@newstriangulator.cz', role: 'READONLY', created: '14. 4. 2026' },
    { id: 'u4', email: 'redakce@newstriangulator.cz', role: 'READONLY', created: '2. 6. 2026' },
    { id: 'u5', email: 'stazista@newstriangulator.cz', role: 'READONLY', created: '11. 8. 2026' },
  ],

  // ── Krok výběru zdrojů pro jeden koncept ─────────────────────────────────
  review: {
    id: 'cl9d2k1',
    title: 'Ministerstvo financí zpřesnilo odhad salda na 241 mld. Kč',
    seedUrl: 'https://ctk.cz/zpravy/mf-zpresnilo-odhad-salda-241-mld',
    seedWho: 'ČTK',
    created: 'dnes 16:48',
    keywords: ['saldo rozpočtu', 'ministerstvo financí', '241 miliard', 'úprava rozpočtu'],
    candidates: [
      {
        id: 'c1',
        who: 'ČTK',
        title: 'MF zpřesnilo odhad salda rozpočtu na 241 miliard korun',
        url: 'https://ctk.cz/zpravy/mf-zpresnilo-odhad-salda-241-mld',
        published: 'dnes 16:48',
        on: true,
        seed: true,
        state: 'ok',
      },
      {
        id: 'c2',
        who: 'iRozhlas',
        title: 'Ministerstvo financí uvádí saldo 241 miliard, dvě redakce svůj údaj opravily',
        url: 'https://irozhlas.cz/zpravy-domov/saldo-241-miliard',
        published: 'dnes 16:52',
        on: true,
        state: 'ok',
      },
      {
        id: 'c3',
        who: 'Seznam Zprávy',
        title: 'Rozpočtové saldo: nové číslo z ministerstva',
        url: 'https://seznamzpravy.cz/clanek/rozpoctove-saldo-nove-cislo-291044',
        published: 'dnes 17:01',
        on: true,
        state: 'ok',
      },
      {
        id: 'c4',
        who: 'Novinky',
        title: 'Saldo rozpočtu bude podle ministerstva 241 miliard',
        url: 'https://novinky.cz/clanek/domaci-saldo-rozpoctu-241-40448512',
        published: 'dnes 17:04',
        on: true,
        state: 'ok',
      },
      {
        id: 'c5',
        who: 'iDNES',
        title: 'Ministerstvo zpřesnilo saldo, opozice zůstává u vlastního propočtu',
        url: 'https://idnes.cz/zpravy/domaci/saldo-rozpoctu-mf.A260818_141522_domaci_jak',
        published: 'dnes 17:12',
        on: true,
        state: 'ok',
      },
      {
        id: 'c6',
        who: 'Hospodářské noviny',
        title: 'Metodika za rozdílem 18 miliard',
        url: 'https://hn.cz/c1-1074509-metodika-rozdil-18-miliard',
        published: 'dnes 17:20',
        on: false,
        state: 'fail',
        note: 'Extrakci text nevydala — placený obsah. Vložte text ručně, nebo zdroj vynechte.',
      },
      {
        id: 'c7',
        who: 'Blesk',
        title: 'Kolik nás bude rozpočet stát? Přehledně',
        url: 'https://blesk.cz/clanek/zpravy-politika-rozpocet-prehledne.html',
        published: 'dnes 17:26',
        on: false,
        state: 'ok',
        note: 'Přebírá ČTK bez vlastního zjištění. Nezvyšuje počet nezávislých zdrojů.',
      },
      {
        id: 'c8',
        who: 'Parlamentní listy',
        title: 'Vláda opět sahá do peněz lidí, tvrdí opozice',
        url: 'https://parlamentnilisty.cz/arena/monitor/vlada-opet-748812',
        published: 'dnes 17:33',
        on: false,
        state: 'ok',
        note: 'Nesplňuje kritéria pro zařazení — komentář, ne zpravodajství o téže události.',
      },
    ],
    custom: ['https://ceskenoviny.cz/zpravy/saldo-rozpoctu-241/2698441'],
  },
}
