# 48 — Cross-Source Narrative: Article Rendering (Frontend)

**What to build:** Render the structured `NarrativeDocument` (ticket 47) as continuous,
human-readable prose — replacing ticket 20's shipped segment-based `NarrativeArticle` component
(numbered superscript citations, flat References section). Entity/value/source inline references
render as in-text annotations, not raw markup or a disconnected list. See
[ADR 0034](../../../docs/adr/0034-structured-narrative-document.md).

**Blocked by:** 47.

**Status:** ready-for-agent

- [x] New rendering component consuming `NarrativeDocument.blocks`, rendering each
      `NarrativeInline` run (`text`/`entity`/`source`/`value`) inline within paragraphs, headings,
      quotes, and list items.
- [x] Entity inline references link to `/entity/:key` (ticket 43) when that route exists; degrade
      gracefully to plain, non-linked text if ticket 43 hasn't shipped yet — same
      "degrades gracefully without 40/41" posture ticket 42 already established for its own
      dependency, not a hard block on this ticket.
- [x] Entity inline references show that entity's `EntityImage` (ticket 41) inline or on hover where
      one exists; no layout break or broken-image state when absent.
- [x] Source inline references render distinctly from entity/value references (existing citation
      styling as a starting point, adjusted as needed).
- [x] `quote` blocks render as an actual blockquote, visibly attributed to its one cited Source.
- [x] Old `NarrativeArticle` segment-based rendering, its numbered-citation logic, and the flat
      References section are removed outright — not kept behind a flag alongside the new
      rendering.
- [x] Visual smoke test in the browser against a real regenerated Analysis (per `CLAUDE.md`'s
      UI-testing guidance) — confirm entity/value/source references render distinctly from plain
      prose and a quote block reads as a quote, not a plain paragraph.

## Notes

Entity-page linking (ticket 43) and `EntityImage` display (ticket 41) are optional enhancements
this ticket should degrade gracefully without, not hard dependencies — mirrors the posture ticket
42 already established for its own reliance on tickets 40/41.
