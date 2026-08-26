# 77 — Grilling: article/story categorization

**Type:** grilling

**Status:** done

**What to resolve:** `docs/user-comments.md` item 12: "chybí kategorizace" (missing categorization).
Already flagged and explicitly deferred twice before — ticket 56's homepage audit ("there is
currently no `primaryCategory`/rubric field on `Story` or `Analysis`") and ticket 58 ("Do **not**
invent a category field that the model/database does not yet hold"), and named as future work in
`docs/spec-event-graph.md`. `chromeNav.ts`'s 7 topic rubrics (`Domácí`/`Ekonomika`/`Svět`/
`Energetika`/`Regiony`/`Sport`/`Kultura`) are dead `to: '#'` placeholders with no real data behind
them, unlike the working `Historie`/`Hledat`/`Vlákna` nav entries.

Researched what this codebase's 13 already-configured `SourceFeed`s (all currently pointed at
generic all-articles feeds, per `20260820133322_add_feed_parser_kind_and_source_fixes`'s own "ahead
of a planned per-category feed configuration" note) actually expose, before proposing a model:

- **iRozhlas** publishes real per-category RSS feed URLs: `/section/zpravy-domov` (domestic),
  `/section/zpravy-svet` (world), `/section/ekonomika`, `/section/sport`, `/section/kultura`,
  `/section/veda-technologie`, `/section/komentare`, `/section/zivotni-styl`, plus a fact-check tag
  feed and 14 regional feeds.
- **Novinky, Aktuálně, ČT24, Seznam Zprávy** have one all-articles feed each, but every RSS `<item>`
  carries its own inline `<category>` tag — real values seen: Domácí, Zahraničí/Svět, Ekonomika/
  Byznys/Česká ekonomika, Sport(/Fotbal), Kultura, Politika, Krimi, Mobil, Věda.
- **Deník N** tags each item with 4–6 categories that mix real rubrics ("Svět", "Ekonomika",
  "Kultura") with ongoing-story topic tags ("Ruská válka na Ukrajině", "Migrace a uprchlíci",
  "Investigativa") in the same `<category>` field, undifferentiated.
- **České noviny** uses terse internal single-letter codes per item (`d`, `m`, `e`, `s`, `p`).
- iDnes's RSS index didn't load for this research pass — not yet confirmed either way.

Nothing in this codebase reads any of this today: `rss.ts`'s `RawFeedItem` doesn't extract
`<category>` at all, and no `Source`/`SourceFeed`/`Story`/`Analysis`/`Coverage` model has a category
field of any kind. The user's own constraint going in: the canonical category **must be a real
enum, never a raw string** — every per-source raw category value (URL section, inline tag, or
short code) needs mapping onto a small, fixed, canonical set.

**Blocked by:** none — purely a design question; the RSS ingestion pipeline and Source/SourceFeed
models already exist to extend.

Not yet decided:

1. Where does the category live — per-`Coverage` (one per source's own article, since categorization
   is fundamentally a per-source-per-article judgment and different sources categorize at different
   granularities), with `Story` deriving an aggregate/primary category across its Coverages? Or
   `Story`-level only? Or both (raw per-Coverage, aggregated per-Story)?
2. What's the canonical enum's actual value set? Real evidence points toward something like
   `DOMESTIC`/`WORLD`/`ECONOMY`/`POLITICS`/`SPORT`/`CULTURE`/`SCIENCE_TECH`/`CRIME`/`LIFESTYLE`/
   `COMMENTARY`/`HEALTH`/`REGIONAL`/`OTHER` — and specifically, does `chromeNav.ts`'s "Energetika"
   placeholder get dropped (no real outlet evidence found for it) or kept for later?
3. Deník N tags one article with several categories, mixing rubric-level and topic-level tags in
   the same field — does a `Coverage` get one `primaryCategory`, or an array? If one, what decides
   which raw tag wins when a source hands us several?
4. Mapping mechanism: a hardcoded per-source TS lookup table (raw string/code → canonical enum,
   matching this codebase's existing convention of raw-SQL-seeded, code-defined `Source`/
   `SourceFeed` rows — not admin-editable), or a DB-backed mapping table an Admin could correct
   without a deploy?
