# 55 — Entity browse/list page + richer entity detail

**What to build:** No entity browse/list page exists yet — `AdminEntityWikidataPage`'s own comment
notes this explicitly (ticket 41). `EntityDetailPage` (ticket 42/ADR 0035) also under-renders what's
already available: it links out to Wikidata but never shows the entity's own `EntityImage` (ticket
41, already rendered inline-tooltip-only in the narrative per ticket 48) or any Wikidata-sourced
description. Add a reader-facing entity list/browse page, and round out the detail page with the
image and a short description.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] New reader-facing entity browse/list page (route TBD by implementer, e.g. `/entities`) using
      `GET /api/entities?q=...` (ticket 42, already public) for search, with the same
      cursor-pagination/`LoadMoreButton` pattern used elsewhere in this codebase — no new backend
      list endpoint should be needed unless search-with-no-query (browse-all) isn't already
      supported by `entityService.searchEntities`, in which case extend it rather than add a
      parallel endpoint.
- [ ] Each result links to `/entity/:key` (existing route).
- [ ] Built with this repo's existing `ds/components.css` design-system conventions — the same
      pattern every other page (`EntityDetailPage`, `AdminEntityWikidataPage`, etc.) already
      follows. No external mockup exists for this page; don't block on one.
- [ ] `EntityDetailPage` renders the entity's `EntityImage` (when one exists) — degrading gracefully
      with no layout break when absent, same posture ticket 48 already established for the
      narrative's own entity-image rendering.
- [ ] `EntityDetailPage` renders a short Wikidata-sourced description under the entity name when
      `wikidataId` is linked (new field — Wikidata's own short `description` claim, fetched
      alongside/similarly to how `EntityImage` is fetched in ticket 41, cached rather than
      refetched live per page view).

## Notes

User's own comment was uncertain about scope here ("uvidime" — "we'll see"). This ticket resolves
that by scoping to: a browse/list page using existing search + existing design system, plus
rendering data this codebase has already fetched (`EntityImage`) or can cheaply add (a short
Wikidata description) — not a from-scratch visual redesign. If the user has an actual mockup or
stronger opinion on layout by the time this is picked up, get that before starting rather than
building against this ticket's default reading.
