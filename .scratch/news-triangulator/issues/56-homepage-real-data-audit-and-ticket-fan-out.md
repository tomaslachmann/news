# 56 — Homepage real-data audit + ticket fan-out

**What to build:** `HomePage.tsx` keeps its current information architecture, but it is still
entirely sample content. Before replacing sections piecemeal, audit what each existing homepage
section needs from the backend/data model so the current shape can be wired to real data, then fan
that audit out into multiple concrete implementation tickets.

**Blocked by:** none.

**Status:** done

- [x] Inventory every current homepage section and identify which ones are still fabricated sample
      content (`lead`, story cards/listing, entities panel, ticker, minute feed, conflicts, most
      read, any remaining placeholder imagery/captions).
- [x] For each section, record the current backend/API/data-model support that already exists and
      the exact missing shape needed to render it with real data while keeping the current homepage
      structure.
- [x] Distinguish "can be wired with existing endpoints + transforms" from "needs new backend/API
      work" from "needs a product call because no honest real-data equivalent exists yet."
- [x] Produce multiple follow-up implementation tickets from that audit, grouped into buildable
      chunks rather than one giant homepage rewrite ticket.
- [x] Note explicitly any homepage section that the audit concludes should remain absent or degrade
      to an empty state until a real backing signal exists, rather than being filled with invented
      data.

## Notes

Scoped directly from ticket 54's grilling session on 2026-08-21. The user's decision was to keep
the homepage's current structure and use this ticket to answer a narrower question first: "what
backend/data shape is missing in which form so we can connect it to real data?" This ticket is not
a redesign and not the implementation itself; it is the dependency/spec pass that should generate
the implementation tickets.

## Audit outcome

**Audit completed 2026-08-21.**

Current homepage sections, all still fabricated today:

- `DayStatsBar` — processed today / active sources / new contradictions / average agreement /
  fastest source
- `LeadArticle`
- `TwoCards`
- `StoryListSection`
- `EntsPanel` ("Entity dne")
- `PullQuoteSection`
- `MinuteFeedSection`
- `ConflictsSection`
- `MostReadSection`
- `LegendSection` is static explanatory copy, not mock data
- imagery/captions: current lead/card/thumb placeholders are mockup stand-ins, not real article
  imagery or real generated-image metadata

### Section-by-section backend/data audit

**1. Lead article + cards + story list**

Current support already present:

- `GET /api/analyses` already returns the public reverse-chronological list of COMPLETE Analyses
  for non-Admin callers (`AnalysisListItem`: `id`, `title`, `createdAt`, `coverageCount`,
  `status`).
- `GET /api/analyses/:id` already returns richer reader-facing detail for a COMPLETE Analysis:
  `sourceOverlap`, `narrative`, `leadImage`, `coverages`, `entities`, `relatedEvents`, `thread`.

What is still missing to keep the current homepage shape honestly:

- a homepage/listing summary shape for each Article, so the homepage does not have to issue N+1
  detail fetches just to render the lead + cards + story rows
- a stable teaser/perex field; the current homepage lead/cards use explicit short summary prose,
  but no such field exists in `AnalysisListItem`
- a homepage-safe image field; `AnalysisDetail.leadImage` exists, but only on the detail route and
  carries attribution metadata rather than a ready-made homepage caption/summary pairing
- a decision on topical kicker text (`Ekonomika`, `Domácí`, etc.); there is currently no
  `primaryCategory`/rubric field on `Story` or `Analysis` (already named future work in
  `docs/spec-event-graph.md`)
- a decision on whether the current byline/source strip should be fed from `coverages`,
  `sourceOverlap`, and `entities` as-is, or whether the homepage needs a precomputed summary DTO

Classification:

- **Needs new backend/API work** for a homepage summary surface, even though some raw inputs
  already exist in `GET /api/analyses/:id`
- **Needs a product call** for the topical kicker/rubric, because there is no honest category
  field in the model today

**2. Entity dne (`EntsPanel`)**

Current support already present:

- reader-facing entity search/detail exists (`GET /api/entities?q=...`, `GET /api/entities/:key`)
- the data model already has `Entity.storyCount` and per-Story `StoryEntity.salience`

What is still missing:

- a homepage-specific aggregate of top entities in a recent time window (the current panel is
  "today", not all-time search)
