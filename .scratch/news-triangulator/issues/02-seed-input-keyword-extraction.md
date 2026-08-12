# 02 — Seed Input & Keyword Extraction

**What to build:** The landing page (`/`) shows a URL input. The user pastes a Czech news article URL and submits. The backend scrapes the article's title and opening paragraphs, calls the Extraction Model to produce 3–5 Czech search keywords, creates an Analysis record in PostgreSQL (status: `pending`), and returns the analysis ID and proposed keywords. The frontend stays on `/` but transitions to a keyword-editing view where the user can edit, add, or remove keywords before proceeding to Discovery.

**Blocked by:** 01 — Project Scaffold; 10 — Authentication & Authorization.

**Status:** done

- [x] Submitting a valid URL from the `/` input calls `POST /api/analyses` and the UI transitions to a keyword-editing step without a page navigation
- [x] The backend scrapes the seed article via plain HTTP fetch (no headless browser); title and first ~3 paragraphs are extracted
- [x] The backend calls the Extraction Model with the scraped content and returns 3–5 Czech search keywords in the response
- [x] An `Analysis` row is created in PostgreSQL with `status: "pending"`, `seedUrl` set, and `seedHeadline` populated from the scraped title
- [x] The keyword-editing step renders each keyword as an editable chip; the user can modify, delete, and add keywords
- [x] A "Discover sources" button is shown once at least one keyword exists; it is disabled while the POST is in-flight
- [x] Submitting a string that is not a valid URL shows a validation error inline without hitting the backend
- [x] If the seed URL fetch fails (non-200, timeout, DNS failure), the backend returns a 422 with a human-readable error and the frontend shows it without crashing
- [x] `POST /api/analyses` is guarded by the `requireAdmin` middleware; unauthenticated or non-Admin requests receive 401/403
- [x] The seed URL input form is not rendered when `AuthContext` role is not `ADMIN`
- [x] `POST /api/analyses` response shape matches the type defined in `packages/shared`
