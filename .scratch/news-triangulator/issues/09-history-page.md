# 09 — History Page

**What to build:** The `/history` route shows a chronological list of past Analyses stored in PostgreSQL. Each entry displays the seed article headline, the date the analysis ran, the number of Coverages used, and a status badge. Clicking an entry navigates to `/analysis/:id` where the stored result renders without replaying the stream.

**Blocked by:** 07 — Synthesis Pass. (Can be worked in parallel with 08.)

**Status:** done

- [x] `GET /api/analyses` returns all Analyses sorted by `createdAt` descending, each with: `id`, `seedHeadline`, `createdAt`, `coverageCount` (count of Coverages with `status: "ok"`), `status`
- [x] The `/history` page fetches and renders this list on mount
- [x] Each list entry shows: seed article headline, human-readable date (e.g. "12 Aug 2026"), coverage count ("5 sources"), and a status badge (`complete` | `failed` | `pending`)
- [x] Clicking a `complete` entry navigates to `/analysis/:id`; the Analysis Results UI (ticket 08) loads the stored result
- [x] Clicking a `failed` entry navigates to `/analysis/:id` which shows the error state
- [x] An empty state is shown when no Analyses exist yet, with a prompt to start one
- [x] The nav bar (or equivalent) provides a link to `/history` from `/analysis/:id` and from `/`
- [x] `GET /api/analyses` response shape matches the type defined in `packages/shared`
