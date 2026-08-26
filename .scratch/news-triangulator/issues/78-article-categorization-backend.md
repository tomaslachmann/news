# 78 — Article categorization backend

**Type:** feature

**What to resolve:** Follow-up from ticket 77's grilling session. Adds real, enum-based article
categorization: a `Coverage.primaryCategory` derived from each source's own RSS category signal at
ingestion time, `Story`/`Analysis` deriving an aggregate at read time, and a `SourceFeed.category`
column ready for ticket 79's feed-implied categorization. Covers the sources with real inline
`<category>` tags today — Novinky, Aktuálně, ČT24, Seznam Zprávy, Deník N, České noviny.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] `packages/backend/prisma/schema.prisma`: new `ArticleCategory` enum — `DOMESTIC`, `WORLD`,
      `ECONOMY`, `POLITICS`, `SPORT`, `CULTURE`, `SCIENCE_TECH`, `CRIME`, `LIFESTYLE`, `COMMENTARY`,
      `HEALTH`, `REGIONAL`, `OTHER`. `Coverage.primaryCategory ArticleCategory?` (nullable — no
      backfill, existing rows stay `null`). `SourceFeed.category ArticleCategory?` (nullable, unused
      until ticket 79 configures real per-category feed URLs).
- [ ] `packages/shared/src/index.ts`: mirror the enum as a matching TS union/label map (same
      "kept in sync by hand" convention this schema already uses for `EntityType`/
      `StoryRelationType`-style enums), plus a Czech display-label map for each value (needed by
      ticket 80's nav/browse page, but declare it here alongside the enum it labels).
- [ ] New per-source raw-category mapping table (e.g.
      `packages/backend/src/services/articleCategoryMapping.ts`): for each of the 6 sources with
      real inline `<category>` signal, a `Record<string, ArticleCategory>` from the source's own raw
      tag/code (e.g. Novinky's "Zahraniční", České noviny's `"m"`) to the canonical enum. A raw tag
      not present in a source's table has no mapping (falls through to the "first mappable tag"
      logic below finding nothing → `null`, never a guessed default).
- [ ] `packages/backend/src/services/rss.ts`: extend `RawFeedItem`/`parseRss2` to also capture each
      item's raw category value(s) (`item.categories` from the underlying `rss-parser` — currently
      discarded entirely).
- [ ] Wherever a `CandidateArticle`/`Coverage` gets created from a parsed feed item: resolve
      `primaryCategory` by trying the item's raw category value(s) in order against that Source's
      mapping table, taking the first one that maps to a real `ArticleCategory`; `null` if none do
      (or the source has no mapping table at all, e.g. iRozhlas/iDnes until ticket 79).
- [ ] Story/Analysis read-time aggregate: a pure function (e.g. in `mappers/` or a service) that
      takes a Story's member Coverages' `primaryCategory` values and returns the mode, tie-broken by
      the earliest-attached Coverage — not a persisted column anywhere.
- [ ] `CONTEXT.md`: add a "Category" entry defining `ArticleCategory`, the per-Coverage/aggregate
      split, and the "no backfill" rule, so this new domain term doesn't drift.
- [ ] Tests: mapping-table resolution (first-mappable-tag-wins, no-match → null, unknown source →
      null), `rss.ts` category extraction, the Story-aggregate mode/tie-break function (unit tests
      covering a clear majority, a tie, and no Coverage having any category at all).
- [ ] Typecheck + full test suites pass. `/code-review` clean.
