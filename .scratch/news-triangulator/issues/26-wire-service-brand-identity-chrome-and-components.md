# 26 — Wire Service Brand Identity: Header, Footer, Login & UI Components

**What to build:** Extend the "Wire Service" visual direction beyond the Article/Listing pages (ticket 22) to every remaining chrome and component surface, so the whole app reads as one coherent product instead of a well-designed reading page bolted onto default-styled everything-else: the masthead/header (superseding ticket 22's explicitly-provisional navbar baseline), a new footer (none exists today), the login page (restyled as an internal back-office tool, not a public subscriber gate), and shared UI primitives — buttons, inputs, form/validation states, badges/status pills, loading/empty states.

Reference anchor is wire/agency conventions (Reuters, AP, AFP) as the dominant influence, with consumer papers (NYT, Guardian, WaPo, BBC) as secondary texture — the project's identity is explicitly named "Wire Service Style," so chrome that reads as a generic modern newspaper site rather than a wire feed would not cohere with the Article/Listing pages ticket 22 already built. Explicitly not "AI design" / generic modern SaaS aesthetics — every choice should trace back to a real newsroom or wire-service precedent.

See `docs/research/2026-news-portal-visual-design.md` (masthead/nameplate, footer, and login/auth-gate sections — in progress as of ticket authoring) and, once added, its UI-component-primitives section.

**Blocked by:** 22 — Wire Service Style, Applied Site-Wide (this ticket refines and extends what 22 ships as a working baseline; needs that rollout in place first).

**Status:** blocked — research in progress, not yet ready for an implementing agent to pick up

- [ ] Prototype round (same throwaway-branch, multiple-variant approach used for ticket 20/22's navbar+listing round): variants covering masthead/header, footer, login page, and core UI primitives (buttons, inputs, form/validation states, badges/status pills) — presented for the project owner to pick, not decided unilaterally
- [ ] Masthead/header treatment finalized, superseding ticket 22's "working baseline, not final" navbar
- [ ] Footer built as a new component, populated per real wire-service/newsroom footer convention (not a placeholder) — this is genuinely new surface, nothing exists today
- [ ] Login page restyled as an internal back-office/reviewer tool, not a public subscriber-paywall pastiche — it is Admin/reviewer-only, no public reader accounts exist
- [ ] Login is not a link in the reader-facing NavBar (ticket 22 removes it outright, no replacement wired yet) — this ticket adds a small, low-key entry point in the new footer instead (a wire-service-style "Staff"/utility link), never restored to primary nav
- [ ] Buttons, inputs, form layouts, and status badges/pills restyled consistently against shared design tokens, replacing each page's current one-off styling
- [ ] Visual check across every page — homepage, listing, Article, login, admin pages — that the product feels like one coherent brand, not several apps stitched together

## Notes

Scoped via a `/grill-with-docs` session (2026-08-17) after ticket 22 was already ready-for-agent. Key decisions settled in that session:
- Kept as its **own ticket**, not folded into 22 — 22's rollout of ticket 20's tokens is valuable standalone and isn't blocked by chrome/component identity not being locked yet.
- Follows the **same prototype-variant process as ticket 20** (live variants on a throwaway route, project owner picks) rather than going straight from research to a single implemented direction — this is exactly the kind of "does it feel right" call that's hard to make from a written description alone.
- **Wire/agency-dominant reference anchor**, not equal weight with consumer papers — see rationale above.
- **Login = back-office tool, not a subscriber-style gate**, and explicitly **not in the navbar at all** — surfaced instead as a small footer utility link. Reasoning: the screen is honestly an internal tool (no public accounts exist), and hiding the route entirely buys nothing security-wise since it still resolves for anyone who bookmarks or guesses it.

Research status at ticket authoring time: a background research pass extending `docs/research/2026-news-portal-visual-design.md` with masthead/nameplate, footer, and login/auth-gate sections was in flight; a follow-up pass covering UI component primitives (buttons/forms/badges/states, drawing on WPDS/BBC GEL/FT Origami's documented component-level guidance) is planned once that lands. This ticket should not be marked `ready-for-agent` until both are folded in and a prototype round has actually run.