- a real "mentions" count for the rendered circles; `storyCount` is corpus-wide event count, not
  "mentions in the last 24 hours"
- a real trend signal (`+12 %`, `-4 %`) comparing one recent window with another
- a per-entity recent-source count (`24 zdrojů`) for the same time window

Classification:

- **Needs new backend/API work**; existing entity search/detail endpoints are not the right shape
  for a "top entities in the last 24h" rail

**3. DayStatsBar**

Current support already present:

- pieces of the underlying raw data exist across the system: Analyses, Sources, SynthesisResults,
  Coverage

What is still missing:

- one aggregate read that computes homepage stats in a single honest shape
- explicit definitions for each metric's denominator/time window
- a real source for "fastest source" if that metric is to survive; no current public DTO or
  persisted metric obviously represents homepage-ready source speed

Classification:

- **Needs new backend/API work** for most stats
- **Needs a product call** on whether "fastest source" has an honest definition worth surfacing;
  if not, it should be omitted rather than fabricated

**4. Minute feed**

Current support already present:

- reverse-chronological COMPLETE Analyses already exist via `GET /api/analyses`
- `AnalysisDetail.sourceOverlap` / contradictions can help classify an item once fetched

What is still missing:

- a decision on what a homepage "minute" item actually is in this product: latest completed
  Articles, latest updated Stories, or some separate cross-Article live feed
- if it maps to latest completed Articles, a feed-oriented summary shape with timestamp, title,
  source count, and optional conflict marker

Classification:

- **Needs a product call first** on what the feed represents
- then likely **needs new backend/API work** for the chosen feed shape

**5. Rozpory ve zdrojích**

Current support already present:

- each COMPLETE Analysis already carries contradiction data in `synthesisResult.contradiction`
- each contradiction item already carries prose and attributions

What is still missing:

- an aggregate "top contradictions across the homepage time horizon" surface
- a selection/ranking rule for which contradictions rise to the homepage rail
- a compact DTO suitable for the rail without fetching many full Analysis detail payloads client-side

Classification:

- **Needs new backend/API work** for cross-Analysis contradiction aggregation

**6. Nejčtenější**

Current support already present:

- none; the product currently has no reader analytics / pageview / read-count signal

What is still missing:

- an actual readership metric or analytics subsystem

Classification:

- **No honest real-data equivalent exists yet**
- this section should remain absent, or degrade to an empty/omitted state, until/if readership
  tracking becomes a real product decision

**7. Pull quote / "Z dnešní analýzy rozporů"**

Current support already present:

- raw contradiction quotations exist inside Analysis dimensions / source attributions

What is still missing:

- a principled selection rule for why one quote becomes the homepage pull quote of the day
- a real product definition for whether this is editorial spotlighting, strongest contradiction,
  or something else

Classification:

- **Needs a product call first**
- until then, this section should remain absent rather than pretending one contradiction is
  homepage-worthy by default

**8. Legend / methodology box**

Current support already present:

- static explanatory copy only; no backend dependency

Classification:

- **Can stay as-is**; no backend work required

**9. Imagery / captions**

Current support already present:

- `AnalysisDetail.leadImage` already exists for COMPLETE Analyses (`imageUrl`, `author`, `license`,
  `sourceUrl`)

What is still missing:

- a homepage/listing-safe way to carry that image in the summary surface
- a decision on caption treatment: the current homepage lead figure uses a descriptive editorial
  caption, but the existing image DTO only supports attribution metadata, not a semantic caption

Classification:

- **Partly wireable from existing data**, but better handled inside the homepage article-summary
  ticket rather than as a separate image-only project
- if no honest caption exists, use image attribution or no visible caption; do not fabricate a
  descriptive one

### Overall split

This audit resolves into three buildable follow-up tracks:

- **58 — Homepage article summary data surface**
- **59 — Homepage entity aggregation rail**
- **60 — Homepage aggregate rails + honest omissions**

### Explicit honest absences until real signal exists

These sections should not be filled with invented data while the follow-up work lands:

- `Nejčtenější` — absent until real readership tracking exists
- homepage pull quote — absent until a product rule exists for selecting one honestly
- topical/rubric kicker text — absent until a real category field exists, or a later product
  decision chooses a different honest label
- `DayStatsBar`'s "Nejrychlejší zdroj" — absent unless a concrete backend metric is defined and
  exposed
