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

- [x] `prisma/schema.prisma`: `SynthesisResult.searchText String?` (nullable, no backfill — ADR
      0021's convention, existing rows simply don't show up in search until their Analysis is
      reprocessed). Computed once, application-side, at the single real write point
      (`completeAnalysisWithSynthesis`, `repositories/analysis.ts` — `analysisStream.ts`'s
      `runAnalysisStream` is its only real caller) by flattening `seedHeadline` + `headline` +
      every Dimension item's `prose` into one plain-text string.
- [x] Migration (raw SQL, matching this codebase's own convention for anything Prisma's schema DSL
      can't express — see the `pg_trgm` GIN index migration for entity search): add `searchText`,
      then a DB-generated `"searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple',
      coalesce("searchText", ''))) STORED` column with a GIN index. No extension needed (`tsvector`
      is Postgres core, unlike `pg_trgm`).
- [x] `GET /api/search?q=...` (public, COMPLETE-only — same posture as `/api/articles`): a bounded
      top-N (`DEFAULT_PAGE_SIZE`, no "load more" — a ranked relevance list doesn't paginate the way
      a newest-first feed does; a future ticket can revisit if a real need shows up) list ranked by
      `ts_rank`, using `plainto_tsquery('simple', $1)`. Same two-step "raw SQL picks the ranked
      ids, then hydrate through the existing `ANALYSIS_LIST_ROW_INCLUDE`/`toAnalysisListRow`
      pairing" pattern ticket 80's `findAnalysesByCategoryPage` already established, so a search
      result row looks and behaves exactly like `/articles`/`/category/:slug`.
- [x] `SearchPage.tsx`: add a second results section for this query (reusing `ArchiveRow`, ticket
      80/81's own precedent) alongside the existing entity results — one query, two independent
      result sets, both real. Empty-state copy must distinguish "no entities match" from "no
      articles match" from "neither" (never claim zero results when one section actually has some).
- [x] Tests: the `searchText`-flattening function (empty dimensions, a mix of populated/empty
      prose, headline present vs. absent), the ranked-search repository query's SQL shape (mocked,
      same convention as ticket 80's category-filter tests — no real-DB integration suite exists).
- [x] Manually verify against the real Docker backend the way ticket 82 did (insert one throwaway
      COMPLETE Analysis + SynthesisResult with real Czech `searchText`, hit `GET /api/search`,
      confirm ranking and that an unrelated term returns nothing) — this ticket's backend is fully
      verifiable that way, unlike ticket 82's browser-only gap.
- [x] Typecheck + full test suites pass. `/code-review` clean.

## Implementation notes

**This project turns out to already have a real testcontainers-based integration suite** (`npm run
test:integration`, `packages/backend/test/integration/*.test.ts`, `@testcontainers/postgresql`) —
line 59's "no real-DB integration suite exists" was wrong, carried over from an assumption made
while filing the ticket, not verified against the repo. Discovered mid-implementation when the
`completeAnalysisWithSynthesis` signature change (adding the required `searchText` param) broke
compilation in 13 call sites across `test/integration/*.test.ts`. Since it exists, used it
properly: added a dedicated `findAnalysesBySearch` integration test
(`test/integration/synthesisResult.test.ts`) against a real, freshly-migrated Postgres — confirms
prose-content matching, `ts_rank` ordering (a prose-and-headline match ranks above a
headline-only mention), and that an unrelated term returns nothing. All 14 integration files / 109
tests (including the 13 patched call sites) pass, and — genuinely useful side effect — every one of
this project's 36 migrations, including this ticket's own hand-written one, applies cleanly to a
brand-new Postgres from scratch.

**A `prisma db push` mid-ticket silently dropped the unrelated `entity_canonicalName_trgm_idx`
GIN index** (ticket 78's own full-text search index for entity name search) — `db push` diffs the
*entire* live schema against `schema.prisma`, not just the model being changed, and drops any
DB-level object (an index, in this case) it has no way to know about because it isn't declared in
`schema.prisma` (the same reason it isn't declared: Prisma's schema DSL can't express an
operator-class GIN index). Caught immediately by checking `pg_indexes`, recreated by hand. Avoided
for the rest of this ticket: applied this ticket's own generated-column migration via raw SQL
(`docker compose exec db psql < migration.sql`) instead, exactly like the `SourceFeed` category
seed data in tickets 78/79 already had to. Worth remembering for any future ticket that touches
schema.prisma in this repo: prefer applying migration SQL directly over `prisma db push` whenever
hand-authored, unmodeled DB objects exist (there are now three: the `pg_trgm` index, `Coverage`'s
partial unique index, and this ticket's own generated `tsvector` column).

**Verified live against the real Docker backend** (rebuilt — built images, not bind-mounted, same
gotcha as ticket 82) with one throwaway `Story`/`Analysis`/`SynthesisResult` row: `GET
/api/search?q=rozpočet` correctly matched and ranked it; `q=fotbal` (unrelated) returned `[]`; and
— confirming the documented `'simple'`-config limitation is real, not just claimed — `q=rozpočtu`
(the inflected form, never typed into `searchText` verbatim) also returned `[]`. Cleaned up
afterward.
