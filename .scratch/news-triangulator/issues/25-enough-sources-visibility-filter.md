# 25 — Enough-Sources Visibility Filter on the Review Queue

**What to build:** Drafts below a minimum accumulated-Coverage count stay hidden from the Ingestion review queue, surfacing only once they cross the threshold — decluttering the queue of single-source noise without changing the Admin-approval publish gate itself. See ADR 0018.

**Blocked by:** 23 — Embedding-Based Ingestion Candidate Retrieval (the organic, cross-poll accumulation model that makes hiding immature Drafts worthwhile).

**Status:** ready-for-agent

- [ ] A minimum-Coverage-count constant gates which `DRAFT`-status Analyses are returned to the Ingestion review queue (the Drafts listing behind `IngestionReviewPage`) — below-threshold Drafts are excluded from the response entirely, not merely styled differently
- [ ] Ingestion continues attaching Coverage to a below-threshold Draft in the background across polls exactly as before — this ticket only changes what's visible, not the attach/accumulation logic from ticket 23
- [ ] Once a Draft crosses the threshold on a later poll, it appears in the queue on the next fetch — no separate "promote to visible" step needed, it's a live filter on the existing query
- [ ] `approveDraft`/`rejectDraft` behavior is completely unchanged — nothing auto-approves; the threshold only affects queue visibility
- [ ] Tests cover: a below-threshold Draft is excluded from the queue response; a Draft whose Coverage count crosses the threshold appears on the next fetch; approving/rejecting a Draft still works regardless of its Coverage count
