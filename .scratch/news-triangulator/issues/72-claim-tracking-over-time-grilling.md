# 72 — Grilling: claim-tracking-over-time capability

**Type:** grilling

**Status:** done

**What to resolve:** Split off ticket 66 (chart/data `NarrativeBlock` type). That session shipped a
source-comparison chart (what each source reported for one claim, within a single Analysis) using
`NarrativeValueRef.sourceIds`, but explicitly could not ship the original Thread trend-chart use
case — a single numeric claim's value tracked across multiple *days* (e.g. a budget balance
narrowing from 52bn to 18bn CZK over six days) — because nothing in this codebase links a value
across different `Analysis` rows. `Analysis.storyId` is `@unique` (1:1 with `Story`); each Analysis
is its own isolated snapshot, and `NarrativeValueRef` has no date field.

This ticket is where that capability gets designed: what makes two `NarrativeValueRef`s from
different member Analyses of the same Thread "the same underlying claim" worth plotting on one
trend line.

**Blocked by:** none — purely a design question; the Thread aggregate (member Analyses, `eventTime`
ordering) already exists.

Not yet decided:

1. How is "the same claim" identified across two different Analyses? Candidates: matching on the
   same entity + the same dimension item's semantic slot (e.g. both are "state budget balance"
   assertions), an LLM judgment at Thread-recompute time, or some other linking key — nothing today
   groups dimension items across Analyses by what they're claims *about*, only within one Analysis.
2. Where does this run — as part of `thread.recompute` (ticket 17's existing job, re-evaluated each
   time a new member joins) or a separate pass?
3. Does linking two values across Analyses as "the same claim" require an LLM call, and if so under
   what verification discipline (does it need something like `verifyNarrativeDocumentOrThrow`, or
   can it stay a smaller, more mechanical judgment)?
4. Once a tracked series exists, what's its shape — is it a new Prisma model (a `ClaimSeries` row
   linking N `NarrativeValueRef`s with dates), or a computed-on-read view with no persisted table?
5. Ticket 66's `chart` block already reserves a `kind: 'line'` for this — once this ticket answers
   the above, does wiring `'line'` up to real data need its own implementation ticket (mirroring
   ticket 73's pattern for the `'bar'` case), or does it fold into whatever this ticket produces?

## Answer

**Grilling session held 2026-08-26.**

Surveyed current state before the session: `NarrativeValueRef` (`{ id, text, sourceIds,
normalizedValue, unit }`) has no entity reference and no date; `czechNumeral.ts`'s numeral parsing is
a stateless, per-Analysis, per-call operation with zero shared identifier across Analyses — the same
real figure reported identically on two different days produces two completely unrelated
`NarrativeValueRef` rows. However, `NarrativeAssertion` (`{ dimensionItemId, entityRefs, sourceRefs,
valueRefs }`) already links a value's id together with entity ids in one record when both are cited
supporting the same dimension item — a real, existing co-occurrence signal. `Entity.id` is confirmed
genuinely stable/global across Stories (a cuid row keyed by `type:slugify(canonicalName)`, already
reused as a cross-time join key by the homepage's entity-mention trend stats) — unlike
`DimensionItem.id`, which is scoped to one Analysis's Synthesis run. `findFollowUpComponent` bounds
Thread membership at CTE depth 50 (a pathological-graph safeguard, not a hard "max members" count).

Decisions reached with the user:

- **Identity: candidate-narrow via existing assertion co-occurrence, then LLM judges continuation.**
  No new extraction/tagging pass is needed — `NarrativeAssertion.entityRefs ∩ valueRefs` already
  tells us which entities a value's supporting assertion(s) cite alongside it. That narrows candidates
  (an entity commonly has more than one distinct tracked number, e.g. "budget deficit" vs. "staff
  count", so entity-matching alone isn't sufficient), and an LLM judges, among same-candidate-entity
  values across a Thread's members, which ones continue the same tracked claim. Reusing existing
  structural data here (unlike ticket 67's contradiction-matching, where nothing existed at all)
  meaningfully shrinks what the LLM has to reason about.
- **Trigger: a new, separate background job**, not folded into `thread.recompute` — same reasoning as
  ticket 67 (keeps `thread.recompute`'s cheap/deterministic retry policy intact, gets its own
  LLM-flakiness-tuned retry policy).
- **Job design: incremental, not full re-evaluation.** Each run only judges the *newest* member's
  values against already-persisted series — it never revisits past linking decisions. This keeps cost
  linear in Thread size (not quadratic) and avoids a chart's historical data reshuffling between page
  loads if a later run judged the whole history differently.
- **Data shape: a new persisted Prisma model** (`ClaimSeries`-equivalent, linking value ids + analysis
  ids + dates) — not a computed-on-read view. The LLM judgment is expensive and its incremental
  decisions need to be sticky, not rederived from scratch on every request.
- **Verification: dangling-reference check + retry-once-then-fall-back.** Same discipline as ticket
  67 — verify the series' linked value/analysis ids resolve to real data; on failure, retry once, then
  fall back to treating the new value as starting its own series rather than blocking. The residual
  risk of the LLM linking two genuinely different claims together is an accepted tradeoff of choosing
  LLM judgment at all (same as ticket 67's contradiction-matching) — no mechanical check can catch a
  wrong-but-referentially-valid link.
- **Scope: split into backend + frontend tickets**, mirroring tickets 68/69. This is a comparably
  sized feature to Thread detail itself (new model, new job, new LLM pass, new verification, plus
  frontend wiring) — splitting keeps each ticket's diff reviewable. The line-chart trend view is
  Thread-specific only (a single Article has no "days" to trend across), unlike the bar chart from
  ticket 73 which serves both Article and Thread.

Follow-up tickets filed from this session:

- **75 — Claim-tracking-over-time backend.** `ClaimSeries` Prisma model, the new background job,
  entity-co-occurrence candidate narrowing + LLM continuation judgment, dangling-ref verification,
  API exposure of series data. Not blocked.
- **76 — Wire `kind: 'line'` chart into the Thread page.** Consumes ticket 75's series data via
  ticket 73's `chart` block (`kind: 'line'`). Blocked by 75 (and assumes ticket 73 already shipped the
  block type/renderer).
