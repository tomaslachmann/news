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

**Status:** done

- [x] New route `/article/:id`, public (under `AppLayout`, no `ProtectedRoute`), rendering only the
      completed article (`CompleteAnalysis`) — draft/pending/streaming/failed states return a plain
      "not found / not yet published" response instead of the current process-monitoring UI, so a
      public reader can never observe or infer an Analysis's in-progress internals.
- [x] `/analysis/:id` moves under `AdminLayout` + `ProtectedRoute`, Admin-only, keeping its current
      full behavior (draft/pending/streaming/failed/complete) unchanged — this remains the
      monitoring view Admins use while an Analysis is being processed.
- [x] Reader-facing links updated to point at `/article/:id`: `HistoryPage`'s row link,
      `EntityDetailPage`'s two event/relation links, and `AnalysisPage`'s own thread-band/
      related-events links (`packages/frontend/src/pages/AnalysisPage.tsx:247,268`).
- [x] Admin-flow links stay pointed at `/analysis/:id` (they navigate to a just-created/just-approved
      Analysis that isn't complete yet): `NewAnalysisPage` (`:171`), `ReviewPage` (`:65`),
      `IngestionReviewPage`'s two links (`:172`, `:230`).
- [x] Decide whether `/analysis/:id` for a *complete* Analysis should redirect an Admin to
      `/article/:id` (single canonical public URL, Admin included) or keep rendering the same
      content at both URLs for Admin convenience — either is defensible, just be explicit and
      consistent about which.
- [x] `NotFoundPage`/error states read sensibly for both routes (an unauthenticated visit to
      `/analysis/:id` should behave like any other `ProtectedRoute` redirect-to-login, not leak
      whether the id exists).

## Notes

This is the same shape of route-naming mismatch CLAUDE.md's "Article" framing already implies —
`AnalysisPage`/`AnalysisDetail`/etc. internal naming doesn't need to change, only the public-facing
route and reader-facing links.

**Implementation notes (agent, 2026-08-21):**
- `/analysis/:id`, for a COMPLETE Analysis, **redirects** to `/article/:id` (`<Navigate replace>`)
  rather than duplicating the finished-Article render at both URLs — one canonical public URL for a
  finished piece, Admin included, per the ticket's first listed option.
- Went one step further than a frontend-only split: `GET /api/analyses/:id` itself now gates by
  status for a non-Admin caller (mirrors `GET /api/analyses`'s existing `isAdmin` gate and ADR
  0035's "public reads bounded to COMPLETE" precedent) — a non-Admin/unauthenticated request for a
  non-COMPLETE Analysis now gets the same `NotFoundError` a missing id produces. Frontend-only
  gating would have hidden the monitoring UI at `/article/:id` while leaving the same in-progress
  data one direct `curl /api/analyses/:id` away regardless of which route a client used to get
  there — closing that at the API layer is what actually satisfies "a public reader can never
  observe or infer an Analysis's in-progress internals."
- `SumBox`/`CompareList`/`OutletBadge` (rendering the four Analysis Dimensions) are shared between
  `AnalysisPage`'s live-streaming view and the new `ArticlePage`'s finished Article — extracted into
  `packages/frontend/src/components/AnalysisDimensionSections.tsx` rather than duplicated across
  both page files.
- `HistoryPage`'s row link is conditional on `item.status` (`/article/:id` once COMPLETE,
  `/analysis/:id` otherwise) rather than a flat swap to `/article/:id` — an Admin's "Historie
  analýz" view still lists every status and still needs to click through to the monitoring view for
  a not-yet-complete item; `/article/:id` never renders that view for anyone, Admin included.
  `EntityDetailPage`'s two links needed no such branch — its data is already COMPLETE-only
  (ADR 0035).
- No headless-browser/screenshot tool was available in this session (same limitation as ticket 51).
  Verified instead: `npm run build` (frontend) succeeds, `npm run lint`/`typecheck` clean, and a
  live smoke test of the new `GET /api/analyses/:id` gating against real dev-DB Analyses — a DRAFT
  id returns 404 unauthenticated, a COMPLETE id returns 200, a missing id returns 404. The
  client-side routing/redirect itself (React Router `<Navigate>`, `ProtectedRoute` wrapping) was
  verified by reading the code and the passing typecheck, not by watching it happen in a browser.
- Self-review (`/code-review`) found and fixed two real issues: `ArticlePage` was folding a genuine
  fetch/network error into the same `NotFoundPage` used for "not published yet," which would tell a
  reader a real, live article doesn't exist during a transient backend blip — fixed by giving
  `isError` `AnalysisPage`'s own retryable `ErrorState` instead, distinct from the Analysis-state
  "not found" cases. It also flagged the `/article/:id`/`/analysis/:id` URL-building logic being
  re-derived ad hoc at ~9 call sites — extracted into `packages/frontend/src/lib/analysisRoutes.ts`
  (`articlePath`/`analysisPath`) and every call site (including the Admin-flow ones that stay
  pointed at `/analysis/:id`) now goes through it.
