# 46 — Entity Alias Merge: Admin UI

**What to build:** The Admin-facing screen for ticket 40's Entity Alias Merge backend — a
candidates list (ranked same-entity pairs) with confirm/reject actions, mirroring
`IngestionReviewPage.tsx`'s `DraftsSection` list-plus-action-buttons pattern.

**Blocked by:** 40 (Entity Alias Merge — backend). Needs `GET /api/admin/entity-aliases/candidates`,
`POST /api/admin/entity-aliases/:pairId/confirm`, and `POST /api/admin/entity-aliases/:pairId/reject`
to exist first.

**Status:** ready-for-agent

## Mechanics

- [ ] `services/entityAliases/index.ts` + `hooks.ts` (frontend), mirroring `services/ingestion/`'s
  shape: plain `fetch` wrappers with `credentials: 'include'`, TanStack Query `useQuery`/
  `useMutation`, query-key invalidation on confirm/reject success.
- [ ] New page (e.g. `EntityAliasesPage.tsx`) with a candidates list: each row shows both entities'
  canonical names, types, story counts, and the similarity score, plus confirm/reject buttons
  (`QitemActions`-style, disabled while a mutation is in flight). Confirming a candidate needs the
  Admin to pick which of the two entities survives — the backend's confirm endpoint takes a
  `survivingEntityId`, so the UI needs some way to indicate the choice (e.g. two labelled buttons,
  "Merge into A" / "Merge into B", not just one generic "Confirm").
- [ ] Wired into the router: new route (e.g. `/admin/entity-aliases`) under the existing
  `AdminLayout`/`ProtectedRoute` wrapper in `App.tsx`, following `/admin/ingestion`'s exact shape.
- [ ] Nav link added to `AdminChrome.tsx` alongside the existing "Kontrola sběru"/"Uživatelé" links.
- [ ] Empty state when there are no candidates above the similarity threshold.

## Notes

Split out of ticket 40 so the backend (model, migration, merge mechanics, routes) can ship and be
tested independently via the API before the UI is built on top of it.
