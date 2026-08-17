# 22 — Wire Service Style, Applied Site-Wide

**What to build:** Apply the "Wire Service" visual direction — chosen for the Article page (ticket 20) and confirmed for the navbar + Articles listing via the `prototype/analysis-page-visual-variants` throwaway branch's second round — consistently across the whole app, not just the pages that were prototyped. See `docs/research/2026-news-portal-visual-design.md` for the underlying research.

**Blocked by:** 20 — Cross-Source Narrative Renders as a Continuous Article (needs its reusable typography/spacing tokens to exist first).

**Status:** done

- [x] The Articles listing page (`HistoryPage.tsx`) is rebuilt to match Variant A ("Wire Feed") from the navbar+listing prototype round: thin utility bar, centered serif nameplate, dense divided-text listing (no cards)
- [x] The navbar (`App.tsx`'s `NavBar`) is rebuilt to match Variant A's masthead as the **working baseline** — thin utility bar (date + auth) above a centered serif nameplate, nav links below
- [x] **Navbar is explicitly not final.** It needs its own dedicated research/prototype pass later (masthead conventions specifically, not just the general typography research already done) before being treated as a locked decision — this ticket applies it for consistency now, not as the last word
- [x] The "Přihlásit se" (log in) link is removed from the reader-facing navbar entirely — no replacement wired up in this ticket. It's an internal Admin/reviewer entry point, not something a reader-facing nav should surface; ticket 26 adds its actual replacement (a low-key footer utility link) once the footer exists
- [x] Remaining pages (`HomePage.tsx`, `LoginPage.tsx`, `AdminUsersPage.tsx`, `IngestionReviewPage.tsx`, `ReviewPage.tsx`) pick up the shared typography/spacing tokens from ticket 20 (serif headings, consistent measure, utility-label styling) — these don't need the Article/Listing pages' structural rework, just consistent tokens instead of each page's current one-off styling
- [x] `AnalysisListItem` (shared types + backend) gains real per-story dimension counts (agreement/contradiction/uniqueReporting/framing) if the listing page is to show anything beyond `coverageCount` — the prototype's Variant B placeholder color-strip was flagged as illustrative, not real data; confirm whether this ticket's chosen listing design (Variant A) needs it at all before adding it purely speculatively
- [x] Visual check: navigating between the homepage, listing, and an Article feels like one consistent product, not several different apps stitched together

**Deferred, not in this ticket:** a dedicated navbar/masthead research and prototype round, informed by the same kind of primary-source investigation as `docs/research/2026-news-portal-visual-design.md` but focused specifically on masthead/navigation conventions — plus footer, login, and shared UI-component identity. Do this before treating the navbar's current styling as final. See ticket 26.

## Notes

`AnalysisListItem` dimension counts (criterion 6) confirmed **not needed**: Variant A's listing row shows only headline, date, `coverageCount`, and status — the same fields already in the API — so no shared-type or backend change was required.

`HistoryPage`'s old colored-pill `StatusBadge` was replaced with plain uppercase small-caps status text (reusing the shared `.utility-label` class, ticket 20) rather than kept as a Tailwind-colored rounded pill, matching the prototype's own Variant A markup. This also turned out to match a finding from ticket 26's still-in-progress component research (added to `docs/research/2026-news-portal-visual-design.md` after this ticket's implementation): none of the newsroom design systems surveyed (WPDS, BBC GEL, FT Origami) document a colored badge/pill component, and the one live newsroom site checked first-hand (ProPublica) renders its own status/topic tags as plain text — coincidental confirmation, not something this ticket relied on.

Three other pages (`ReviewPage.tsx`, `IngestionReviewPage.tsx`, `AnalysisPage.tsx`) had a literal `text-xs font-semibold uppercase tracking-wide text-muted-foreground` string duplicated across them, identical to the `.utility-label` class ticket 20 already defines — consolidated onto the shared class as a zero-behavior-change cleanup opportunistically enabled by this ticket's token work.

Added a shared `PageContainer` component (`components/PageContainer.tsx`, `container mx-auto py-10` plus a `measure`/`wide`/`narrow` width variant) and switched every page's top-level `<main>` onto it — including `AnalysisPage.tsx`'s six, which the checklist above didn't originally call out — so page padding/centering is defined in exactly one place instead of copy-pasted per page. Flagged mid-implementation as a real gap in the original scope, not something the ticket anticipated up front.

**Visual verification not performed.** No browser-automation tool is available in this environment — `tsc --noEmit`, `eslint`, and `vite build` all pass clean across the frontend, and the dev server serves both routes without server-side errors, but the actual rendered layout has not been visually confirmed. Please check `http://localhost:5173` yourself before treating this as fully verified, per CLAUDE.md's UI-verification requirement.
