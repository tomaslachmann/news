# 07 — Synthesis Pass

**What to build:** Once all Extraction calls have settled (completed or errored), the backend makes a single Synthesis Model call with all Extraction results as input. The call uses the prompt and schema from ticket 05 to produce the four Analysis Dimensions. The result is validated, stored as a `SynthesisResult`, and emitted as a `synthesis-complete` SSE event. The Analysis status is updated to `complete` and the stream closes.

**Blocked by:** 06 — Extraction Pass & SSE Streaming.

**Status:** done

- [x] The Synthesis call fires only after all Extraction calls have settled (the last `extraction-complete` or `extraction-error` event has been emitted)
- [x] The Synthesis Model call uses the prompt and output schema from ticket 05; the schema is enforced via structured output
- [x] The Synthesis call receives all successful Extraction results; Coverages with `extraction-error` status are excluded with a note in the prompt
- [x] The output is validated against the Synthesis output schema before being stored
- [x] Validated result is stored in `SynthesisResult.dimensions` (JSON); `Analysis.status` is updated to `"complete"`
- [x] A `synthesis-complete` SSE event is emitted carrying the full four-dimension payload matching the type in `packages/shared`
- [x] After emitting `synthesis-complete`, the SSE stream closes cleanly
- [x] If the Synthesis call fails or schema validation fails, a `synthesis-error` SSE event is emitted; `Analysis.status` is set to `"failed"`; the stream closes
- [x] The `synthesis-complete` payload contains, for each dimension item: English prose, outlet name, original Czech quote (verbatim), and article URL — as defined in the shared type
