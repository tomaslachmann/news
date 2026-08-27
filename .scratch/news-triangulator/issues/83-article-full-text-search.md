# 83 — Full-text search over Article content

**Type:** feature

**What to resolve:** User request, following a look at `SearchPage.tsx`: the site's one "Hledat"
nav entry only searches `Entity.canonicalName` (`GET /api/entities`, `pg_trgm` fuzzy match) — a
reader can't find an Article by what it actually says unless the search term happens to also be an
entity's name. This ticket adds real content search alongside it, on the same `/search` page (one
"Hledat" entry point, two result sections — not a second nav entry/route).

**What gets indexed, and why:** `Analysis.seedHeadline` + `SynthesisResult.headline` (tool-authored,
ADR 0021) + every one of the four Analysis Dimensions' `.prose` field (`agreement`/`contradiction`/
`uniqueReporting`/`framing` — `DimensionItem`/`ContradictionItem`, shared). Deliberately **not**
`Coverage.extractedText` (the raw per-source scrape — noisy, duplicated near-verbatim across every
source covering the same event, and not what this tool is for per CLAUDE.md: triangulated,
verified content, not a source-article mirror). Deliberately **not** `Attribution.czechQuote` (raw
quoted excerpts) — a real, reasonable v2 ("search original quotes"), left out here to keep this
ticket's scope to what a reader searching for "what happened" actually wants: the tool's own
synthesized claims. Deliberately **not** the Narrative document's own prose — redundant per ADR
0012 ("the Narrative... never introduces, alters, or contradicts" the Dimensions), so indexing
Dimensions already covers everything the Narrative would say.

**How:** Postgres full-text search (`tsvector`/`to_tsvector`/`ts_rank`), no new infra, no
third-party search service — the same "no new dependency unless the thing genuinely needs one"
posture as ticket 81 (ticket 82's `web-push` is the counter-example: this one doesn't need a real
library any more than ticket 81 did). Config `'simple'` (lowercase + tokenize, no stemming) —
Postgres ships no Czech text-search config, so this is an honest, disclosed limitation: searching
"rozpočet" won't match text containing only "rozpočtu". Same class of approximate-not-exact
tradeoff the existing `pg_trgm` entity search already accepts.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] `prisma/schema.prisma`: `SynthesisResult.searchText String?` (nullable, no backfill — ADR
      0021's convention, existing rows simply don't show up in search until their Analysis is
      reprocessed). Computed once, application-side, at the single real write point
      (`completeAnalysisWithSynthesis`, `repositories/analysis.ts` — `analysisStream.ts`'s
      `runAnalysisStream` is its only real caller) by flattening `seedHeadline` + `headline` +
      every Dimension item's `prose` into one plain-text string.
- [ ] Migration (raw SQL, matching this codebase's own convention for anything Prisma's schema DSL
      can't express — see the `pg_trgm` GIN index migration for entity search): add `searchText`,
      then a DB-generated `"searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple',
      coalesce("searchText", ''))) STORED` column with a GIN index. No extension needed (`tsvector`
      is Postgres core, unlike `pg_trgm`).
- [ ] `GET /api/search?q=...` (public, COMPLETE-only — same posture as `/api/articles`): a bounded
      top-N (`DEFAULT_PAGE_SIZE`, no "load more" — a ranked relevance list doesn't paginate the way
      a newest-first feed does; a future ticket can revisit if a real need shows up) list ranked by
      `ts_rank`, using `plainto_tsquery('simple', $1)`. Same two-step "raw SQL picks the ranked
      ids, then hydrate through the existing `ANALYSIS_LIST_ROW_INCLUDE`/`toAnalysisListRow`
      pairing" pattern ticket 80's `findAnalysesByCategoryPage` already established, so a search
      result row looks and behaves exactly like `/articles`/`/category/:slug`.
- [ ] `SearchPage.tsx`: add a second results section for this query (reusing `ArchiveRow`, ticket
      80/81's own precedent) alongside the existing entity results — one query, two independent
      result sets, both real. Empty-state copy must distinguish "no entities match" from "no
      articles match" from "neither" (never claim zero results when one section actually has some).
- [ ] Tests: the `searchText`-flattening function (empty dimensions, a mix of populated/empty
      prose, headline present vs. absent), the ranked-search repository query's SQL shape (mocked,
      same convention as ticket 80's category-filter tests — no real-DB integration suite exists).
- [ ] Manually verify against the real Docker backend the way ticket 82 did (insert one throwaway
      COMPLETE Analysis + SynthesisResult with real Czech `searchText`, hit `GET /api/search`,
      confirm ranking and that an unrelated term returns nothing) — this ticket's backend is fully
      verifiable that way, unlike ticket 82's browser-only gap.
- [ ] Typecheck + full test suites pass. `/code-review` clean.
