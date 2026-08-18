# 02 — Source identity: adopt `Source`/`SourceFeed` now?

Type: grilling
Status: open
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
