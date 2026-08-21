# Homepage Statistics Read Model Research

Date: 2026-08-21

## Question

Ticket 59 needs the homepage `Entity dne` rail backed by real recent data. The design question is
where that aggregation belongs so it does not turn the generic Entity search/detail modules into a
homepage-specific statistics grab bag.

## Sources

- `.scratch/news-triangulator/issues/59-homepage-entity-day-aggregation.md`
- `.scratch/news-triangulator/issues/56-homepage-real-data-audit-and-ticket-fan-out.md`
- `docs/adr/0010-backend-layered-architecture.md`
- `docs/adr/0011-frontend-layering-and-hooks.md`
- `docs/adr/0024-entity-storage-table-not-json.md`
- `docs/adr/0036-salience-weighted-entity-scoring.md`
- Martin Fowler, "CQRS", https://martinfowler.com/bliki/CQRS.html
- Martin Fowler, "Command Query Separation", https://martinfowler.com/bliki/CommandQuerySeparation.html
- Microsoft Azure Architecture Center, "Materialized View pattern",
  https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view

## Findings

Ticket 59 is explicitly not an entity search/detail feature. It says the existing public entity
endpoints are "search/detail surfaces, not a 'top entities in the last 24h' rail" and asks for a
separate recent aggregation read. Ticket 56 reaches the same conclusion: `Entity.storyCount` is
corpus-wide, while the homepage needs recent-window mentions, recent source count, and an honest
trend signal.

ADR 0010 gives the backend shape: routes validate and call one service; services orchestrate and
return wire DTOs; repositories are the only layer allowed to import Prisma; mappers convert DB rows
to shared DTOs. This does not mean every query over `Entity` belongs in `repositories/entity.ts`.
That file currently owns entity-domain reads such as search, detail, events for one entity, and
relations for one entity. A homepage aggregate crosses `Entity`, `StoryEntity`, `Analysis`, and
`Coverage` for a display-specific ranking. Its module should be named for the read model it serves,
not for one table it happens to join.

ADR 0011 says each frontend server interaction should have a dedicated service wrapper and hook.
So the homepage rail should not inline `fetch` in `HomePage.tsx`, and it should not reuse entity
search hooks whose interface means "search/detail". It needs a small homepage statistics service
wrapper and hook.

ADR 0024 makes `StoryEntity` the right source for "which Stories mention entity X" and keeps
`Entity.key` as a deterministic label, not verified identity. This is enough for a homepage
aggregate as long as the DTO wording stays scoped to "events mentioning this entity" rather than
claiming global real-world identity.

ADR 0036 clarifies that `StoryEntity.salience` is per-story centrality. It is useful as a later
ranking tiebreaker, but ticket 59 only requires recent event count and recent source count. Adding
salience weighting now would be extra policy unless the ticket is amended.

Fowler's CQRS guidance supports separating write models from display/query models when one model
would otherwise do neither job well, but warns against applying CQRS everywhere. Here the useful
part is narrow: one homepage read model for a display aggregate. It does not require a broad CQRS
architecture or duplicated write path.

Fowler's Command Query Separation is a smaller fit: homepage statistics are queries. They should
return a result and not mutate state.

Microsoft's Materialized View pattern is relevant only if the aggregate becomes expensive or needs
precomputed freshness guarantees. It describes read-optimized views as useful for complex queries,
DTO/display shapes, and performance, but also calls out update/consistency overhead. For ticket 59,
the clean starting point is a computed read model query behind a homepage statistics repository.
Do not create a persisted statistics table yet unless profiling or product requirements justify
the extra consistency model.

## Recommended Module Shape

Use a homepage statistics/read-model module:

- `packages/shared/src/index.ts`: add `HomepageEntityStatItem`.
- `packages/backend/src/repositories/homepageStats.ts`: DB query for homepage aggregate rows.
- `packages/backend/src/mappers/homepageStats.ts`: row to DTO mapping, including trend omission.
- `packages/backend/src/services/homepageStatsService.ts`: define the 24h window, previous 24h
  comparison window, limit, and ranking policy; call the repository and mapper.
- `packages/backend/src/routes/homepageStats.ts`: public route such as
  `GET /api/homepage/entities`.
- `packages/frontend/src/services/homepageStats/index.ts` and `hooks.ts`: fetch wrapper and query
  hook.
- `HomePage.tsx`: `EntsPanel` consumes the hook and links rows to `/entity/:key`.

This keeps entity search/detail modules focused on entity pages while giving homepage aggregates a
place to grow for ticket 60's day stats, conflict rail, and other honest homepage statistics.

## Recommended Interface

```ts
export interface HomepageEntityStatItem {
  key: string
  canonicalName: string
  type: EntityTypeLabel
  recentEventCount: number
  recentSourceCount: number
  trendPercent?: number
}
```

Service-level constants:

- current window: last 24 hours, ending at `now`
- previous comparison window: the adjacent 24 hours before the current window
- limit: 10 rows for the rail
- ranking: `recentEventCount desc`, then `recentSourceCount desc`, then stable name/key order
- visibility: only `Analysis.status = 'COMPLETE'`
- trend: compute from event counts only when previous count is greater than zero; otherwise omit

## Avoid

- Do not add `findHomepageEntities` to `repositories/entity.ts`; it makes the Entity module a
  dumping ground for display aggregates.
- Do not add `getHomepageEntities` to `entityService.ts`; that service's interface currently means
  search/detail, not homepage stats.
- Do not persist a stats table for ticket 59 unless the query is proven too expensive.
- Do not fabricate trend numbers when the previous window has no baseline.
- Do not surface all-time `Entity.storyCount` as "today" data.
