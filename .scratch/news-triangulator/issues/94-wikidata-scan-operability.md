# 94 — entity → Wikidata scan: run-now script + honest empty state

**Type:** chore

**What to resolve:** User report after merging ticket 93 (verbatim): "mergnuto, ale nevidim tam nic
ve fronte, je tam napsany ze je vsechno automaticky sloucene, ale kdyz kliknu na jakoukoliv entitu
v UI tak tam nic neni" — the suggestion queue is empty, the page says everything was auto-linked,
but no entity actually has a Wikidata link.

The queue is empty because the scheduled `entity.wikidata.scan` job runs once a day (04:30
Europe/Prague) and — by design (ADR 0042) — has no on-boot `send`, so it has simply not run yet
since the deploy. Two real problems fall out of that:

1. **The empty-state copy lies.** `AdminEntityWikidataSuggestionsPage` renders *"Žádné návrhy —
   vše jednoznačné bylo propojeno automaticky."* whenever the list is empty, including when the
   scan has never run. It should not claim an outcome it can't know.
2. **No way to run the scan on demand.** The user chose "scheduled batch job" over an admin
   button (ticket 93), which is still right for steady-state — but there's no operator escape
   hatch to kick a first run or debug one, the way `scripts/backfillNarratives.ts` /
   `regenNarrativeForAnalysis.ts` exist for their jobs.

**Blocked by:** none.

**Status:** todo

- [x] `packages/backend/src/scripts/runWikidataScan.ts` — one-off, same ad hoc convention as the
      other `scripts/*.ts`: builds the real `EntityWikidataScanDeps` (repos + `wikidataSearchClient`
      + `reconcile` + a best-effort `enqueueJob` for `entity.image.enrich`) and runs
      `runEntityWikidataScan` in-process (no pg-boss round-trip, no worker needed), printing the
      `{ scanned, autoLinked, queued, skipped, remaining }` result. Honours the existing
      `WIKIDATA_SCAN_*` env overrides. Header comment documents the `SERVICE_NAME=scripts npx tsx …`
      invocation.
- [x] Fix the empty-state copy: when `suggestions.length === 0`, say something that's true whether
      or not the scan has run (e.g. *"Fronta je prázdná — žádné entity nečekají na rozhodnutí.
      Jednoznačné shody se propojují automaticky při denní kontrole."*). No claim that a specific
      entity was auto-linked.
- [x] Per-entity trace logging in `entityWikidataScanService`: an `info` line for every entity the
      scan touches — `auto-linked` (already present), `queued for review` (with `candidateCount`
      and a `reason` naming which gate condition failed, or "reconciliation nesouhlasí"), and
      `skipped` (with why: no candidate / all Wikimedia-internal). Previously only auto-links and
      the run summary were logged, so "why didn't entity X link?" had no answer in the logs. Same
      `entity.wikidata.scan` namespace / rotating sink as every other job (ticket 86).
- [x] Typecheck + lint + suites green. One new test for the queued-reason log line;
      `scripts/runWikidataScan.ts` itself untested per repo convention (`scripts/*.ts` are).

## Implementation notes (2026-08-28)

- Root cause confirmed by running the new script against the dev DB: the scheduled job had simply
  never fired since deploy. First manual run — `scanned 25, autoLinked 2, queued 21, skipped 2,
  remaining 74` — auto-linked *Plzeňský Prazdroj* (Q948831) and *Česká národní banka* (Q251062);
  21 entities are now in the review queue.
- `runWikidataScan.ts` ends with `process.exit(0)` — the `entity.image.enrich` enqueue on an
  auto-link opens a pg-boss pool that otherwise keeps the process alive (same gotcha as
  `backfillNarratives.ts`, which doesn't bother exiting).
- The scan *was* already logged like everything else (namespaced pino → stdout + rotating NDJSON);
  what was missing was a line per *non*-auto-linked entity. Added.
