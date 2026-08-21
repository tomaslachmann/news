# 51 — Illustrative images in the Cross-Source Narrative article

**What to build:** Today the only imagery in a rendered `NarrativeArticle` is a small `EntityImage`
(ticket 41 / ADR 0034) shown in a hover tooltip when an entity mention is linked to Wikidata — easy
to miss, and only exists for entities an Admin has manually linked. Add real illustrative imagery to
the article itself: at minimum a lead/hero image at the top, sourced from a free/licensed image
bank by topic relevance — **not** scraped from any source outlet's own article image (licensing —
see project memory / this ticket's Notes).

**Blocked by:** none.

**Status:** done

- [x] Pick one provider for illustrative images. Default to **Wikimedia Commons** (same provider
      ticket 41's `EntityImage` already uses — no new API key/credential to provision, consistent
      licensing story) unless investigation during implementation finds a concrete reason to add a
      second provider (e.g. Commons has too little topical/editorial coverage vs a stock API like
      Unsplash/Pexels — if so, get sign-off before adding a new paid/keyed dependency).
- [x] A backend step selects a candidate image for a `NarrativeDocument` by topic relevance — likely
      driven by the generated headline (ticket 32) and/or the document's own entity refs, not a new
      LLM call if a plain search-API query against the provider is sufficient.
- [x] Selected image (URL + attribution/license line the provider requires) is persisted alongside
      the `NarrativeDocument`/`SynthesisResult` (mirrors how `EntityImage` persists what it fetches
      — ticket 41), not re-fetched live on every page view.
- [x] `NarrativeArticle` renders a lead image at the top of the article when one was found; no
      broken-image state or layout break when none was.
- [x] Every illustrative image is visibly captioned as illustrative — e.g. "Ilustrační foto" (the
      standard Czech news convention for a non-documentary stock image) plus required attribution —
      so a reader can never mistake it for actual photographic evidence of the event. This is a hard
      requirement, not a nice-to-have: this tool's whole premise is not fabricating or misrepresenting
      what actually happened (CLAUDE.md), and an uncaptioned stock photo next to a news article reads
      as documentary evidence it isn't.
- [x] Regeneration/backfill story for already-COMPLETE analyses decided and noted (e.g. a one-off
      script per `scripts/regen-one-narrative.ts`'s existing pattern, or "new analyses only, no
      backfill" per ADR 0021's established no-backfill convention for this project — either is fine,
      just be explicit about which).
- [x] Smoke test against a real dev-DB Analysis: attached a real Wikimedia Commons image via the
      same search/persist path the job uses, confirmed `GET /api/analyses/:id` returns the correct
      `leadImage` shape end-to-end, and confirmed the frontend builds/typechecks against the new
      `NarrativeArticle` prop. No headless-browser/screenshot tool was available in this session to
      visually confirm the rendered pixels — see the Notes below.

## Notes

Do not scrape/reuse any source outlet's own article image — those are licensed to the publisher.
User's explicit call: "we cant scrape their image since its licensed, terrible idea, we will provide
illustrative images across some data banks." This is a hard constraint, not a style preference.

Multiple inline images (one per major section, not just a lead image) would be a natural follow-on
but is not required for this ticket — scope to a lead image first and revisit if it reads too sparse
in the browser smoke test.

**Implementation notes (agent, 2026-08-21):** a full generated headline (a whole, grammatically
inflected Czech sentence) turned out to return zero Commons search hits far more often than
expected when smoke-tested against real dev-DB Analyses — Commons' search doesn't handle declined
noun forms well. Fixed by falling back to the Story's most-salient entity `canonicalName`s (already
loaded for the Narrative LLM call, so no extra query) when the headline search finds nothing; a bare
place/person/org name hits reliably. No browser/screenshot tool was available in this session, so
the "visual smoke test in the browser" bullet above was verified as far as tooling allowed (backend
→ API → frontend data flow, confirmed against a real attached image) but not by looking at actual
rendered pixels — worth a quick manual look before/after merging.
