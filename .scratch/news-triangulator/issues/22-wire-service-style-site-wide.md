# 22 — Wire Service Style, Applied Site-Wide

**What to build:** Apply the "Wire Service" visual direction — chosen for the Article page (ticket 20) and confirmed for the navbar + Articles listing via the `prototype/analysis-page-visual-variants` throwaway branch's second round — consistently across the whole app, not just the pages that were prototyped. See `docs/research/2026-news-portal-visual-design.md` for the underlying research.

**Blocked by:** 20 — Cross-Source Narrative Renders as a Continuous Article (needs its reusable typography/spacing tokens to exist first).

**Status:** ready-for-agent

- [ ] The Articles listing page (`HistoryPage.tsx`) is rebuilt to match Variant A ("Wire Feed") from the navbar+listing prototype round: thin utility bar, centered serif nameplate, dense divided-text listing (no cards)
- [ ] The navbar (`App.tsx`'s `NavBar`) is rebuilt to match Variant A's masthead as the **working baseline** — thin utility bar (date + auth) above a centered serif nameplate, nav links below
- [ ] **Navbar is explicitly not final.** It needs its own dedicated research/prototype pass later (masthead conventions specifically, not just the general typography research already done) before being treated as a locked decision — this ticket applies it for consistency now, not as the last word
- [ ] The "Přihlásit se" (log in) link is removed from the reader-facing navbar entirely — no replacement wired up in this ticket. It's an internal Admin/reviewer entry point, not something a reader-facing nav should surface; ticket 26 adds its actual replacement (a low-key footer utility link) once the footer exists
- [ ] Remaining pages (`HomePage.tsx`, `LoginPage.tsx`, `AdminUsersPage.tsx`, `IngestionReviewPage.tsx`, `ReviewPage.tsx`) pick up the shared typography/spacing tokens from ticket 20 (serif headings, consistent measure, utility-label styling) — these don't need the Article/Listing pages' structural rework, just consistent tokens instead of each page's current one-off styling
- [ ] `AnalysisListItem` (shared types + backend) gains real per-story dimension counts (agreement/contradiction/uniqueReporting/framing) if the listing page is to show anything beyond `coverageCount` — the prototype's Variant B placeholder color-strip was flagged as illustrative, not real data; confirm whether this ticket's chosen listing design (Variant A) needs it at all before adding it purely speculatively
- [ ] Visual check: navigating between the homepage, listing, and an Article feels like one consistent product, not several different apps stitched together

**Deferred, not in this ticket:** a dedicated navbar/masthead research and prototype round, informed by the same kind of primary-source investigation as `docs/research/2026-news-portal-visual-design.md` but focused specifically on masthead/navigation conventions — plus footer, login, and shared UI-component identity. Do this before treating the navbar's current styling as final. See ticket 26.
