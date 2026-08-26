# 77 — Grilling: article/story categorization

**Type:** grilling

**Status:** ready-for-agent

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

*Not yet run.*
