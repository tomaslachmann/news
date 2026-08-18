# 36 — Admin Review Queue for Pending Story Relations

**What to build:** An Admin can see every `PENDING_REVIEW` `StoryRelation` (the low-confidence ones from ticket 35) and confirm or reject each one, on the same Admin surface as the existing Ingestion Draft review queue. A confirmed relation becomes visible to readers (feeds ticket 37); a rejected one is recorded as rejected, permanently, and never re-surfaced.

**Blocked by:** 35 — Story Relation Candidate Generation, Confirmation & Persistence (needs `StoryRelation` rows with `PENDING_REVIEW` status to review)

**Status:** done

- [x] A new endpoint lists every `PENDING_REVIEW` `StoryRelation`, each with both Stories' display titles (`resolveDisplayTitle`, per ticket 33's convention), the proposed `type`, and the `reasoning` string
- [x] A new shared type for a pending relation list item (mirroring `PendingAdditionItem`'s shape)
- [x] A new "confirm" endpoint transitions a `StoryRelation` from `PENDING_REVIEW` to `PUBLISHED`
- [x] A new "reject" endpoint transitions a `StoryRelation` from `PENDING_REVIEW` to `REJECTED` — permanent; a rejected pair is never re-evaluated or re-surfaced by a later candidate-generation pass
- [x] `IngestionReviewPage.tsx` gains a third section listing pending relations, mirroring `DraftsSection`'s list-plus-action-buttons pattern (confirm/reject buttons per row)
- [x] The review queue and its actions work correctly even if one side's Analysis status has changed since the relation was generated (e.g. it later failed) — display and actions degrade gracefully, never error
- [x] The new confirm/reject service functions are tested at the service layer via repository mocks, mirroring `ingestionService.test.ts`'s existing `approveDraft`/`rejectDraft` tests
- [x] Existing Ingestion review queue tests/behavior (Drafts section, pending additions section) continue passing unchanged

## Notes

Spec: `docs/spec-event-graph.md`. Third of a four-ticket chain (34 → 35 → {36, 37}). Ticket 37 (Related Events display) does not depend on this ticket and can be built in parallel.
