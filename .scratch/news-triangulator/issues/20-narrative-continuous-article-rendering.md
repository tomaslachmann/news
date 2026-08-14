# 20 — Cross-Source Narrative Renders as a Continuous Article

**What to build:** Fix the Article tab so the Cross-Source Narrative reads as one continuous piece of writing, not a stack of individually-bordered cards — implementing the winning direction from the `prototype/analysis-page-visual-variants` throwaway branch (Variant A, "Wire Service": numbered superscript citations + a references list), plus refinements agreed on afterward. The backend already produces well-formed prose per ADR 0012 — `AnalysisPage.tsx` currently reuses the Dimension-tabs' card-list component (`DimensionList`) for the Narrative tab too, rendering each segment as its own boxed `<li>`. No ADR needed — this is a gap against ADR 0012's already-stated intent, not a new decision.

**Blocked by:** 15 — Cross-Source Narrative & Article Rebrand.

**Status:** done

- [x] The Article tab renders narrative segments as flowing paragraphs (one after another, as continuous prose), not as a `<ul>` of bordered `<li>` cards
- [x] Per-claim attribution renders as a numbered superscript marker (`[1]`, `[2]`, ...) inline in the paragraph text, not as a row of outlet badges below a boxed card — matching Wire Service's Wikipedia-style pattern
- [x] The same source cited more than once across the Article reuses its existing reference number rather than creating a duplicate entry (deduped by `articleUrl`)
- [x] A References section at the end of the Article lists every numbered source once: outlet name, a short verbatim excerpt (not the full quote/paragraph), and a "→ Read original" link to the source article (English for now — ticket 19 hasn't landed yet; will move to Czech with the rest of the app's copy, not "→ Číst originál" ahead of that)
- [x] Touch/mobile fallback for citation markers: the marker is a real `<button>`, so Radix's Tooltip opens it on tap via the focus event it already listens for, not just hover
- [x] A new "Coverage analysis" summary block above the Article, replacing bare dimension counts with an explained, percentage-based breakdown (English copy for now, same reason as above — exact Czech wording follows ticket 19)
- [x] `DimensionList` is left untouched for the Dimension tabs (Agreement/Contradiction/UniqueReporting/Framing) — a new `NarrativeArticle` component handles the Article tab instead
- [x] Visual check: confirmed in-browser
- [x] Typography/spacing choices pulled into reusable tokens: `max-w-measure` / `text-article` in `tailwind.config.js`, `.utility-label` component class in `index.css` — ticket 22 reuses these rather than each page re-picking arbitrary values

**Not in this ticket:** a "Timeline" view (chronological per-source publication order, using the already-available `Coverage.publishedAt`) was raised as a promising follow-on idea but isn't scoped here — worth its own ticket once this one ships.
