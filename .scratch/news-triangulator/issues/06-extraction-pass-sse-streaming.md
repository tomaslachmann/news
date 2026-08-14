# 06 — Extraction Pass & SSE Streaming

**What to build:** The backend runs the Extraction pass: one Extraction Model LLM call per confirmed Coverage, executed in parallel. As each call completes, the result is stored and an SSE event is emitted. The frontend opens the SSE stream immediately on `/analysis/:id` and renders per-article extraction cards as they arrive, giving the user live progress feedback while the most expensive phase of the pipeline runs.

**Blocked by:** 04 — Review Step & Content Extraction; 05 — Prompt Engineering; 10 — Authentication & Authorization.

**Status:** done

- [x] `GET /api/analyses/:id/stream` is a valid SSE endpoint with `Content-Type: text/event-stream`, correct cache-control headers, and keeps the connection open until the stream is explicitly closed
- [x] Immediately on stream open, a `sources-confirmed` event is emitted listing all confirmed Coverages (`{ outlet, articleUrl, status }[]`)
- [x] The backend runs one Extraction Model LLM call per confirmed Coverage in parallel; calls use the prompt and schema from ticket 05
- [x] Each call's output is validated against the Extraction output schema before being stored
- [x] Validated extraction results are stored in `Coverage.extractionResult`
- [x] An `extraction-complete` SSE event is emitted for each Coverage as its call finishes, carrying `{ coverageId, outlet, claimCount, attributedClaimCount, framingSignalCount }`
- [x] If an LLM call fails or schema validation fails for one Coverage, an `extraction-error` SSE event is emitted for that Coverage; the remaining calls continue unaffected
- [x] The stream does not close after Extraction — it remains open for the Synthesis events (ticket 07) to follow
- [x] The frontend opens the SSE stream on `/analysis/:id` using the `EventSource` API
- [x] The `sources-confirmed` event renders a list of outlet names with a pending indicator
- [x] Each `extraction-complete` event updates the corresponding outlet's indicator to complete and shows claim count
- [x] Each `extraction-error` event updates the corresponding outlet's indicator to an error state
- [x] A progress bar or counter shows `N of M extractions complete`
- [x] `GET /api/analyses/:id/stream` is guarded by the `requireAdmin` middleware; unauthenticated or non-Admin requests receive 401/403 before the stream opens
- [x] All SSE event shapes used match the union type defined in `packages/shared`

## Note

Status was stale — this ticket was fully implemented (verified against `analysisStream.ts`, `routes/analyses.ts`, and `AnalysisPage.tsx`'s `StreamingAnalysis`) but its checklist/Status were never flipped, predating the `ticket-done.mjs` convention established around ticket 16. Corrected here while unblocking ticket 17; no implementation changes made.
