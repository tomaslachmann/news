# 20 — Cross-Source Narrative Renders as a Continuous Article

**What to build:** Fix the Article tab so the Cross-Source Narrative reads as one continuous piece of writing, not a stack of individually-bordered cards — implementing the winning direction from the `prototype/analysis-page-visual-variants` throwaway branch (Variant A, "Wire Service": numbered superscript citations + a references list), plus refinements agreed on afterward. The backend already produces well-formed prose per ADR 0012 — `AnalysisPage.tsx` currently reuses the Dimension-tabs' card-list component (`DimensionList`) for the Narrative tab too, rendering each segment as its own boxed `<li>`. No ADR needed — this is a gap against ADR 0012's already-stated intent, not a new decision.

**Blocked by:** 15 — Cross-Source Narrative & Article Rebrand.

**Status:** ready-for-agent

- [ ] The Article tab renders narrative segments as flowing paragraphs (one after another, as continuous prose), not as a `<ul>` of bordered `<li>` cards
- [ ] Per-claim attribution renders as a numbered superscript marker (`[1]`, `[2]`, ...) inline in the paragraph text, not as a row of outlet badges below a boxed card — matching Wire Service's Wikipedia-style pattern
- [ ] The same source cited more than once across the Article reuses its existing reference number rather than creating a duplicate entry
- [ ] A References section at the end of the Article lists every numbered source once: outlet name, a short verbatim excerpt (not the full quote/paragraph), and a "→ Číst originál" link to the source article
- [ ] Touch/mobile fallback for citation markers: tapping a `[n]` marker must reveal the same reference info a hover would, since hover has no touch equivalent — see `docs/research/2026-news-portal-visual-design.md` §6
- [ ] A new "Coverage analysis" summary block above the Article, replacing bare dimension counts with an explained, percentage-based breakdown — e.g. "92% shoda — Většina zdrojů uvádí stejné základní skutečnosti", "3 unikátní informace — Pouze některé zdroje uvádějí další informace", "2 rozdíly ve framingu — ...", "0 přímých rozporů — ..." (exact Czech copy to follow ticket 19's language switch)
- [ ] `DimensionList` (or its rendering) is split so the Dimension tabs (Agreement/Contradiction/UniqueReporting/Framing) keep their current card-list presentation unchanged — those are genuinely discrete lists and are not part of this fix
- [ ] Visual check: reading the Article tab top to bottom feels like reading a normal article, not scanning a list of unrelated snippets
- [ ] Typography/spacing choices (serif body, measure cap, utility-label styling) are pulled into shared, reusable Tailwind classes or tokens rather than left as one-off inline classes on this page — ticket 22 applies the same choices to the rest of the app and needs something to reuse

**Not in this ticket:** a "Timeline" view (chronological per-source publication order, using the already-available `Coverage.publishedAt`) was raised as a promising follow-on idea but isn't scoped here — worth its own ticket once this one ships.