5. Backfill: category classification only applies to newly-ingested Coverage/Story going forward
   (this codebase's established no-backfill convention, ADR 0021), leaving every existing row
   uncategorized — or does this need a backfill pass?
6. Scope: does this same effort also wire `chromeNav.ts`'s rubric links to a real `/category/:slug`
   browse page (mirroring `/history`/`/threads`), or does this session settle the data
   model/ingestion/backfill decision only, spinning the browse page off as its own follow-up
   implementation ticket (mirroring how ticket 65's grilling fanned out into tickets 68-71)?

## Answer

**Grilling session held 2026-08-27.**

Surveyed real RSS feed structure before the session (see also `docs/user-comments.md` item 12,
tickets 56/58's prior deferrals): the 13 already-configured `SourceFeed`s split into two real
categorization mechanisms — iRozhlas (and iDnes, per its documented `?c=` parameter scheme) expose
genuine per-category RSS feed URLs, while their *currently-configured* feeds carry zero inline
signal at all (both were widened to all-articles feeds by
`20260820133322_add_feed_parser_kind_and_source_fixes`); Novinky, Aktuálně, ČT24, and Seznam Zprávy
tag every item inline with a real category value; Deník N multi-tags each item, mixing real rubrics
with story-specific topic tags undifferentiated; České noviny uses terse internal short codes.
Nothing in this codebase reads any of this today.

Decisions reached with the user:

- **Granularity: per-`Coverage`, `Story`/`Analysis` derive an aggregate.** `Coverage.primaryCategory`
  (nullable `ArticleCategory`) is the real, per-source data — categorization is a per-source
  judgment the same way `sourceOverlap`/attributions already are, and sources genuinely disagree.
  `Story`/`Analysis`'s own "primary category" is computed at read time from its Coverages, never a
  persisted column — matches this codebase's existing "derive on read" convention, and avoids a
  stale-aggregate problem.
- **Canonical enum: `ArticleCategory`** — `DOMESTIC`, `WORLD`, `ECONOMY`, `POLITICS`, `SPORT`,
  `CULTURE`, `SCIENCE_TECH`, `CRIME`, `LIFESTYLE`, `COMMENTARY`, `HEALTH`, `REGIONAL`, `OTHER`.
  `chromeNav.ts`'s "Energetika" placeholder is dropped — no real outlet evidence for it anywhere in
  this research pass, and inventing a category the data doesn't back is exactly what tickets 56/58
  already warned against for this feature.
- **One `primaryCategory` per `Coverage`, not an array.** When a source hands us several raw tags
  (Deník N), the first one that maps onto the canonical enum wins; unmapped/topic-only tags (e.g.
  "Ruská válka na Ukrajině") are ignored for this purpose — a reader-facing "browse by rubric" nav
  wants one bucket per article, and an array only reopens the rubric-vs-topic-tag ambiguity the raw
  feeds can't answer cleanly anyway.
- **Mapping: hardcoded per-source TS lookup table**, not admin-editable — matches how `Source`/
  `SourceFeed` rows themselves are already raw-SQL-seeded, code-defined config. 13 sources with a
  handful of raw values each is small and stable enough that a DB-backed mapping would be new
  admin-UI scope nothing else here needs.
- **No backfill.** Existing Coverage/Story rows stay uncategorized going forward — this codebase's
  established convention (ADR 0021), consistent with how e.g. ticket 51's lead-image backfill was
  handled.
- **Story aggregate rule: mode of its Coverages' categories**, tie-broken by the earliest-attached
  Coverage's category.
- **`SourceFeed.category` (nullable `ArticleCategory`) added to the schema now, feed-URL research
  deferred.** iRozhlas's/iDnes's actual per-category/`?c=` feed URLs are real, per-source legwork
  that shouldn't block shipping the core enum/model/mapping mechanism — split into ticket 79.
- **`chromeNav.ts` wiring and a real `/category/:slug` browse page: split off entirely**, mirroring
  ticket 65's own grilling → 68-71 fan-out. This session settles the data model and ingestion
  mapping only.

Follow-up tickets filed from this session:

- **78 — Article categorization backend.** `ArticleCategory` enum, `Coverage.primaryCategory` +
  `SourceFeed.category` columns, per-source raw-tag mapping table, `rss.ts` extended to read
  `<category>`, Story/Analysis read-time aggregate. Covers the sources with real inline-tag signal
  today (Novinky, Aktuálně, ČT24, Seznam Zprávy, Deník N, České noviny).
- **79 — Per-category `SourceFeed` configuration for iRozhlas/iDnes.** Research and add the real
  per-section/`?c=` feed URLs for the two sources whose currently-configured feeds carry no inline
  signal at all. Blocked by 78 (needs `SourceFeed.category` to exist).
- **80 — Wire `chromeNav` rubrics to a real `/category/:slug` browse page.** Replace the dead
  `to: '#'` placeholders once real category data exists. Blocked by 78.
