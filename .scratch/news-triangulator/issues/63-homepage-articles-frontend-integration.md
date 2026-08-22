# 63 — Homepage Articles frontend integration

**What to build:** Wire the homepage main Article column to the backend-owned Article slots from
ticket 62. The frontend should render `lead`, `spotlight`, and `latest` from
`GET /api/homepage/articles` instead of fetching a generic Analysis list and deriving homepage
structure locally.

**Blocked by:** ticket 62.

**Status:** ready-for-agent

- [ ] Add a frontend fetch wrapper and TanStack Query hook for `GET /api/homepage/articles`.
- [ ] Stop `HomePage.tsx` from calling `useArticlesList` for the main homepage Article surface.
- [ ] Remove `splitHomePageStories` from homepage rendering responsibility.
- [ ] Render the backend-provided `lead`, `spotlight`, and `latest` slots with the existing visual
      structure: `LeadArticle`, `TwoCards`, and `StoryListSection`.
- [ ] Preserve the existing loading, error, and empty-state visuals for the main Article column.
- [ ] Do not poll the homepage Articles query. `Minuta` remains the live/refetching rail.
- [ ] Do not change or remove unrelated homepage sections as part of this ticket.

## Notes

Designed in the homepage structure grilling session on 2026-08-21.

This is intentionally separate from backend ticket 62. Ticket 62 creates the backend read-model
interface; this ticket consumes it and deletes the frontend's local section-splitting logic.

Do not fold source-overlap wording or threshold cleanup into this ticket. Those metric semantics
will be handled separately only when explicitly requested.
