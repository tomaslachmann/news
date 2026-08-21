# 59 — Homepage "Entity dne" aggregation rail

**What to build:** Replace the homepage's fabricated `Entity dne` panel with a real recent-entity
aggregation backed by the existing `Entity` / `StoryEntity` model. The current public entity
endpoints are search/detail surfaces, not a "top entities in the last 24h" rail.

**Blocked by:** none.

**Status:** ready-for-agent

- [x] Define the homepage entity-rail time window and ranking rule explicitly (the mockup says
      "za 24 hodin"; keep that unless implementation finds a hard blocker).
- [x] Add a backend/API surface returning the top recent entities in homepage-ready form:
      entity key, canonical name, type, recent mention/event count, recent source count, and a
      trend/comparison signal if one can be computed honestly from adjacent windows.
- [x] Wire `EntsPanel` to that real aggregate surface, preserving links into `/entity/:key`.
- [x] If a trend percentage cannot be computed honestly from current persisted data, omit that
      part of the rail rather than substituting a fake number.

## Notes

Filed from ticket 56's homepage audit on 2026-08-21. The existing reader-facing entity search and
detail routes are intentionally left alone; this ticket adds the separate recent-aggregation read
that the homepage rail actually needs.
