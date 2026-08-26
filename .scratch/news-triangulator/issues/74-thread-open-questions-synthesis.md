# 74 — Implementation: thread-level open-questions synthesis

**Type:** feature

**What to resolve:** Follow-up from ticket 67's grilling session. Replaces the mock/placeholder
"open questions" rail ticket 65 shipped on the Thread page with a real synthesis: a new background
job runs an LLM pass reading every Thread member's `contradiction`/`agreement`/`uniqueReporting`
dimension items and prose, judging which tensions are still genuinely open, and producing a list of
open questions each citing the specific `{ analysisId, dimensionItemId }` it's about.

**Blocked by:** none — the Thread aggregate, member Analyses, and dimension items all already exist.

**Status:** done

## Implementation notes

**Chained the job off `thread.recompute`'s own successful upsert, and taught
`upsertThreadFromComponent` to report whether it actually did anything.** `thread.recompute`'s own
docstring already documents that a duplicate recompute for an unchanged component is a cheap no-op
— that stops being true the moment a real, billed LLM call gets chained off every recompute
unconditionally. `upsertThreadFromComponent` now returns `{ thread, changed: boolean }` instead of
a bare `Thread`; `thread.synthesizeOpenQuestions` is only enqueued when `changed` is true. Touches
ticket 17's already-shipped code (worker.ts, the job's own deps type, and every existing
`upsertThreadFromComponent` call site/test), but the alternative — enqueueing unconditionally — was
a real, ongoing cost regression, not a hypothetical one.

**Job design is incremental, not full re-evaluation, at the LLM-prompt level too** — every run
re-sends the *whole* Thread's dimension data (not just the newest member) and asks the LLM to
re-judge the complete open-questions set from scratch, rather than trying to patch a prior result.
This is simpler than true incremental accumulation and was judged good enough given Thread size is
already bounded (`findFollowUpComponent`'s own depth-50 safeguard) — ticket 72's Answer reserves
genuine incremental persistence (a `ClaimSeries` model) for the harder claim-tracking problem, where
re-deriving everything from scratch every time isn't an option; this rail's LLM cost is small enough
that re-running the full judgment each time was the simpler, acceptable choice.

- [x] New pg-boss job (`thread.synthesizeOpenQuestions`), separate from `thread.recompute`, reusing
      `LLM_JOB_RETRY_POLICY` (not `thread.recompute`'s tight DB-only 10×/5s policy). Chained off
      `thread.recompute`'s own successful upsert (see notes) rather than the same trigger points —
      avoids the race against the Thread/ThreadMember upsert this job needs to read.
- [x] New service (`threadOpenQuestionsPass.ts`): gathers every visible (COMPLETE) member's
      `contradiction`/`agreement`/`uniqueReporting` items + prose, calls the LLM to produce open
      questions, each shaped `{ question: string, detail: string, relatedItems: { analysisId: string, dimensionItemId: string }[] }`.
      Runs on every member addition, not just Thread creation (and skipped for a duplicate/no-op
      recompute — see notes).
- [x] Dangling-reference verification (`findOpenQuestionsVerificationFailures`): each `relatedItems`
      entry must resolve to a real dimension item on a real (visible) member Analysis of this
      Thread, and every question must cite at least one — same shape as Narrative's existing ref
      checks. On verification failure: retry the LLM call once, then fall back to an empty result
      (empty rail) — does not fail the job chain or block the Thread page.
- [x] Persisted as a `Json` column on `Thread` (`openQuestions`, `@default("[]")`, non-nullable) —
      a denormalized snapshot is enough; the Thread detail read path never needs to join dimension
      items back in.
- [x] `threadDetail.ts` repository/mapper: `ThreadDetailRow.openQuestions` (raw) →
      `toThreadDetail`'s `ThreadOpenQuestionItem[]` (question/detail only, `relatedItems` traceability
      stays backend-internal).
- [x] Frontend Thread page: `ThreadOpenQuestionsRail` now takes real `openQuestions` data, with an
      honest "nothing open" empty state (same for never-run and ran-and-found-nothing).
- [x] Tests: verification-check unit tests (valid ref, dangling ref/analysisId, missing-citation,
      retry-then-fallback-to-empty, raw-LLM-failure-propagates), job handler tests (skip states,
      happy path, failure propagation), mapper tests, integration tests for the new repository
      queries and for `upsertThreadFromComponent`'s new `changed` signal.
- [x] Typecheck + full test suites pass (623 backend unit + 105 integration + 27 frontend).
      `/code-review` clean.
