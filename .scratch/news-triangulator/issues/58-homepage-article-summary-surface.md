# 58 — Homepage article summary data surface

**What to build:** Replace the homepage's fabricated lead/cards/story list with real COMPLETE
Article data while keeping the current homepage structure. The existing public list endpoint
(`GET /api/analyses`) is too thin, and the detail endpoint (`GET /api/analyses/:id`) is too rich
and too N+1-heavy for homepage use. Add a homepage/listing summary surface and wire the main-column
sections to it.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] Define one reader-facing summary DTO for homepage/listing cards, sourced from COMPLETE
      Analyses, carrying the fields the current homepage shape actually needs (at minimum: id,
      display title, createdAt/time, coverageCount, a short teaser/perex, source-overlap/conflict
      signal, lightweight source summary, lightweight entity summary, and lead image metadata when
      available).
- [ ] Implement the backend/API path for that summary surface; prefer extending the public
      listing/read model coherently rather than teaching `HomePage` to fan out into many
      `GET /api/analyses/:id` calls.
- [ ] Wire `LeadArticle`, `TwoCards`, and `StoryListSection` to real data from that summary
      surface, preserving the homepage's current structure and honest empty/loading states.
- [ ] Resolve imagery honestly: use existing generated `leadImage` data when present, and degrade
      gracefully when absent; do not fabricate descriptive captions the backend does not have.
- [ ] Resolve the current topic/rubric kicker honestly: either omit it for now or replace it with
      another real label already present in the data. Do **not** invent a category field that the
      model/database does not yet hold.

## Notes

Filed from ticket 56's homepage audit on 2026-08-21. Existing raw inputs already scattered across
`AnalysisListItem` and `AnalysisDetail` are enough to justify this as a buildable ticket, but not
enough to justify the current homepage client pulling detail per card. The point of this ticket is
to add the right summary shape first, then wire the homepage to it.
