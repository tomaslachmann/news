# 62 — Homepage Articles read model backend

**What to build:** Add a backend-owned read model for the homepage's main Article surface so the
frontend no longer decides editorial structure by splitting a generic list response. The backend
returns homepage-ready Article slots: one lead Article, two spotlight Articles, and the remaining
latest Articles.

**Blocked by:** ticket 60.

**Status:** ready-for-agent

- [ ] Add ADR 0037 documenting read-model repositories for composed/aggregate read surfaces, and
      amend ADR 0010 with a short note pointing to that ADR.
- [ ] Add shared types reusing the existing typed article shape:
      `HomepageArticleItem = AnalysisListItem & { status: 'complete'; summary: AnalysisListSummary }`
      and `HomepageArticles = { lead: HomepageArticleItem | null; spotlight: HomepageArticleItem[];
      latest: HomepageArticleItem[] }`.
- [ ] Add public `GET /api/homepage/articles` with no Admin/auth middleware.
- [ ] Implement dedicated backend modules for this surface:
      `repositories/homepageArticles.ts`, `mappers/homepageArticles.ts`, and
      `services/homepageArticlesService.ts`.
- [ ] Include only reader-visible `COMPLETE` Analyses that have a `SynthesisResult`.
- [ ] Order deterministically by `Analysis.createdAt DESC, Analysis.id DESC`.
- [ ] Slot the ordered rows as `lead` (first item), `spotlight` (next two), and `latest` (next
      eight).
- [ ] Reuse the existing display-title and `AnalysisListSummary` mapping semantics; do not invent
      a new homepage teaser, image, entity, or outlet DTO.
- [ ] Add backend tests at the existing project seams: route/service tests, and repository coverage
      only if the query becomes complex enough to warrant DB-level verification.

## Notes

Designed in the homepage structure grilling session on 2026-08-21.

The important module seam is the homepage Article read model, not the React component. The frontend
should not need to know that "lead" means array index 0, "spotlight" means indexes 1-2, or "latest"
means the rest. That structure is a product/read-model decision and belongs behind the backend
interface.

`createdAt` is accepted as the ordering timestamp for this ticket because the current schema does
not expose a durable completion timestamp. If ordering by completion time becomes important, file a
separate schema/read-model ticket rather than overloading this one.
