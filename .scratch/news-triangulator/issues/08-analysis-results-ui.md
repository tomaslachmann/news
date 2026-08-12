# 08 — Analysis Results UI

**What to build:** The `/analysis/:id` page renders the completed Analysis in four tabs — Agreement, Contradiction, Unique Reporting, Framing — sourced from the SSE stream. Per-article extraction cards appear as `extraction-complete` events arrive. The four tabs populate when `synthesis-complete` arrives. Each claim item carries an outlet badge: hovering shows the original Czech quote in a tooltip, clicking opens the source article in a new tab. Navigating directly to `/analysis/:id` for a completed Analysis loads the stored `SynthesisResult` rather than replaying the stream.

**Blocked by:** 07 — Synthesis Pass.

**Status:** ready-for-agent

- [ ] `/analysis/:id` opens the SSE stream via `EventSource` on mount when the Analysis status is not yet `"complete"`
- [ ] While the stream is open, per-article extraction cards render as `extraction-complete` events arrive; each card shows outlet name and claim count
- [ ] A progress counter (`N of M sources analysed`) updates as events arrive
- [ ] When `synthesis-complete` arrives, the four tabs render with their items and the progress indicator is replaced by the tab UI
- [ ] Tabs: Agreement, Contradiction, Unique Reporting, Framing — rendered using shadcn/ui Tabs component
- [ ] Each item in all tabs shows English prose and one or more outlet badges
- [ ] Hovering an outlet badge shows a shadcn/ui Tooltip containing the original Czech quote verbatim
- [ ] Clicking an outlet badge opens the source article URL in a new browser tab
- [ ] Navigating directly to `/analysis/:id` for an Analysis with `status: "complete"` calls `GET /api/analyses/:id` (not SSE), loads the stored `SynthesisResult`, and renders the four tabs immediately without a loading state
- [ ] `GET /api/analyses/:id` returns `{ analysis, coverages, synthesisResult }` matching the type in `packages/shared`
- [ ] If the stream emits `synthesis-error`, an error state replaces the progress indicator with a message and a "Try again" link back to `/`
- [ ] Navigating directly to a `status: "failed"` Analysis shows the same error state
