# 45 — Approve/Reject Queue for Pending Additions

**What to build:** An Admin can resolve a `PendingAddition` (new coverage Ingestion found for an
already-`COMPLETE` Analysis) instead of it sitting on `/admin/ingestion` forever with no action
available. Today `PendingAddition` is write-only: `ingestionService.ts` creates one whenever a
matched Analysis is already `COMPLETE` (see the `else if (match.analysisStatus === 'COMPLETE')`
branch), and the only read path is `listPendingAdditions` for display. There is no `status` field,
no reject/dismiss, and — this is the open question below — no code anywhere that attaches a new
Coverage to a `COMPLETE` Analysis and re-triangulates it.

**Needs a grilling session before implementation**, same as ticket 39 needed one. The open question:
what does "Schválit" actually do to the Analysis?

- Re-run extraction + synthesis for the whole Analysis with the new source added (real
  re-triangulation, real LLM cost, and the Analysis presumably needs a transient status while
  that's in flight — reuses the existing SSE-streaming machinery `openAnalysisStream` already
  drives for a fresh Analysis, or needs its own variant for "re-triangulating a complete one"?)
- Attach the Coverage and leave synthesis stale until something else re-triggers it (cheaper, but
  then the Article page is showing synthesis that no longer reflects all its own listed Coverages
  — misleading, arguably worse than not attaching at all)
- Something else — a lighter-weight "note added, no re-synthesis" path

`admin-review.html`'s own reference copy is not much help here — it treats this as a plain approve/
reject action with no elaboration on backend effect, same shallow treatment discovered on ticket
39 for a few other reference sections that assumed richer machinery than this app actually has.

**Blocked by:** None functionally, but shouldn't be started until the question above is answered.

**Status:** ready-for-grilling

## Mechanics (draft — confirm/adjust once the grilling question above is answered)

- [ ] `PendingAddition` gains a `status` field (or equivalent) so a resolved row stops appearing in
  `listPendingAdditions` without being deleted — parallels `StoryRelation`'s `PENDING_REVIEW` →
  `PUBLISHED`/`REJECTED` pattern from ticket 36, not deletion
- [ ] A "reject" endpoint (`PATCH /api/admin/ingestion/pending-additions/:id/reject`) marks a
  `PendingAddition` dismissed — permanent, never re-surfaced, mirrors `rejectDraft`/
  `rejectStoryRelation`'s shape
- [ ] An "approve" endpoint does whatever the grilling session above decides
- [ ] `IngestionReviewPage.tsx`'s `PendingAdditionsSection`/`AdditionItem` (ticket 39) gains
  `.qitem__act` approve/reject buttons, mirroring `DraftsSection`'s existing
  list-plus-action-buttons pattern — the reference (`admin-review.html`) already shows this exact
  button pair, it's the ticket 39 port that left them out pending this decision
- [ ] New confirm/reject service functions are tested at the service layer via repository mocks,
  mirroring `ingestionService.test.ts`'s existing `approveDraft`/`rejectDraft` tests
- [ ] Existing Ingestion review queue tests/behavior (Drafts section, story-relations section)
  continue passing unchanged

## Notes

Surfaced during ticket 39 (design-system port): `/admin/ingestion`'s reference mockup
(`admin-review.html`) shows approve/reject buttons on the pending-additions queue that ticket 39
correctly left unbuilt — no backend capability exists behind them, and inventing the "approve"
semantics (re-triangulation cost/status implications) isn't a call to make inside a frontend
reskin ticket.
