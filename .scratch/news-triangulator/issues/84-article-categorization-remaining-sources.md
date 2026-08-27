# 84 — Article categorization for the remaining 5 sources

**Type:** feature

**What to resolve:** User follow-up on tickets 78/79: of the 13 configured `Source`s, only 8 ever
got real categorization coverage — ticket 77's grilling session research simply never looked at
the other 5 (**Hospodářské noviny**, **Deník**, **E15**, **Echo24**, **CNN Prima NEWS**), not a
deliberate scope decision, just an incomplete research pass nobody revisited. In the live DB today,
`SourceFeed.category` is populated for iRozhlas/iDnes only (ticket 79); the per-item mapping table
(`articleCategoryMapping.ts`, ticket 78) only covers Novinky/Aktuálně/ČT24/Seznam Zprávy/Deník
N/České noviny. This ticket closes the gap for the remaining 5 — every configured Source gets real
categorization coverage by the time this is done.

**Research done before filing this ticket** (2026-08-27, live feed fetches — same rigor as tickets
77/79, not guessed):

- **Deník** (`src-denik`) tags every item inline with a real `<category>`, same mechanism as
  ticket 78's 6 sources: `Evropa`/`Svět`/`Česko`/`Regiony`/`Kultura`/`Ostatní fotbal`/`Ostatní
  sporty`/`Tenis`/`Fotbal`/`Ekonomika`/`Podnikání`/`Nehody` seen, plus noise
  (`Autotesty`/`Automagazín`/`Zahrada` — no clean rubric fit, left unmapped).
- **Echo24** (`src-echo24`) also tags inline, but mixed with syndication/format noise
  (`Homepage`/`Krátké zprávy`/`Bing cz`/`iPrima`/`Seznam cz`/`Panorama`/`Videoupoutávky`/`Týdeník`
  — none are real rubrics, left unmapped): real signal is `Svět`/`Domov`/`Ekonomika`.
- **CNN Prima NEWS** (`src-cnnprima`) tags inline: `Zahraničí`/`Politika`/`Krimi`/`Nehody`/
  `Ekonomika`/`Zprávy z regionů`/two named `kraj` region tags/`Názory`, plus per-country topic tags
  (`Itálie`/`Německo`/`Ukrajina` — topic, not rubric, left unmapped per ticket 78's own
  established "topic tag ≠ rubric" rule) and `Počasí`/`Lidé`/`360°` (no clean fit).
- **Hospodářské noviny** (`src-hn`) — the currently-configured feed (`archiv.hn.cz/?m=rss`) carries
  zero inline signal, same situation iRozhlas/iDnes were in before ticket 79, but
  `https://www.hn.cz/rss` redirects to a real RSS index page (`rss.hn.cz`) listing genuine
  per-section subdomain feeds: `domaci.hn.cz`, `zahranicni.hn.cz`, `byznys.hn.cz`, `nazory.hn.cz`,
  `tech.hn.cz`, `art.hn.cz`, `vikend.hn.cz`, `auto.hn.cz` (no clean fit, left out) — every one
  fetched live and confirmed to return a genuine, distinct RSS 2.0 feed with a real per-rubric
  title (`?m=rss` is HN's own site-wide RSS convention, not specific to the all-articles feed).
- **E15** (`src-e15`) — same zero-inline-signal situation on its current feed, but its own site
  pages reveal a real numeric-id per-category feed scheme (`e15.cz/rss/<id>`, discovered via each
  section page's own `atom:link rel="self"`): `rss/6081` (Domácí), `rss/6085` (Zahraniční),
  `rss/9474` (Ekonomika), `rss/6089` (Byznys), `rss/9768` (Kultura) — all fetched live and
  confirmed. No sport feed id found this pass (tried several path guesses, none resolved) — left
  out rather than guessed.

**Blocked by:** 78 (needs the mapping-table mechanism), 79 (needs the feed-implied-categorization
mechanism) — both already done.

**Status:** done

- [x] `articleCategoryMapping.ts`: extend `SOURCE_CATEGORY_MAPS` with three new per-source tables
      (`src-denik`, `src-echo24`, `src-cnnprima`), using exactly the raw values/mappings the
      research above lists — no new raw value invented beyond what was actually observed.
- [x] Migration (raw SQL, matching tickets 78/79's own convention — apply directly, not via
      `prisma db push`, per ticket 83's own hard-learned lesson about `db push` silently dropping
      unmodeled DB objects): 7 new `SourceFeed` rows for `src-hn` (domaci/zahranicni/byznys/
      nazory/tech/art/vikend, each with its `category` set) and 5 for `src-e15`
      (domaci/zahranicni/ekonomika/byznys/kultura). Each source's existing all-articles feed is
      kept alongside the new ones, not replaced — same reasoning ticket 79 already established
      (Ingestion's URL-keyed dedup already collapses an article arriving via both).
- [x] `CONTEXT.md`'s existing "Category" entry: no new concept introduced here, just more coverage
      — update only if the entry's own source-coverage description goes stale, not a rewrite.
- [x] Tests: mapping-table resolution for the three new sources (first-mappable-tag-wins, the
      documented noise/topic tags falling through to `null`), same shape as ticket 78's own tests.
- [x] Manually verify against the real Docker backend, same rigor as tickets 82/83: confirm the new
      `SourceFeed` rows exist with the right `category`, and that `resolveCategoryForCandidate`
      resolves correctly for a sample raw tag from each of the three newly-mapped sources.
- [x] Typecheck + full test suites pass. `/code-review` clean.
