# 75 — Claim-tracking-over-time backend

**Type:** feature

**What to resolve:** Follow-up from ticket 72's grilling session. Builds the capability to link a
numeric claim's `NarrativeValueRef` across a Thread's multiple member Analyses over days, so a real
day-over-day trend chart becomes possible (ticket 76 consumes this). Candidate-narrows via existing
`NarrativeAssertion.entityRefs ∩ valueRefs` co-occurrence (no new extraction pass needed), then an
LLM judges actual continuation among same-candidate-entity values. Runs incrementally, in its own
background job, separate from `thread.recompute`.

**Blocked by:** none.

**Status:** done

## Implementation notes

**A second job trigger point turned out to be necessary, not just an implementation choice between
two equivalent options.** `narrative.generate` and `thread.recompute` are fully decoupled background
jobs (ADR 0028) with no ordering guarantee between them — a newest member's Narrative (which
`claimSeriesJob.ts` needs, since `NarrativeValueRef`/`NarrativeAssertion` only exist there) can very
plausibly not exist yet when `thread.recompute`'s own chained enqueue runs. `narrativeJob.ts` now
also enqueues `thread.trackClaimSeries` on its own successful completion, for a Story that's already
a Thread member. The job leaves a member with `narrative: null` unprocessed (not "nothing to track")
so whichever trigger fires last for that member is the one that actually finds it ready — same
self-healing-via-idempotent-re-enqueue posture this codebase already uses for `thread.recompute`
itself (ADR 0028's "a missed enqueue here self-heals").

**Denormalized `text`/`normalizedValue`/`unit`/`sourceIds`/`entityKeys` onto `ClaimSeriesMember`**,
beyond what the ticket's own model sketch listed (id + Thread ref + value id + Analysis id +
eventTime) — both the read API and candidate-narrowing need these on every access, and re-parsing a
member's Narrative JSON for it every time would mean either re-fetching each series' backing Analysis
row every job run, or repeating an expensive query at read time. All fields are immutable once
written (a Narrative is generated once and never regenerated — CONTEXT.md), so there's no staleness
risk to denormalizing.

**Added a same-unit requirement to candidate narrowing**, beyond the ticket's own "shares at least
one entity id" — reusing ticket 73's own unit-consistency principle (a chart/series comparing a death
toll to a currency amount is an unearned equivalence). Entity-key overlap alone already isn't
sufficient to conclude continuation (ticket 72's Answer); this narrows the LLM's actual candidate set
further before it has to make that judgment call.

**Verification is per-value sanitization, not the retry-once-then-throw/empty disciplines the two
prior LLM passes in this codebase use.** The only LLM-emitted field here is `seriesId` — `valueRefId`/
`analysisId` are always the job's own already-real data, never dangling-ref candidates the way
Narrative's entity/source/value refs or ticket 74's `relatedItems` are. A `seriesId` that's invalid
for its own value's candidate list is defaulted to `null` (start a new series) individually, so one
bad entry in a batch never discards every other value's already-correct link — see
`claimSeriesLinkingPass.ts`'s own doc comment for why this differs from `threadOpenQuestionsPass.ts`'s
all-or-nothing empty fallback (starting an unwanted extra series is a much smaller, inert mistake than
silently dropping unrelated correct links).

**`/code-review` (medium) finding, fixed:** nothing prevented two of the same member's trackable
values from both linking to the same `seriesId` — `ClaimSeriesMember`'s own
`@@unique([seriesId, analysisId])` means one member can only ever contribute one point to a given
series, so the second `addClaimSeriesMember` call would throw a unique-constraint violation, the job
would retry up to `LLM_JOB_RETRY_POLICY`'s limit and then permanently fail, and — since the first
value's write already committed — `findProcessedAnalysisIdsForThread` would report this `analysisId`
as fully processed on every future run, silently losing every value after the first forever. Fixed in
`claimSeriesLinkingPass.ts`: `findFailures` now flags a same-batch `seriesId` collision (giving the
retry a chance to fix it), and `sanitize` unconditionally enforces "first-claimed-wins" as the final
safety net regardless of what the LLM returns.

**`upsertThreadFromComponent`'s `changed` signal (ticket 74) now gates two chained jobs, not one** —
`thread.trackClaimSeries` reuses the same "skip on a no-op recompute" guard `thread.
synthesizeOpenQuestions` established, for the same reason (a duplicate recompute must stay a cheap
no-op, never chain a second billed LLM call).

- [x] New Prisma models `ClaimSeries` + `ClaimSeriesMember`: a series has a stable id and a Thread
      reference; each member row links one `NarrativeValueRef` id + its owning `Analysis` id + that
      Analysis's `eventTime`, plus denormalized `text`/`normalizedValue`/`unit`/`sourceIds`/
      `entityKeys` (see notes) so reading a series back or candidate-narrowing a future member never
      needs to re-parse a Narrative document.
- [x] New pg-boss job `thread.trackClaimSeries`, separate from `thread.recompute`, reusing
      `LLM_JOB_RETRY_POLICY`. Chained off `thread.recompute`'s own successful upsert **and** enqueued
      from `narrative.generate`'s own completion (see notes — a second trigger point turned out to be
      necessary, not just "or chained off completion").
- [x] Candidate narrowing (`claimSeriesMatching.ts`): for a member's trackable `NarrativeValueRef`s,
      find the `NarrativeAssertion`(s) whose `valueRefs` include that value's id, collect their
      `entityRefs`' stable `entityKey`s, and match against existing `ClaimSeries`' own most-recent
      member (read directly off denormalized columns) sharing at least one entity key **and** the
      same unit (see notes on this addition).
- [x] LLM judgment (`claimSeriesLinkingPass.ts`): among a value's candidate series (if any), decides
      which one (if any) it continues. **Incremental only** (`claimSeriesJob.ts`) — a run only
      considers members missing from `findProcessedAnalysisIdsForThread`, never re-links an
      already-written member.
- [x] Verification: the LLM-emitted `seriesId` is checked against that specific value's own candidate
      list (never a global set); retry once, then sanitize per-value to "start a new series" rather
      than discarding the whole batch (see notes — `valueRefId`/`analysisId` themselves need no
      dangling-ref check, since the job constructs them directly from real data, never from LLM
      output).
- [x] API: `ThreadDetail.claimSeries` (via `GET /api/thread/:slug`) — every `ClaimSeries` unfiltered,
      each an ordered `{ date, value, unit, sourceIds }[]`, ready for ticket 76's `kind: 'line'` chart.
- [x] Tests: candidate-narrowing/trackable-value unit tests, linking-pass verification/sanitization
      tests, job tests (incremental-only property, narrative-not-ready skip, LLM-call-skipped-when-
      no-candidates), integration tests for the new repository queries.
- [x] Typecheck + full test suites pass (656 backend unit + 109 integration + 27 frontend).
      `/code-review` clean after fixing the same-batch seriesId collision finding (see notes).
