# 07 — `Thread` aggregate: now or deferred?

Type: grilling
Status: open
Blocked by: 04

## Question

The audit's §7.4 argues the just-shipped `StoryRelation` edges (tickets 34–37, ADR 0022) solve event-linking only locally: A→B and B→C don't tell a reader that A, B, C form one continuous story arc, and `RELATION_CANDIDATE_WINDOW_HOURS = 336` (14 days) means a multi-month case fragments since relations are only ever generated once, at Story visibility, and never recomputed. Proposed fix: a `Thread`/`ThreadMember` aggregate — a materialized connected-component over `FOLLOW_UP` edges (recursive CTE, §8.6), recomputed by a `thread.recompute` job, with an `ACTIVE`/`DORMANT`/`CLOSED` state machine so a case that goes quiet for 30 days and resurfaces months later doesn't need the candidate window itself stretched to months.

Lowest-priority item in the audit's own staging (Etapa 6, last). Decide:

1. Is the underlying problem (long-running story arcs fragmenting across many separate Article pages) something you've actually seen happen, or still hypothetical given how recently Event Graph shipped?
2. If deferred: what's the trigger — a certain number of `FOLLOW_UP` chains observed, or a specific user complaint/observation about a fragmented multi-week story?
3. This ticket is blocked by [Entity model: table vs. JSON](04-entity-model-table-vs-json.md) because the proposed `DORMANT → ACTIVE` revival specifically needs "does this new Story overlap this dormant thread's entities" as a queryable operation — decide whether that's a hard dependency or whether a cruder revival heuristic (e.g. plain embedding similarity against the thread's most recent member) would work without the entity table.
