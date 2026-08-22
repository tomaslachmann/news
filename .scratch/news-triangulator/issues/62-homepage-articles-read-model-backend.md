# 62 — Homepage Articles read model backend

**What to build:** Add a backend-owned read model for the homepage's main Article surface so the
frontend no longer decides editorial structure by splitting a generic list response. The backend
returns homepage-ready Article slots: one lead Article, two spotlight Articles, and the remaining
latest Articles.

**Blocked by:** ticket 60.

**Status:** done

- [x] Add ADR 0037 documenting read-model repositories for composed/aggregate read surfaces, and
      amend ADR 0010 with a short note pointing to that ADR.
- [x] Add shared types reusing the existing typed article shape:
      `HomepageArticleItem = AnalysisListItem & { status: 'complete'; summary: AnalysisListSummary }`
      and `HomepageArticles = { lead: HomepageArticleItem | null; spotlight: HomepageArticleItem[];
      latest: HomepageArticleItem[] }`.
- [x] Add public `GET /api/homepage/articles` with no Admin/auth middleware.
- [x] Implement dedicated backend modules for this surface:
      `repositories/homepageArticles.ts`, `mappers/homepageArticles.ts`, and
      `services/homepageArticlesService.ts`.
- [x] Include only reader-visible `COMPLETE` Analyses that have a `SynthesisResult`.
- [x] Order deterministically by `Analysis.createdAt DESC, Analysis.id DESC`.
- [x] Slot the ordered rows as `lead` (first item), `spotlight` (next two), and `latest` (next
      eight).
- [x] Reuse the existing display-title and `AnalysisListSummary` mapping semantics; do not invent
      a new homepage teaser, image, entity, or outlet DTO.
- [x] Add backend tests at the existing project seams: route/service tests, and repository coverage
      only if the query becomes complex enough to warrant DB-level verification.

## Implementation notes (agent, 2026-08-22)

- Ticket 60's real merge status wasn't reflected in its own Status field (merged via GitHub PR #86
  without going through `ticket-done.mjs`) — corrected both that and ticket 61's Status directly on
  `main` before starting this ticket, so `ticket-start.mjs`'s blockedBy check would pass honestly
  rather than being bypassed.
- No route-level test file exists anywhere in this codebase (routes are thin — validate, call one
  service, respond, per ADR 0010) — tests landed at the service (`homepageArticlesService.test.ts`)
  and mapper (`homepageArticles.test.ts`) seams, matching every other `/api/homepage/*` route's own
  test coverage. No repository-level test: the query is no more complex than `findAnalysesPage`'s
  own (no dedicated test either), so DB-level verification wasn't warranted per the ticket's own
  hedge.
- `toHomepageArticleItem` throws (doesn't silently degrade) if a row somehow isn't actually
  COMPLETE-with-summary — the repository query is the real guarantee, this is a loud defensive
  check at the one call site that assumes it holds.
- Smoke-tested live against the real dev DB: `GET /api/homepage/articles` correctly slots the
  newest Article as `lead`, the next two as `spotlight`, and returns however many `latest` rows
  actually exist (4, not padded to 8) given the dev DB currently has 7 COMPLETE Articles total.
- Self-review (`/code-review`) found that `findHomepageArticleRows` had copy-pasted
  `findAnalysesPage`'s entire Prisma `include` and row-projection verbatim instead of sharing it —
  a real risk of the two silently desyncing on what an `AnalysisListRow` selects. Fixed by
  extracting `ANALYSIS_LIST_ROW_INCLUDE`/`toAnalysisListRow` into `repositories/analysis.ts` and
  having both `findAnalysesPage` and `findHomepageArticleRows` call them.

## Notes

Designed in the homepage structure grilling session on 2026-08-21.

The important module seam is the homepage Article read model, not the React component. The frontend
should not need to know that "lead" means array index 0, "spotlight" means indexes 1-2, or "latest"
means the rest. That structure is a product/read-model decision and belongs behind the backend
interface.

`createdAt` is accepted as the ordering timestamp for this ticket because the current schema does
not expose a durable completion timestamp. If ordering by completion time becomes important, file a
separate schema/read-model ticket rather than overloading this one.
