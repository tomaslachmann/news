# 14 — Entity extraction + relation linking as a queued job

Type: grilling
Status: open
Blocked by: 13

## Question

Split from [Thread aggregate](07-thread-aggregate.md) via [ADR 0028](../../../docs/adr/0028-pg-boss-job-queue-adoption.md). Moves `extractEntitiesAndLinkStoryRelations` (today's `entityExtractionPass.ts` + `storyRelationPass.ts` pipeline, currently called synchronously from `approveDraft` and `confirmCoverages`) onto `pg-boss`, enqueued right after the Draft/Coverage-confirmation write that currently triggers it inline.

Not yet decided:

1. Does `approveDraft`/`confirmCoverages` block until the job completes (defeating the point of queuing it) or return immediately once enqueued? If the latter — what does the Admin/reader see in the interim (a Draft with no entities/relations yet is already today's transient state between approval and this pipeline finishing, so this may already be a non-issue)?
2. Ticket 11 (chunked entity extraction, still open, split from ticket 04) and ticket 12 (salience/fuzzy search, still open) both touch `entityExtractionPass.ts` — does moving this pass onto a job change anything about their scope, or are they independent of transport (sync call vs. job) and can resolve on their own schedule regardless of this ticket's order?
3. Idempotency: `extractAndPersistStoryEntities`/`linkStoryRelations` already degrade gracefully on failure (existing "extract or throw, caller degrades" contract) — does that contract still hold cleanly inside a `pg-boss` job with its own retry semantics, or does retry risk double-processing (e.g. `replaceStoryEntities`'s whole-set-replace behavior, ticket 04 — should be idempotent by construction, but worth confirming explicitly)?
4. Existing unit tests (`ingestionService.test.ts`, `analysisService.test.ts`) currently assert this pipeline runs synchronously and mock its functions directly — this ticket needs to update them to assert enqueueing instead.
