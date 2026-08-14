# 17 — Verified & Complete Claim Extraction

**What to build:** Programmatic verification that every `czechQuote` produced by Extraction, Synthesis, and the Cross-Source Narrative pass is a real substring of the source article it's attributed to — plus exhaustiveness instructions so Extraction and Synthesis stop under-reporting claims, since the Narrative pass is architecturally capped by whatever Synthesis captures (ADR 0012). See ADR 0014 for the full design rationale.

**Blocked by:** 06 — Extraction Pass & SSE Streaming; 07 — Synthesis Pass; 15 — Cross-Source Narrative & Article Rebrand.

**Status:** done

- [x] `extraction.txt` gains an explicit exhaustiveness instruction: identify every claim/attribution/interpretive statement/framing signal that meets the stated criteria, not just the most notable few
- [x] `synthesis.txt` gains the same exhaustiveness instruction for each of the four dimensions (agreement, contradiction, uniqueReporting, framing)
- [x] A shared quote-verification function checks whether a claimed `czechQuote` is a verbatim substring of a given source text; used by all three passes below rather than reimplemented per pass
- [x] `extractionPass.ts` verifies every claim's `czechQuote` against the single Coverage's `extractedText` it was given
- [x] `SourceExtraction` (in `synthesisPass.ts`) carries each source's `extractedText` alongside its `extraction` result, so Synthesis's attributions can be verified against the actual article rather than trusted unchecked
- [x] `synthesisPass.ts` verifies every dimension-item's attributions against the cited source's `extractedText`
- [x] `narrativePass.ts` verifies every segment's attributions against the cited source's `fullText`
- [x] On a failed quote, the pass is retried once with the specific failing quote(s) fed back to the model, asking it to correct them
- [x] If a quote still fails verification after the retry, the entire claim/dimension-item/segment it belongs to is dropped — not just the offending attribution (a Contradiction must never end up with fewer than its required two attributions; an Agreement/uniqueReporting/framing item must never end up with zero)
- [x] A high verification-failure rate (e.g. more than one retry needed across a pass) is logged so a prompt or model regression is visible rather than silently shrinking the output
- [x] Tests cover: a quote that verifies on the first try, a quote that fails then passes after retry, a quote that still fails after retry (confirm the containing item is dropped, not just the attribution), and a Contradiction item never surviving with only one attribution

## Notes

Code review surfaced and fixed four issues beyond the checklist above:
- `isVerbatimQuote('', sourceText)` was trivially `true` (every string contains the empty string) — fixed with an explicit empty-quote guard, plus `.min(1)` added to every `czechQuote`/`AttributionSchema` zod field so a schema-invalid empty quote is rejected even earlier, at parse time.
- `.includes()` was fragile to typography differences between scraped HTML and LLM-reproduced text (curly vs. straight quotes — including Czech-style `„low-high“` quotation marks — NBSP vs. regular space, Unicode NFC/NFD composition). Added a `normalizeForComparison` step applied to both sides before comparing; it only canonicalizes typography, never loosens what "verbatim" requires.
- If the model's repair response didn't match the pass's zod schema (e.g. leaving a contradiction item with one attribution instead of two), `verifyAndRepair` used to let that `schema.parse` throw, failing the *entire* pass and losing every otherwise-valid item. Changed to `safeParse`, falling back to dropping just the originally-failing items from the pre-repair result when the repair itself is malformed.
- `runNarrativePass` dropping every segment (all quotes failed even after retry) produced `{ segments: [] }`, which `generateAndCacheNarrative` cached unconditionally — since `[]` is truthy, the existing `!narrative` regeneration check treated this Analysis as permanently, unfixably done. Fixed: an empty segments result is no longer persisted, so the next view retries generation instead.

Also factored `extractAttributionQuotes`/`filterValidAttributedItems` out of `synthesisPass.ts`/`narrativePass.ts` into `quoteVerification.ts` — both passes' dimension-items/segments share the identical `{prose, attributions[]}` shape, so the per-file duplication was unnecessary (`extractionPass.ts`'s four flat categories are a genuinely different shape and were left as-is).
