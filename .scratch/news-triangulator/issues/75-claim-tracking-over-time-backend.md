# 75 — Claim-tracking-over-time backend

**Type:** feature

**What to resolve:** Follow-up from ticket 72's grilling session. Builds the capability to link a
numeric claim's `NarrativeValueRef` across a Thread's multiple member Analyses over days, so a real
day-over-day trend chart becomes possible (ticket 76 consumes this). Candidate-narrows via existing
`NarrativeAssertion.entityRefs ∩ valueRefs` co-occurrence (no new extraction pass needed), then an
LLM judges actual continuation among same-candidate-entity values. Runs incrementally, in its own
background job, separate from `thread.recompute`.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] New Prisma model (e.g. `ClaimSeries` + `ClaimSeriesMember`): a series has a stable id and a
      Thread reference; each member row links one `NarrativeValueRef` id + its owning `Analysis` id +
      that Analysis's `eventTime`/date, so the series can be read back in date order.
- [ ] New pg-boss job (e.g. `thread.trackClaimSeries`), separate from `thread.recompute`, with its own
      retry policy suited to LLM flakiness. Enqueued from the same trigger points as `thread.recompute`
      (or chained off its completion) — same race consideration as ticket 74's job (needs to read the
      Thread/ThreadMember upsert `thread.recompute` just wrote).
- [ ] Candidate narrowing: for the newest member's `NarrativeValueRef`s, find the `NarrativeAssertion`(s)
      whose `valueRefs` include that value's id, collect their `entityRefs`, and find existing
      `ClaimSeries` for this Thread whose most recent member's value shares at least one of those
      entity ids (via the same assertion-co-occurrence lookup on the series' existing member).
- [ ] LLM judgment: among those candidate series (if any), decide whether the new value continues one
      of them or starts a new series. **Incremental only** — never re-evaluates previously-linked
      members; a run only ever adds the newest member's values to existing series or starts new ones.
- [ ] Verification: dangling-reference check on the series member being written (real `NarrativeValueRef`
      id, real `Analysis` id, both belonging to a visible member of this Thread) — retry the LLM call
      once on failure, then fall back to starting a new series for that value rather than blocking the
      job.
- [ ] API: expose series data for a Thread (e.g. via `GET /api/thread/:slug` or a dedicated endpoint —
      pick based on what ticket 76's frontend needs) as an ordered `{ date, value, unit, sourceIds }[]`
      per series, ready to feed a `kind: 'line'` chart block.
- [ ] Tests: candidate-narrowing logic (same-entity match via assertion co-occurrence), the
      incremental-only property (a second job run doesn't touch already-linked members), verification
      check (valid link, dangling ref, retry-then-fallback-to-new-series), integration test for the job's
      trigger/enqueue path.
- [ ] Typecheck + full test suites pass. `/code-review` clean.
