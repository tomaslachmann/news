# 17 — Verified & Complete Claim Extraction

**What to build:** Programmatic verification that every `czechQuote` produced by Extraction, Synthesis, and the Cross-Source Narrative pass is a real substring of the source article it's attributed to — plus exhaustiveness instructions so Extraction and Synthesis stop under-reporting claims, since the Narrative pass is architecturally capped by whatever Synthesis captures (ADR 0012). See ADR 0014 for the full design rationale.

**Blocked by:** 06 — Extraction Pass & SSE Streaming; 07 — Synthesis Pass; 15 — Cross-Source Narrative & Article Rebrand.

**Status:** ready-for-agent

- [ ] `extraction.txt` gains an explicit exhaustiveness instruction: identify every claim/attribution/interpretive statement/framing signal that meets the stated criteria, not just the most notable few
- [ ] `synthesis.txt` gains the same exhaustiveness instruction for each of the four dimensions (agreement, contradiction, uniqueReporting, framing)
- [ ] A shared quote-verification function checks whether a claimed `czechQuote` is a verbatim substring of a given source text; used by all three passes below rather than reimplemented per pass
- [ ] `extractionPass.ts` verifies every claim's `czechQuote` against the single Coverage's `extractedText` it was given
- [ ] `SourceExtraction` (in `synthesisPass.ts`) carries each source's `extractedText` alongside its `extraction` result, so Synthesis's attributions can be verified against the actual article rather than trusted unchecked
- [ ] `synthesisPass.ts` verifies every dimension-item's attributions against the cited source's `extractedText`
- [ ] `narrativePass.ts` verifies every segment's attributions against the cited source's `fullText`
- [ ] On a failed quote, the pass is retried once with the specific failing quote(s) fed back to the model, asking it to correct them
- [ ] If a quote still fails verification after the retry, the entire claim/dimension-item/segment it belongs to is dropped — not just the offending attribution (a Contradiction must never end up with fewer than its required two attributions; an Agreement/uniqueReporting/framing item must never end up with zero)
- [ ] A high verification-failure rate (e.g. more than one retry needed across a pass) is logged so a prompt or model regression is visible rather than silently shrinking the output
- [ ] Tests cover: a quote that verifies on the first try, a quote that fails then passes after retry, a quote that still fails after retry (confirm the containing item is dropped, not just the attribution), and a Contradiction item never surviving with only one attribution
