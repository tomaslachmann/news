# 52 — Split `/analysis/:id` (Admin) from a new public `/article/:id`

**What to build:** `/analysis/:id` (`AnalysisPage`) currently sits under the public `AppLayout`
with no auth gate at all — it serves as both the reader-facing "Article" view (once
`status === 'complete'`) and an in-progress monitoring view (draft/pending/streaming/failed states,
with an Admin-only "go approve this" hint). The public should read completed articles at
`/article/:id`, using the word this project's own framing already uses (CLAUDE.md: "presented to
readers as 'Article'"); `/analysis/:id` becomes Admin-only, keeping today's full behavior including
the in-progress states a public reader currently has no business seeing at all (a Draft or streaming
Analysis isn't a stable page to land on — same posture ADR 0035 already applies to entity reads:
public reads are bounded to `COMPLETE` status).

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] New route `/article/:id`, public (under `AppLayout`, no `ProtectedRoute`), rendering only the
      completed article (`CompleteAnalysis`) — draft/pending/streaming/failed states return a plain
      "not found / not yet published" response instead of the current process-monitoring UI, so a
      public reader can never observe or infer an Analysis's in-progress internals.
- [ ] `/analysis/:id` moves under `AdminLayout` + `ProtectedRoute`, Admin-only, keeping its current
      full behavior (draft/pending/streaming/failed/complete) unchanged — this remains the
      monitoring view Admins use while an Analysis is being processed.
- [ ] Reader-facing links updated to point at `/article/:id`: `HistoryPage`'s row link,
      `EntityDetailPage`'s two event/relation links, and `AnalysisPage`'s own thread-band/
      related-events links (`packages/frontend/src/pages/AnalysisPage.tsx:247,268`).
- [ ] Admin-flow links stay pointed at `/analysis/:id` (they navigate to a just-created/just-approved
      Analysis that isn't complete yet): `NewAnalysisPage` (`:171`), `ReviewPage` (`:65`),
      `IngestionReviewPage`'s two links (`:172`, `:230`).
- [ ] Decide whether `/analysis/:id` for a *complete* Analysis should redirect an Admin to
      `/article/:id` (single canonical public URL, Admin included) or keep rendering the same
      content at both URLs for Admin convenience — either is defensible, just be explicit and
      consistent about which.
- [ ] `NotFoundPage`/error states read sensibly for both routes (an unauthenticated visit to
      `/analysis/:id` should behave like any other `ProtectedRoute` redirect-to-login, not leak
      whether the id exists).

## Notes

This is the same shape of route-naming mismatch CLAUDE.md's "Article" framing already implies —
`AnalysisPage`/`AnalysisDetail`/etc. internal naming doesn't need to change, only the public-facing
route and reader-facing links.
