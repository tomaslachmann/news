# 85 — Real per-category RSS feeds for sources ticket 84 under-served, plus szn:sections parsing

**Type:** feature

**What to resolve:** User correction after ticket 84 merged: "VSECHNY MAJI ZVLAST RSS FEEDY NA
KATEGORIE, STACILO ZADAT DO GOOGLU" (all of them have separate RSS feeds per category, a plain
Google search finds them) — pointing at `https://www.aktualne.cz/export-rss`. Ticket 84 filled
categorization gaps only for the 5 sources it researched, using whichever mechanism its narrower
search turned up (mostly per-item mapping-table guesses). This ticket re-researches every source
with real web search + live verification (same rigor as 79/84, no guessing) and upgrades sources to
the more reliable **feed-implied** mechanism (ticket 79) wherever a genuine, dedicated per-category
feed exists — replacing reliance on fragile per-item tag inference, and fixing one real parsing bug
along the way (Novinky/Seznam Zprávy's category signal was never being read at all).

**Research done before filing this ticket** (2026-08-27, every URL below fetched live with a
browser User-Agent and confirmed to return a distinct, real feed — title and item count checked,
not just a 200 status):

- **Aktuálně** (`src-aktualne`) — `https://www.aktualne.cz/export-rss/` is a real index of 100+
  feeds. 9 map cleanly to `ArticleCategory`: `domaci`(DOMESTIC), `zahranici`(WORLD),
  `ekonomika`(ECONOMY), `kultura`(CULTURE), `sport`(SPORT), `nazory`(COMMENTARY),
  `zdravotnictvi-22850dba-908b-4192-badc-0e7f1c003a00`(HEALTH — real slug, UUID suffix and all),
  `veda`(SCIENCE_TECH), `regiony`(REGIONAL). `ceska-ekonomika` skipped as a narrower duplicate of
  `ekonomika`. Currently Aktuálně has **zero** `SourceFeed` rows — this is a first-time upgrade from
  per-item-only to feed-implied, not a replacement of existing feed rows.
- **ČT24** (`src-ct24`) — `https://ct24.ceskatelevize.cz/rss/rubrika/<slug>-<id>` is real (found via
  `ceskatelevize.cz/rss/` linking to two regional rubrika URLs in that scheme; the `<slug>-<id>`
  pairs themselves come from the `domain="..."` attribute already seen on ČT24's own inline
  `<category>` tags, ticket 78's research). 5 confirmed: `domaci-5`(DOMESTIC), `ekonomika-17`
  (ECONOMY), `kultura-24`(CULTURE), `svet-16`(WORLD), `veda-25`(SCIENCE_TECH). `media-19` (Média)
  skipped, no clean fit — same treatment ticket 78 already gave it in the per-item map. ČT24
  already has real signal via inline tags (ticket 78); this is an upgrade to the more reliable
  mechanism, not a fix to something broken.
- **České noviny** (`src-ceskenoviny`) — `https://www.ceskenoviny.cz/rss/` (found via web search;
  distinct from `/sluzby/rss/<slug>.php`, which is the actual feed URL, not an index) lists real
  per-category feeds. 5 confirmed: `cr.php`(DOMESTIC, title "Zprávy z ČR"), `svet.php`(WORLD, "Ze
  světa"), `ekonomika.php`(ECONOMY), `kultura.php`(CULTURE), `sport.php`(SPORT). `fotbal.php`/
  `hokej.php`/`tenis.php` skipped as narrower duplicates of `sport.php`; `magazin.php` and
  `autonaelektrinu.php` skipped, no clean single-category fit. This directly **replaces** the
  reliability of `CESKE_NOVINY_MAP`'s guessed terse codes (`d`/`m`/`e`/`s`, inferred by reading
  article samples in ticket 78) — the per-item map stays as a fallback for the all-articles feed,
  per ticket 79's established pattern, but new candidates from these 5 feeds no longer depend on
  the guessed codes at all.
- **Deník N** (`src-denikn`) — WordPress's standard `/<category-slug>/feed/` convention (same
  convention `denikn.cz/feed/`, the existing all-articles feed, already uses for "all"). 7
  confirmed: `cesko`(DOMESTIC), `svet`(WORLD), `ekonomika`(ECONOMY), `kultura`(CULTURE),
  `komentare`(COMMENTARY), `lifestyle`(LIFESTYLE), `veda`(SCIENCE_TECH). `nazory/feed/` also
  resolves (title "Názor") but overlaps `komentare` — skipped as redundant. `zdravi/feed/` is
  `410 Gone` — skipped, no working URL found.
- **Deník.cz** (`src-denik`) — `https://www.denik.cz/rss/` (already known from ticket 84) lists 7
  feeds; re-checked each one's actual item content against its title/URL-content, not just its
  title. `zpravy.xml` looked like a DOMESTIC candidate by name but its actual items mix world news
  (Ratko Mladić) and economy — it's a general top-news feed, not rubric-scoped, so it's
  **deliberately excluded** rather than mis-mapped. 3 confirmed clean: `nazory.xml`(COMMENTARY),
  `podnikani.xml`(ECONOMY), `sport.xml`(SPORT). `magazin.xml` mixes health/auto content, skipped.
- **Echo24** (`src-echo24`) — home page `<link rel="alternate" type="application/rss+xml">`
  revealed a real `/rss/s/<slug>` per-section scheme (not discoverable by guessing — found via
  the actual page source). 3 confirmed, each verified to return only matching-category items:
  `domov`(DOMESTIC), `svet`(WORLD), `ekonomika`(ECONOMY). Tried `krimi`/`kultura`/`sport-a-hry`/
  `zdravi`/`zivotni-styl`/`politika`/`regiony`/`veda` — all 404. `nazory` resolves but returns 0
  items, skipped as empty. This directly replaces the reliability of `ECHO24_MAP`'s 3 entries with
  the same 3 categories via feed-implied.
- **CNN Prima NEWS** (`src-cnnprima`) — the existing all-articles feed's own `<category
  domain="https://cnn.iprima.cz/<slug>">` attributes gave 24 real section-page URLs; of those,
  `https://cnn.iprima.cz/rss/<slug>` (a scheme not on the domain-attribute URL itself, found by
  testing) works for 9 of them, each verified to return items whose own category-domain tags are
  dominated by that section (not a strict single-category filter — Seznam-family feeds mix in
  related/cross-tagged categories, same as Echo24 and the szn:sections case below — but
  consistently topic-scoped): `domaci`(DOMESTIC), `zahranici`(WORLD), `ekonomika`(ECONOMY),
  `krimi`(CRIME), `politika`(POLITICS), `sport`(SPORT), `nazory`(COMMENTARY), `kultura`(CULTURE),
  `zpravy-z-regionu`(REGIONAL). This replaces `CNN_PRIMA_MAP`'s 9 entries (which included two named
  per-`kraj` region tags) with 9 feed-implied categories via one clean `REGIONAL` feed instead.
