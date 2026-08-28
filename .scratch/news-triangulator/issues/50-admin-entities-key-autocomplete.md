# 50 — Autocomplete for the entity key field on `/admin/entities`

**What to build:** `AdminEntityWikidataPage` (Wikidata linking flow, ticket 41) currently requires
typing an `Entity.key` by hand into a free-text field ("Klíč entity") — the page's own comment notes
"no entity browse/list page exists yet... so this takes the Entity's `key` as a direct input rather
than a picker." A reader-facing entity search already exists (`GET /api/entities?q=...`, ticket 42,
`useEntitySearch`) and is public/unauthenticated — reuse it here to replace free-text key entry with
a type-ahead picker.

**Blocked by:** none.

**Status:** ready-for-agent

- [x] The "Klíč entity" field becomes a type-ahead: as the admin types, call `useEntitySearch`
      (debounced) and show matching entities (`canonicalName`, `type`, existing `wikidataId` if
      already linked) in a dropdown.
- [x] Selecting a result fills `entityKey` (and can prefill the "Hledaný výraz" query with the
      entity's `canonicalName` as a starting point for the Wikidata search, without forcing it).
- [x] Manually typing a full key and submitting still works if the admin knows it already — this is
      an enhancement, not a removal of the existing direct-entry path.
- [x] No new backend endpoint — reuse `GET /api/entities?q=...` as-is (it's already public; no
      `requireAdmin` gate needed for a read-only search this page merely displays).
- [x] Dropdown is keyboard-navigable (arrow keys + Enter) and dismisses on blur/Escape, consistent
      with this repo's existing form/input patterns (`ds/components.css`).

## Notes

If ticket 55 (entity browse/list page) lands first, this field could instead link out to a picker
on that page — but don't block this ticket on 55; the inline type-ahead is a complete, independent
improvement on its own.

## Implementation notes (2026-08-28)
- New `components/EntityAutocomplete.tsx` (+ `.css`, + pure `entityAutocompleteModel.ts` for the
  raw-key regex and arrow-nav wrap, unit-tested) — a plain positioned dropdown, no popover lib.
  Debounced via a new `lib/useDebouncedValue.ts` (200 ms).
- `EntitySearchResultItem` / `EntitySearchRow` gained `wikidataId: string | null` so the dropdown
  can show a "propojeno" marker; `searchEntitiesByName`'s SELECT and the mapper updated. The
  public `/search` page ignores the new field.
- `AdminEntityWikidataPage`: the "Klíč entity" free-text field is now the type-ahead; picking an
  entity resolves its key behind the scenes and prefills the Wikidata query with its canonical
  name. Pasting a `type:slug` key and pressing Enter still works (the "Použít klíč …" affordance).
- Incidental: `packages/backend/vitest.config.ts` now pins `EXTRACTION_MODEL` / `SYNTHESIS_MODEL`
  / `ENTITY_MODEL` / `EMBEDDING_MODEL` for the test env — 4 pass tests were failing on `main`
  because vitest loads the dev `.env` (which sets these to `gpt-5.4-nano`) and they assert the
  exact model id. Pre-existing, unrelated to this ticket, fixed here to get a green suite.
