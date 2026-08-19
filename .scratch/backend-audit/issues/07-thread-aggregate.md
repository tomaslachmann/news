# 07 — `Thread` aggregate: now or deferred?

Type: grilling
Status: resolved
Blocked by: 04

## Question

The audit's §7.4 argues the just-shipped `StoryRelation` edges (tickets 34–37, ADR 0022) solve event-linking only locally: A→B and B→C don't tell a reader that A, B, C form one continuous story arc, and `RELATION_CANDIDATE_WINDOW_HOURS = 336` (14 days) means a multi-month case fragments since relations are only ever generated once, at Story visibility, and never recomputed. Proposed fix: a `Thread`/`ThreadMember` aggregate — a materialized connected-component over `FOLLOW_UP` edges (recursive CTE, §8.6), recomputed by a `thread.recompute` job, with an `ACTIVE`/`DORMANT`/`CLOSED` state machine so a case that goes quiet for 30 days and resurfaces months later doesn't need the candidate window itself stretched to months.

Lowest-priority item in the audit's own staging (Etapa 6, last). Decide:

1. Is the underlying problem (long-running story arcs fragmenting across many separate Article pages) something you've actually seen happen, or still hypothetical given how recently Event Graph shipped?
2. If deferred: what's the trigger — a certain number of `FOLLOW_UP` chains observed, or a specific user complaint/observation about a fragmented multi-week story?
3. This ticket is blocked by [Entity model: table vs. JSON](04-entity-model-table-vs-json.md) because the proposed `DORMANT → ACTIVE` revival specifically needs "does this new Story overlap this dormant thread's entities" as a queryable operation — decide whether that's a hard dependency or whether a cruder revival heuristic (e.g. plain embedding similarity against the thread's most recent member) would work without the entity table.

## Answer

**Build now**, following the audit's own design (§7.4/§8.6/§9.8) directly — not the alternative entity-clustering design initially proposed mid-session (primary-entity-per-Story with per-entity-type scoring profiles), which was set aside as unrelated to what this ticket was actually scoped around and sourced from citations that couldn't be verified.

**Q1 (real or hypothetical)**: confirmed real — the multi-stage-arc pattern is directly observed in the source material this project tracks. The DB being empty is an artifact of routine dev pruning, not evidence the pattern doesn't occur; nothing has run long enough undisturbed to show it inside this system yet, which is different from the pattern not existing.

**Q3 (does ticket 04 change anything)**: ticket 04's entity table wasn't built to enable this, but its side effect (an indexed "all Stories mentioning entity X" query) is what removes what would otherwise be a hard blocker for `DORMANT → ACTIVE` revival, matching entity configuration rather than needing the relation-candidate window itself stretched to months.

**Real gap found while scoping this**: the audit's `thread.recompute` (§9.8) is a `pg-boss` job, but ticket 06 had just deferred the entire job-queue. Resolving that reopened part of ticket 06's deferral — recorded as [ADR 0028](../../../docs/adr/0028-pg-boss-job-queue-adoption.md), which also folds in moving `entity.extract`/`relation.link` and `narrative.generate` onto the same queue (the latter *supersedes* ADR 0026's TTL-marker fix for P0-5 with the audit's originally-intended fix — narrative generation no longer runs from a read endpoint at all). Scraping/politeness (ticket 10) and the human-seeded SSE-streamed analysis flow stay out of scope — adopting a queue doesn't imply migrating everything onto it.

**Second gap**: Thread's ordering/role-inference needs `Story.eventTime`, which doesn't exist — only `createdAt` (ingest time) does, and the audit is explicit that using it here reintroduces P1-11's exact distortion. Added as its own prerequisite, recorded in [ADR 0029](../../../docs/adr/0029-thread-aggregate.md) alongside the `Thread`/`ThreadMember` schema itself — `eventTime` also fixes the other half of P1-11 (`storyRelationPass.ts` sending `createdAt` to the LLM under the name `publishedAt`).

**Split into five subtickets**, none resolved in this session (per this map's own "never resolve more than one ticket per session" rule) — each captures the scope already settled here, ready for a fast confirmation pass rather than a fresh interview:

- [13 — pg-boss infrastructure](13-pg-boss-job-queue-infrastructure.md): dependency, worker entrypoint, `docker-compose.yml` service, transactional-enqueue helper. No behavior change on its own. Blocks 14, 15, 17.
- [14 — entity/relation extraction as a queued job](14-entity-relation-job.md): moves `extractEntitiesAndLinkStoryRelations` off the synchronous `approveDraft`/`confirmCoverages` path. Depends on 13.
- [15 — narrative generation as a queued job](15-narrative-generation-job.md): supersedes ADR 0026's TTL-marker fix; enqueued at Analysis-COMPLETE time instead of lazily on first view. Depends on 13.
- [16 — Story.eventTime](16-story-event-time.md): independent of the queue work; can land any time before 17.
- [17 — Thread/ThreadMember + thread.recompute](17-thread-recompute.md): the aggregate itself. Depends on 13 (queue) and 16 (eventTime) — not on 14 or 15, since `FOLLOW_UP` edges are already produced by the existing (for now still synchronous) relation-linking path regardless of when that itself moves to the queue.

This ticket produces no code of its own — its resolution *is* the five subtickets above, each with its own implementation branch once resolved.
