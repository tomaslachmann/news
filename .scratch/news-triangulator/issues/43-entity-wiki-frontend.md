# 43 — Entity Wiki Frontend

**What to build:** A reader-facing entity search UI and entity detail page, plus links from an Event's own Article page to the entities it mentions. See [docs/spec-entity-wiki.md](../../../docs/spec-entity-wiki.md).

**Blocked by:** 42 — Entity Browse/Search Backend.

**Status:** ready-for-agent

- [ ] Entity detail page (route `/entity/:key`): canonical name, type, paginated list of mentioning Events (each linking to its Article page), aggregated entity-relations (each shown with its asserting Event linked beside it — never a bare fact list).
- [ ] Search UI: a search box (nav-bar-surfaced or a dedicated search page — implementation-time judgment) that lists matching entities and links to their detail pages.
- [ ] `AnalysisPage.tsx`: entity mentions for the current Event link to their own entity pages, using the `key` already present on `StoryEntity`.
- [ ] Entity page renders "no Wikidata link" / "no known aliases" gracefully when tickets 40/41 haven't shipped or haven't linked this particular entity yet — never a broken or missing section.
- [ ] Public listing/homepage unchanged — this is an additive navigation surface only.
