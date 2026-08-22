# 63 — Homepage Articles frontend integration

**What to build:** Wire the homepage main Article column to the backend-owned Article slots from
ticket 62. The frontend should render `lead`, `spotlight`, and `latest` from
`GET /api/homepage/articles` instead of fetching a generic Analysis list and deriving homepage
structure locally.

**Blocked by:** ticket 62.

**Status:** ready-for-agent

- [x] Add a frontend fetch wrapper and TanStack Query hook for `GET /api/homepage/articles`.
- [x] Stop `HomePage.tsx` from calling `useArticlesList` for the main homepage Article surface.
- [x] Remove `splitHomePageStories` from homepage rendering responsibility.
- [x] Render the backend-provided `lead`, `spotlight`, and `latest` slots with the existing visual
      structure: `LeadArticle`, `TwoCards`, and `StoryListSection`.
- [x] Preserve the existing loading, error, and empty-state visuals for the main Article column.
- [x] Do not poll the homepage Articles query. `Minuta` remains the live/refetching rail.
- [x] Do not change or remove unrelated homepage sections as part of this ticket.

## Implementation notes (agent, 2026-08-22)

- Branched from ticket 62's own branch, not `main` — ticket 62 (this ticket's blocker) isn't merged
  yet, and this ticket's frontend code genuinely needs its backend endpoint to exist to typecheck/
  build/run at all. Opened as a stacked PR (base: ticket 62's branch); GitHub will retarget it to
  `main` automatically once ticket 62 merges.
- `HomePageStory`/`isHomePageStory`/`splitHomePageStories` removed from `homePageViewModel.ts`
  (and their tests from `homePageViewModel.test.ts`) — the shared `HomepageArticleItem` type from
  ticket 62 is structurally identical (`AnalysisListItem & { status: 'complete'; summary:
  AnalysisListSummary }`) and now carries the same "guaranteed complete, guaranteed summary"
  invariant the frontend used to derive itself via `isHomePageStory`'s runtime filter.
  `StoryByline`/`StoryFigure`/`LeadArticle`/`TwoCards`/`StoryListSection` just swap their prop type
  — no rendering-logic changes.
- `useArticlesList`/`fetchArticles`/`GET /api/articles` are untouched and still used by
  `HistoryPage`'s reader view — this ticket only stops the *homepage's* main column from using
  them, per its own scope.
- Verified live: ran both dev servers together (this branch has ticket 62's backend code, since
  it's stacked on that branch), confirmed Vite transforms `HomePage.tsx` with no import/module
  error, and confirmed `GET /api/homepage/articles` flows correctly end-to-end from the frontend's
  own dev-server proxy. No headless-browser tool was available to visually confirm the rendered
  page (same limitation as tickets 51/52/61's own agent notes) — typecheck (which validates every
  prop-type change made here) and the clean Vite transform are the strongest signals available
  without one.

## Notes

Designed in the homepage structure grilling session on 2026-08-21.

This is intentionally separate from backend ticket 62. Ticket 62 creates the backend read-model
interface; this ticket consumes it and deletes the frontend's local section-splitting logic.

Do not fold source-overlap wording or threshold cleanup into this ticket. Those metric semantics
will be handled separately only when explicitly requested.
