# 72 — Grilling: claim-tracking-over-time capability

**Type:** grilling

**Status:** ready-for-agent

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

**Status:** ready-for-agent

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

*Not yet run.*
