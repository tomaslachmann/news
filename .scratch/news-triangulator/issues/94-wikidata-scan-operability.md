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

- [ ] `packages/backend/src/scripts/runWikidataScan.ts` — one-off, same ad hoc convention as the
      other `scripts/*.ts`: builds the real `EntityWikidataScanDeps` (repos + `wikidataSearchClient`
      + `reconcile` + a best-effort `enqueueJob` for `entity.image.enrich`) and runs
      `runEntityWikidataScan` in-process (no pg-boss round-trip, no worker needed), printing the
      `{ scanned, autoLinked, queued, skipped, remaining }` result. Honours the existing
      `WIKIDATA_SCAN_*` env overrides. Header comment documents the `SERVICE_NAME=scripts npx tsx …`
      invocation.
- [ ] Fix the empty-state copy: when `suggestions.length === 0`, say something that's true whether
      or not the scan has run (e.g. *"Fronta je prázdná — žádné entity nečekají na rozhodnutí.
      Jednoznačné shody se propojují automaticky při denní kontrole."*). No claim that a specific
      entity was auto-linked.
- [ ] Typecheck + lint + the existing suites still green (no new test needed for an ad hoc script,
      per repo convention — `scripts/*.ts` are untested; the scan logic itself is already covered
      by `entityWikidataScanService.test.ts`).
