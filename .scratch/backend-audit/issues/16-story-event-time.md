# 16 — `Story.eventTime`

Type: grilling
Status: open
Blocked by: none — can start immediately (independent of the queue work, tickets 13–15)

## Question

Split from [Thread aggregate](07-thread-aggregate.md) via [ADR 0029](../../../docs/adr/0029-thread-aggregate.md). `Story` has `createdAt` (row-insert/ingest time) but nothing representing when the real-world event actually happened. Thread's member ordering and role-inference (`ORIGIN`/`DEVELOPMENT`/`REACTION`/`RESOLUTION`) need the latter — the audit is explicit that `createdAt` reintroduces P1-11's distortion (a Draft sitting in the Ingestion review queue for days would order/infer role wrong, and silently reorder later purely because of when it happened to get approved). This also fixes P1-11's other half: `storyRelationPass.ts`'s `confirmStoryRelation` currently sends `createdAt` to the LLM under the field name `publishedAt` when deciding `RELATED` vs. `FOLLOW_UP` — the same new field fixes both consumers.

Not yet decided:

1. Source of truth for `eventTime` at Story creation: the seed article's own published date where available (which sources reliably provide this — RSS `pubDate`, GDELT's own timestamp, a scraped article's byline date?), ingest time (`createdAt`) as fallback where not. Needs a concrete per-source-path decision, not just "best available."
2. Nullable vs. always-populated: given the fallback-to-`createdAt` plan, is there ever a case where `eventTime` is genuinely unknown and should stay null, or does the fallback mean it's always populated (in which case, non-nullable with a default makes more sense than nullable)?
3. Does this ticket also fix `storyRelationPass.ts`'s `publishedAt` mislabeling (sending `eventTime` there instead of `createdAt`), or does that stay a separate, smaller follow-up since it's a different call site than Thread's own ordering?
4. No backfill for Stories created before this field exists, matching this project's established convention (ADR 0022, ADR 0025) — confirm this holds here too, and confirm nothing downstream (Thread ordering, the relation-confirmation prompt) breaks on a pre-migration Story with a null/fallback `eventTime`.
