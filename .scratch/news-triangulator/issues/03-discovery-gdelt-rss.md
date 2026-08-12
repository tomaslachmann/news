# 03 — Discovery: GDELT + RSS

**What to build:** After the user confirms the search keywords, the frontend triggers Discovery. The backend queries the GDELT DOC API with `sourcelang:Czech` and the confirmed keyword string. If fewer than 5 unique-domain results are returned, the backend also polls the RSS feeds of 8 configured Czech outlets (iDnes, Novinky, Aktuálně, ČT24, Seznam Zprávy, iRozhlas, Hospodářské noviny, Deník) and merges results. Duplicates are removed (one article per domain, first match wins). The deduplicated candidates are stored as `Coverage` rows and returned to the frontend, which navigates the user to `/review` and renders the candidate list.

**Blocked by:** 02 — Seed Input & Keyword Extraction. (Auth guard inherited via 02's dependency on 10.)

**Status:** ready-for-agent

- [ ] `POST /api/analyses/:id/discover` is guarded by the `requireAdmin` middleware
- [ ] Confirming keywords calls `POST /api/analyses/:id/discover` with the final keyword array
- [ ] The backend queries the GDELT DOC API (`https://api.gdeltproject.org/api/v2/doc/doc`) with `sourcelang:Czech`, `sourcecountry:CZ`, `mode=artlist`, `format=json`, and the keyword string
- [ ] If GDELT returns fewer than 5 unique-domain results, the backend fetches RSS feeds for all 8 configured Czech outlets in parallel and merges results
- [ ] Results across both layers are deduplicated to one article per domain (first match wins); maximum 10 candidates total
- [ ] Each candidate is stored as a `Coverage` row on the Analysis with `status: "pending"`
- [ ] The endpoint returns candidates as `{ outlet, title, url, publishedAt }[]` matching the type in `packages/shared`
- [ ] The frontend navigates to `/review` and renders the candidate list with outlet name, article title, and publication date
- [ ] If GDELT is unreachable (timeout or non-200), the backend falls back to RSS-only, logs a warning, and does not return an error to the frontend
- [ ] If both GDELT and RSS return zero results, the endpoint returns an empty array and the frontend shows an empty state with a message
- [ ] The 8 RSS feed URLs are configurable (not hardcoded inline) so they can be updated without logic changes
