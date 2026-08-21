# 45 — Approve/Reject Queue for Pending Additions

**What to build:** An Admin can resolve a `PendingAddition` (new coverage Ingestion found for an
already-`COMPLETE` Analysis) instead of it sitting on `/admin/ingestion` forever with no action
available. Today `PendingAddition` is write-only: `ingestionService.ts` creates one whenever a
matched Analysis is already `COMPLETE` (see the `else if (match.analysisStatus === 'COMPLETE')`
branch), and the only read path is `listPendingAdditions` for display. There is no `status` field,
no reject/dismiss, and — this is the open question below — no code anywhere that attaches a new
Coverage to a `COMPLETE` Analysis and re-triangulates it.

**Grilling session held 2026-08-21.** The open question — what does "Schválit" actually do to the
Analysis — is resolved: **real re-triangulation.** Approve attaches the Coverage, clears the stale
`SynthesisResult`, flips the Analysis back through the existing `PENDING` transient state, and
drives extraction+synthesis+narrative regen via the existing SSE stream (`openAnalysisStream`) —
the same machinery `approveDraft`'s `DRAFT→PENDING` transition already reuses, not a new variant.
Real LLM cost, and a reader viewing the live Article page mid-approval will briefly see it revert
to a "processing" state until re-synthesis completes — accepted as the honest tradeoff, since the
alternative (attach-and-leave-stale) means the Article keeps listing a source whose content isn't
reflected in the synthesis at all.

Concrete mechanics, confirmed against the existing codebase before implementation:

- `runAnalysisStream` (`analysisStream.ts`) already skips extraction for any Coverage that already
  has an `extractionResult` — so the only new LLM extraction cost is the one newly-attached
  source. It also **re-emits a cached `SynthesisResult` and returns early** if one exists — so
  Approve must delete/clear the `SynthesisResult` row, or the stream will silently skip
  re-synthesis entirely.
- Article-text scraping (`scrapeArticle`, `MIN_TEXT_LENGTH`, `isBlockedContent`) only happens today
  in `confirmCoverages` — `approvePendingAddition` needs to call it inline for the single new
  article, mirroring that function's scrape-then-`updateCoverage` step (not the SSE stream, which
  only does LLM claim/framing extraction, not raw article fetch).
- `updateAnalysisStatusIfCurrently(analysisId, 'COMPLETE', 'PENDING', onTransition)` is the same
  conditional-CAS primitive `approveDraft` already uses for `DRAFT→PENDING`, with a transactional
  hook for enqueueing `entity.extract` — reused here, just with `COMPLETE` as the `fromStatus`.
- Visiting `/analysis/:id` while status is `PENDING` (no `synthesisResult`) already auto-opens the
  SSE stream via `StreamingAnalysis` — no new frontend streaming UI needed, just navigate there
  after Approve succeeds (mirroring `DraftItem`'s navigate-to-`/review/:id` on approve).

`admin-review.html`'s own reference copy was not much help here — it treats this as a plain
approve/reject action with no elaboration on backend effect, same shallow treatment discovered on
ticket 39 for a few other reference sections that assumed richer machinery than this app actually
has.

**Blocked by:** None.

**Status:** ready-for-agent

## Mechanics

- [x] `PendingAddition` gains a `status PendingAdditionStatus @default(PENDING_REVIEW)` field
  (`PENDING_REVIEW | APPROVED | REJECTED`) so a resolved row stops appearing in
  `listPendingAdditions` without being deleted — parallels `StoryRelation`'s `PENDING_REVIEW` →
  `PUBLISHED`/`REJECTED` pattern from ticket 36
- [x] A "reject" endpoint (`PATCH /api/admin/ingestion/pending-additions/:id/reject`) marks a
  `PendingAddition` `REJECTED` via conditional CAS — permanent, never re-surfaced, mirrors
  `rejectStoryRelation`'s shape exactly (read-check + `updatePendingAdditionStatusIfCurrently` +
  `ValidationError` on race loss)
- [x] An "approve" endpoint (`PATCH /api/admin/ingestion/pending-additions/:id/approve`): guards
  `status === PENDING_REVIEW` and `analysis.status === COMPLETE`; attaches the Coverage
  (`coverageRepo.addCoveragesIfWithinLimit`, respecting `MAX_COVERAGES_PER_ANALYSIS`); scrapes it
  (mirrors `confirmCoverages`' scrape step); deletes the Analysis's `SynthesisResult`; transitions
  `COMPLETE→PENDING` via `updateAnalysisStatusIfCurrently`, enqueueing `entity.extract` (new
  `origin: 'pending-addition-approval'`) for the new Coverage in the same transaction; marks the
  `PendingAddition` `APPROVED` last (log-only if that final CAS loses a race, since the real work
  already succeeded by then)
- [x] `IngestionReviewPage.tsx`'s `PendingAdditionsSection`/`AdditionItem` (ticket 39) gains
  `.qitem__act` approve/reject buttons via the existing shared `QitemActions`, mirroring
  `DraftsSection`'s list-plus-action-buttons pattern; Approve success navigates to
  `/analysis/:analysisId`
- [x] New confirm/reject service functions are tested at the service layer via repository mocks,
  mirroring `ingestionService.test.ts`'s existing `approveDraft`/`approveStoryRelation`/
  `rejectStoryRelation` tests
- [x] Existing Ingestion review queue tests/behavior (Drafts section, story-relations section)
  continue passing unchanged

## Notes

Surfaced during ticket 39 (design-system port): `/admin/ingestion`'s reference mockup
(`admin-review.html`) shows approve/reject buttons on the pending-additions queue that ticket 39
correctly left unbuilt — no backend capability exists behind them, and inventing the "approve"
semantics (re-triangulation cost/status implications) isn't a call to make inside a frontend
reskin ticket.