- **Novinky** (`src-novinky`) and **Seznam Zprávy** (`src-seznamzpravy`) — **no real per-category
  feed exists**: every `/rss/<slug>` URL guess (both sites) returns HTTP 200 but is byte-for-byte
  the same all-articles feed regardless of slug — the path segment is silently ignored server-side.
  No `<link rel="alternate">` on either site's category pages, no `/export-rss` index page. This is
  a genuine negative finding, not an incomplete search.
  However: inspecting each item's actual raw XML (not just the fields `rss-parser`'s defaults
  extract) found the real bug — both sources tag every item with
  `<szn:sections><value>Rubrika</value>...</szn:sections>` (a custom-namespaced, nested-`<value>`
  field), **never** a plain `<category>` tag. `rss-parser`'s default config only reads
  `<category>`, so `item.categories` has always been `undefined` for these two sources —
  `STANDARD_CZECH_RUBRIC_MAP` has silently never fired for Novinky or Seznam Zprávy since ticket
  78, despite both being listed as covered by it. Confirmed live with `rss-parser`'s
  `customFields: { item: [['szn:sections', 'sznSections']] }` option: `item.sznSections.value` is
  exactly the raw category list (e.g. `['Evropa', 'Zahraniční', 'Stalo se']`), in the same
  first-value-may-be-a-topic-not-a-rubric shape ticket 78 already designed
  `resolvePrimaryCategory`'s first-match-wins loop to handle. Sampled 15 items from each source's
  feed: existing map values (`Domácí`, `Zahraniční`, `Svět`, `Ekonomika`, `Byznys`, `Kultura`,
  `Politika`, `Krimi`) already match the real vocabulary correctly. Two real rubric values are used
  that aren't in the map yet: `Lifestyle` and `Komentáře` — both already present, spelled
  identically, in `DENIK_N_MAP`, so adding them to the shared table is consistent, not a guess.

**Blocked by:** 78, 79 (both already done — this ticket only uses their existing two mechanisms).

**Status:** todo

- [ ] `services/rss.ts`: add `customFields: { item: [['szn:sections', 'sznSections']] }` to the
      `rss-parser` config; when building `rawCategories`, fall back to `item.sznSections?.value`
      when `item.categories` is empty/undefined. Generic (any source could have this field), not
      Novinky/SeznamZpravy-specific code.
- [ ] `articleCategoryMapping.ts`: add `Lifestyle: 'LIFESTYLE'` and `Komentáře: 'COMMENTARY'` to
      `STANDARD_CZECH_RUBRIC_MAP` (real values observed in Novinky's `szn:sections`, already mapped
      identically in `DENIK_N_MAP`).
- [ ] Migration (raw SQL, applied directly per ticket 83's `db push`-drops-unmodeled-objects
      lesson): 38 new `SourceFeed` rows total, each `category` set, existing all-articles feed for
      every source kept alongside (ticket 79's established dedup reasoning) —
      9 for `src-aktualne`, 5 for `src-ct24`, 5 for `src-ceskenoviny`, 7 for `src-denikn`, 3 for
      `src-denik`, 3 for `src-echo24`, 9 for `src-cnnprima` — exactly the slugs/categories/URLs
      the research above lists, no new value invented.
- [ ] `CONTEXT.md`'s "Category" entry: note that feed-implied is now the primary mechanism for 9 of
      13 sources (only Deník N's remaining uncovered rubrics, Deník's general zpravy feed, and
      Novinky/Seznam Zprávy stay per-item-only), and that "coverage exists" (ticket 84's framing)
      undersold how unreliable some of that per-item coverage was before this ticket.
- [ ] Tests: `rss.ts` — a unit test (or extend existing coverage) proving `szn:sections` items
      produce the right `rawCategories` and plain `<category>` items are unaffected. Mapping-table
      tests for the two new `STANDARD_CZECH_RUBRIC_MAP` entries.
- [ ] Manually verify against the real Docker backend (rebuild, not restart): confirm all 38 new
      `SourceFeed` rows exist with the right `category`, and that a real Novinky/Seznam Zprávy
      ingestion run now resolves `primaryCategory` via `szn:sections` where it previously always
      resolved `null`.
- [ ] Typecheck + full test suites (unit + integration) pass. `/code-review` clean.
