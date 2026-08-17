# 33 — Show the Generated Headline Everywhere a Finished Article's Title Appears

**What to build:** Every reader-facing and Admin-facing surface that shows an Analysis's title now prefers the tool-generated headline (`SynthesisResult.headline`, from ticket 32) when present, falling back to the existing working title (`Analysis.seedHeadline`) otherwise — one shared fallback rule, reused everywhere, not three separate implementations. This is the ticket that actually makes the feature visible: a reader no longer sees one source's original headline presented as the Article's own title, on either the Article page or the public listing.

**Blocked by:** 32 — Generate and Store a Tool-Authored Headline Before an Analysis Completes (needs a real `headline` to display)

**Status:** done

- [x] A single shared helper/convention decides the display title for an Analysis: the generated headline when present, otherwise the working title — implemented once, reused by every surface below rather than reimplemented per call site
- [x] The Article page's title (`AnalysisPage`) uses this fallback
- [x] The public listing's rows (`HistoryPage`) use this fallback — `COMPLETE` Analyses show the generated headline; `DRAFT`/`PENDING`/`FAILED` rows keep showing the working title, exactly as today
- [x] The seed-submission dedup-match confirmation screen (`HomePage`, "this looks like the same story…") uses the generated headline when the matched Analysis is `COMPLETE`, and the working title otherwise
- [x] The Draft review queue (`IngestionReviewPage`), the Review Step (`ReviewPage`), and the initial seed-submission flow (`HomePage`'s own creation step, before any match/redirect) are explicitly unchanged — they continue showing only the working title, since no headline can exist yet at those stages
- [x] Tests cover the fallback logic once, at whatever layer this codebase already tests presentational/mapping logic, rather than duplicated across each of the three call sites that use it
- [x] Existing tests touching these pages/mappers continue passing, updated only for the new field where their fixtures need it — no behavioral assertions change for anything pre-`COMPLETE`

## Notes

Spec: `docs/spec-article-headline-generation.md`. Second of a two-ticket chain (32 → 33).

The dedup-match screen's use of this same fallback is the spec's inferred-but-not-independently-grilled consequence of the general rule — implement as specified; flag during review if it turns out wrong in practice.
