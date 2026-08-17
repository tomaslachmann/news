# 25 — Enough-Sources Visibility Filter on the Review Queue

**What to build:** Drafts below a minimum accumulated-Coverage count stay hidden from the Ingestion review queue, surfacing only once they cross the threshold — decluttering the queue of single-source noise without changing the Admin-approval publish gate itself. See ADR 0018.

**Blocked by:** 23 — Embedding-Based Ingestion Candidate Retrieval (the organic, cross-poll accumulation model that makes hiding immature Drafts worthwhile).

**Status:** done

- [x] A minimum-Coverage-count constant gates which `DRAFT`-status Analyses are returned to the Ingestion review queue (the Drafts listing behind `IngestionReviewPage`) — below-threshold Drafts are excluded from the response entirely, not merely styled differently
- [x] Ingestion continues attaching Coverage to a below-threshold Draft in the background across polls exactly as before — this ticket only changes what's visible, not the attach/accumulation logic from ticket 23
- [x] Once a Draft crosses the threshold on a later poll, it appears in the queue on the next fetch — no separate "promote to visible" step needed, it's a live filter on the existing query
- [x] `approveDraft`/`rejectDraft` behavior is completely unchanged — nothing auto-approves; the threshold only affects queue visibility
- [x] Tests cover: a below-threshold Draft is excluded from the queue response; a Draft whose Coverage count crosses the threshold appears on the next fetch; approving/rejecting a Draft still works regardless of its Coverage count

## Notes

Implemented as a new, dedicated `GET /api/admin/ingestion/drafts` endpoint — deliberately separate from the general `GET /api/analyses` listing, which `HistoryPage.tsx` still uses unfiltered for a full Admin audit trail that must keep showing every Draft regardless of source count. Backing this: `analysisRepo.findDraftsWithCoverageCount()` counts every non-excluded Coverage on a Draft (not just `status: 'OK'`, unlike the general listing's `okCoverageCount`) — a Draft's Coverage is always `PENDING` until Review Step confirmation, so an OK-only count would always read zero here.

Code review found no correctness bugs; fixed four cleanup items it raised: the new `AnalysisListItem` construction now goes through a `toVisibleDraftListItem` mapper (reusing the shared `STATUS_MAP`) instead of a hand-written literal that could drift from `toAnalysisListItem`'s; the repository query duplication between `findAllAnalyses` and `findDraftsWithCoverageCount` was factored into a shared `findAnalysesWithCoverageCount` helper; `AnalysisListItem.coverageCount`'s two different meanings (OK-only vs. every non-excluded status) are now documented on the shared type itself; `CONTEXT.md`'s `Draft Analysis` entry now mentions the visibility threshold.

Two findings were deliberately left as-is:
- **Unbounded growth**: `findDraftsWithCoverageCount` has no time bound, unlike `findRecentStoriesForMatching`'s `sinceHours` window — every never-rejected, perpetually-single-source Draft is fetched and immediately filtered out on every call. Real, but fixing it means a product decision this ticket doesn't have an answer for (should old under-threshold Drafts eventually auto-expire, and after how long?) — a scoped follow-up, not a silent behavior change bundled into this one.
- **Cache warm-start loss**: `IngestionReviewPage` switching from the shared `['analyses']` query key to a dedicated `['ingestion-visible-drafts']` key means it no longer benefits from a cache already warmed by a prior `HistoryPage` visit. This is the direct, correct consequence of the two endpoints deliberately returning different data (see above) — not a bug to fix.
