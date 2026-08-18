# 02 — Source identity: adopt `Source`/`SourceFeed` now?

Type: grilling
Status: resolved
Blocked by: none — can start immediately

## Question

The audit's **P0-6** claims the "one Source = one Coverage per Analysis" invariant from `CONTEXT.md` is unenforced in practice, because `outlet` identity is generated four incompatible ways (`analysisService.ts:139` and `:224` via `extractDomain()`, `rss.ts` via `RSS_FEEDS[].outlet`, `gdelt.ts:39` a third way) — causing Agreement over-counting and Unique-Reporting under-counting whenever the same outlet's coverage lands under two different `outlet` strings. Audit §7.1/§8.1/§8.8/§9.1 proposes a `Source`/`SourceFeed` table pair, a single `resolveSource(url)` function, and a backfill+dedup migration it calls "the riskiest migration in the whole plan."

This is framed as a correctness bug independent of scale — decide:

1. Is P0-6 real? (Verify against current `analysisService.ts`, `rss.ts`, `gdelt.ts` — the audit predates whatever's landed since.)
2. If real, is the `Source`/`SourceFeed` table model (§7.1, §8.1) the right fix, or is a lighter-weight fix possible (e.g. a single canonicalization function without a new table) given current source count (8 outlets, per `config/rssFeeds.ts`)?
3. Also folds in **P1-13** (scraping has no concurrency/robots.txt/backoff, JSDOM blocks the event loop) since `Source.maxRps`/`honorRobots` in the audit's proposed schema is where that would live — decide whether per-host politeness needs the same migration or can be added independently.
4. If accepted: what does the migration's step 4 (§8.8 — measuring how many existing Analyses have duplicate-source Coverage before dedup, since that number becomes unrecoverable after dedup) actually show on this DB? That number is also the answer to open question 1 on the map ("how bad was P0-6, really") and worth capturing in the resolution.

## Notes

Audit's own words: "Krok 4 je zároveň odpověď na otázku, jak vážný P0-6 reálně byl — a je to číslo, které stojí za to si poznamenat před dedupem, protože po kroku 5 už ho nezjistíte." (Step 4 is also the answer to how serious P0-6 really was — a number worth recording before dedup, because after step 5 you can't find it anymore.)

## Answer

Confirmed real and worse than the audit's summary: 3 outlet-generation paths existed (`extractDomain()` in `analysisService.ts` → raw hostname; RSS ingestion → friendly name from static config; GDELT → friendly name via a domain lookup with a raw-domain fallback), so the same real outlet could produce different `outlet` strings depending on discovery path. Worse, Ingestion's own attach path (`ingestionService.ts`) had **no duplicate-source check at all** — the human-seeded path's existing dedup check was undermined by naming, but Ingestion never had one to undermine.

The dev DB was completely empty (0 Analyses/Coverage/Stories) — the audit's careful backfill-then-dedup migration dance (§8.8) didn't apply; `Coverage.outlet`/`PendingAddition.outlet` were replaced directly with a `sourceId` FK, no data to lose.

Scope decided: **full `Source`/`SourceFeed` tables now** (not the lighter canonical-function-only option this session initially recommended) — user's call, given the project's future-growth framing. Built:

- `Source` (`name` unique, `domains String[]`) and `SourceFeed` (`sourceId`, `url` unique) models, seeded with the 8 outlets previously hardcoded in `config/rssFeeds.ts` (now deleted) via the migration itself.
- `sourceResolver.ts` — `resolveSourceByUrl`/`resolveSourceByDomain`, most-specific-suffix-first domain matching against `Source.domains`, auto-creating an "unverified" Source (upsert-safe) for any not-yet-configured domain instead of silently dropping it.
- `rss.ts` rewritten to read feed URLs from `SourceFeed` (DB) instead of the static config array — adding a source no longer requires a deploy, the actual point of the table.
- A DB-level partial unique index (`Coverage`, `(analysisId, sourceId) WHERE excluded = false`) enforcing the "one Source, one Coverage" invariant for the first time — hand-written in the migration since Prisma's schema DSL can't express partial indexes.
- Ingestion's attach path (`ingestionService.ts`) now checks for an existing non-excluded Coverage from the same Source before attaching, mirroring the check `createAnalysis`'s confirm-coverage path already had — closing the gap that existed independent of the naming-consistency bug.

P1-13 (no robots.txt/rate-limiting/backoff) confirmed real while investigating this ticket's scraping call sites, but is a distinct problem — split into [Polite scraping](10-polite-scraping.md) rather than bundled here. `Source.honorRobots`/`Source.maxRps`-style fields deliberately not added to the schema yet, since nothing would read/write them until that ticket is resolved.

Implemented on `ticket/audit-02-source-identity-model`.
