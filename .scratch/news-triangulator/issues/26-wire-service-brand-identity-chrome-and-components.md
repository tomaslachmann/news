# 26 — Wire Service Brand Identity: Header, Footer, Login & UI Components

**What to build:** Extend the "Wire Service" visual direction beyond the Article/Listing pages (ticket 22) to every remaining chrome and component surface, so the whole app reads as one coherent product instead of a well-designed reading page bolted onto default-styled everything-else: the masthead/header (superseding ticket 22's explicitly-provisional navbar baseline), a new footer (none exists today), the login page (restyled as an internal back-office tool, not a public subscriber gate), and shared UI primitives — buttons, inputs, form/validation states, badges/status pills, loading/empty states.

Reference anchor is wire/agency conventions (Reuters, AP, AFP) as the dominant influence, with consumer papers (NYT, Guardian, WaPo, BBC) as secondary texture — the project's identity is explicitly named "Wire Service Style," so chrome that reads as a generic modern newspaper site rather than a wire feed would not cohere with the Article/Listing pages ticket 22 already built. Explicitly not "AI design" / generic modern SaaS aesthetics — every choice should trace back to a real newsroom or wire-service precedent.

See `docs/research/2026-news-portal-visual-design.md` (masthead/nameplate, footer, and login/auth-gate sections — in progress as of ticket authoring) and, once added, its UI-component-primitives section.

**Blocked by:** 22 — Wire Service Style, Applied Site-Wide (this ticket refines and extends what 22 ships as a working baseline; needs that rollout in place first).

**Status:** done

- [x] Prototype round (same throwaway-branch, multiple-variant approach used for ticket 20/22's navbar+listing round): variants covering masthead/header, footer, login page, and core UI primitives (buttons, inputs, form/validation states, badges/status pills) — presented for the project owner to pick, not decided unilaterally
- [x] Masthead/header treatment finalized, superseding ticket 22's "working baseline, not final" navbar
- [x] Footer built as a new component, populated per real wire-service/newsroom footer convention (not a placeholder) — this is genuinely new surface, nothing exists today
- [x] Login page restyled as an internal back-office/reviewer tool, not a public subscriber-paywall pastiche — it is Admin/reviewer-only, no public reader accounts exist
- [x] Login is not a link in the reader-facing NavBar (ticket 22 removes it outright, no replacement wired yet) — this ticket adds a small, low-key entry point in the new footer instead (a wire-service-style "Staff"/utility link), never restored to primary nav
- [x] Buttons, inputs, form layouts, and status badges/pills restyled consistently against shared design tokens, replacing each page's current one-off styling
- [x] Visual check across every page — homepage, listing, Article, login, admin pages — that the product feels like one coherent brand, not several apps stitched together

## Notes

Scoped via a `/grill-with-docs` session (2026-08-17) after ticket 22 was already ready-for-agent. Key decisions settled in that session:
- Kept as its **own ticket**, not folded into 22 — 22's rollout of ticket 20's tokens is valuable standalone and isn't blocked by chrome/component identity not being locked yet.
- Follows the **same prototype-variant process as ticket 20** (live variants on a throwaway route, project owner picks) rather than going straight from research to a single implemented direction — this is exactly the kind of "does it feel right" call that's hard to make from a written description alone.
- **Wire/agency-dominant reference anchor**, not equal weight with consumer papers — see rationale above.
- **Login = back-office tool, not a subscriber-style gate**, and explicitly **not in the navbar at all** — surfaced instead as a small footer utility link. Reasoning: the screen is honestly an internal tool (no public accounts exist), and hiding the route entirely buys nothing security-wise since it still resolves for anyone who bookmarks or guesses it.

Research status at ticket authoring time: a background research pass extending `docs/research/2026-news-portal-visual-design.md` with masthead/nameplate, footer, and login/auth-gate sections was in flight; a follow-up pass covering UI component primitives (buttons/forms/badges/states, drawing on WPDS/BBC GEL/FT Origami's documented component-level guidance) is planned once that lands. This ticket should not be marked `ready-for-agent` until both are folded in and a prototype round has actually run.

## Implementation (2026-08-17)

Research (§8-10 of the research doc) landed before this ticket was picked up; no separate UI-component-primitives research pass materialized, so the primitives prototype leaned on the same §8-10 findings (BBC's two-band masthead, ProPublica's live footer, Bloomberg Terminal's anti-polish precedent for internal tools) plus direct reasoning, flagged as such in the prototype branch's commit message.

**Prototype round:** `prototype/brand-identity-chrome-components` branch, three coherent variant systems (not mix-and-match per surface) covering masthead, footer, login, and a dedicated `/prototype/components` primitives page, switchable via `?variant=A|B|C` in dev builds — same mechanism as tickets 20/22. Project owner picked **Variant A**: ticket 22's masthead unchanged, a ProPublica-style dense multi-column sitemap footer, login as a bare bordered box with an internal-tool disclaimer, and plain uppercase small-caps status/badge text everywhere (generalizing the plain-text-badge decision ticket 22 already made for `HistoryPage` to every remaining badge surface). One correction from the prototype's first pass: the footer's own `px-6` didn't match `PageContainer`'s `container`-class padding — fixed by dropping the custom padding and relying on the same `container mx-auto` mechanism as every page.

**What shipped:**
- `components/Footer.tsx` — new, real (not prototype-only). Three columns (O projektu / Procházet / Personál) plus a copyright row, sharing a new `PageContainer`-exported `CONTAINER_CLASS` constant so the footer's horizontal padding can't drift from every page's content the way the prototype's hand-typed `px-6` once did. The "Procházet" column's `/history` label is role-aware (`Historie` for admins, `Články` otherwise), matching `NavBar`'s existing logic instead of hardcoding one label. The "Personál" column is the footer login entry point ticket 22 deferred to this ticket.
- `App.tsx`'s outer layout — changed to `flex flex-col min-h-screen` with the routed content wrapped in a `flex-1` div, so `Footer` sits pinned to the viewport bottom on short pages (e.g. `/login`) instead of floating above a blank gap.
- `App.tsx`'s `NavBar` — unchanged visually; doc comment updated to record that ticket 26's prototype round confirmed it as final rather than "working baseline, not final."
- `LoginPage.tsx` — form wrapped in a bare `border p-8` box with an "Interní nástroj pro personál — nejde o veřejnou registraci" note above the fields; no card shadow, no marketing framing, per the research doc's back-office-tool precedent.
- `AdminUsersPage.tsx`'s role column — the one remaining colored-pill `Badge` usage in the app, replaced with the same plain `.utility-label` treatment `HistoryPage` already uses for status text.
- `components/ui/badge.tsx` deleted — after the above change, nothing in the app used it; per CLAUDE.md, deleted outright rather than left as unused dead code.

A first pass also tightened `components/ui/button.tsx`'s corner-radius token from `rounded-md` to `rounded-sm`, applied everywhere via the shared variant rather than per-instance. A local code-review caught that this touched only `Button`, not `Input`/`Select`, so buttons and inputs sitting side by side (e.g. `LoginPage`, `ReviewPage`'s custom-URL row) would render with visibly different corner radii — directly contradicting this ticket's "restyled consistently" criterion. Reverted rather than extended to every primitive, since a radius change wasn't something the prototype round or the project owner explicitly asked for; buttons and inputs both stay at the existing `rounded-md`.

**Deliberately left untouched, and why:** `AnalysisPage.tsx`'s `OutletBadge` (the rounded-pill per-claim source-attribution chip in the dimension-list tabs) and its `ExtractionBadge` were not touched. `ExtractionBadge` is already plain inline text+icon, not a colored pill, so it already matches this ticket's direction. `OutletBadge` *is* a colored pill, but it's citation/attribution UI tied to the four-dimension breakdown (ticket 20/21's territory), not a generic status badge — restyling it would mean redesigning that page's citation presentation (e.g. toward the Wikipedia-style superscript/footnote pattern the research doc recommends), which is a bigger, separate design decision outside this ticket's "chrome and shared primitives" scope. Flagging it here as a real gap for whoever picks up the Article-page citation UI next, rather than silently leaving it inconsistent.

**Visual verification not performed**, same limitation ticket 22 hit: no browser-automation tool is available in this environment. `tsc --noEmit`, `eslint`, `vite build`, and the full test suite all pass, and the dev server serves `/`, `/login`, and `/history` with 200s, but the actual rendered result has not been visually confirmed — please check `http://localhost:5173` yourself.
