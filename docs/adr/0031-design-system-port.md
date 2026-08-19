# ADR 0031 — Adopting the "Kvalitní deník" design system, superseding ticket 26's direction

## Status
Accepted

## Context
Tickets 20, 22 and 26 built the "Wire Service" visual identity incrementally on top of the shadcn/Radix scaffolding the project started with: HSL semantic tokens in `index.css`, `cva`-based primitives in `components/ui/`, a `.utility-label` convention, and a masthead/footer/login treatment chosen by the project owner from a three-variant prototype round. Ticket 26 is `done`, and its outcome was a deliberate pick, not a default.

Two days later a full external design system arrived (`news_design`): a documented token architecture, 57 KB of component CSS, a living styleguide, and reference implementations of fifteen screens including several the product does not have yet. It is a more complete and more coherent system than what tickets 20–26 assembled, and the project owner's judgement is that it is better. Adopting it means discarding the outcome of a prototype round that was run precisely to settle this question — which is the kind of reversal that looks like an accident to a future reader unless it is written down.

A second, earlier React drop (`news-triangulator-ui-bootstrap`) was evaluated alongside it and discarded: it does not compile, uses a flat `--nt-*` token set where the documented system uses a three-tier one, and contradicts `DESIGN-SYSTEM.md` on the dark-mode mechanism and component conventions. It is an incomplete derivative, not an alternative.

## Decision

**`DESIGN-SYSTEM.md` plus `ds/` is the source of truth for the frontend's visual layer, superseding the token set and component styling established by tickets 20–26.** `tokens.css` and `base.css` are adopted unchanged; `components.css` is split per component but keeps its class names, so `styleguide.html` remains a valid reference document rather than becoming a historical artifact. The styleguide is ported into the app as a dev-only route for the same reason — a reference kept outside the build stops matching the build within weeks.

**Ticket 26's structural decisions survive; its styling does not.** The masthead layout, the footer's column structure and role-aware labels, and the login page's internal-tool framing were all chosen deliberately and the new system offers no alternative to them — it contains no masthead or footer design at all. Re-deciding them here would be designing from scratch without a brief, in the middle of a branch that already carries a 524-line page rewrite. They are re-clothed in the new tokens and typography and otherwise left alone.

**Tailwind is retained for layout only.** `DESIGN-SYSTEM.md` §2 forbids writing a colour, font size or spacing value outside `tokens.css`, which removes most of what Tailwind was doing here. The HSL semantic colour set and its `cva` primitives are deleted rather than remapped: a compatibility shim would have kept two names alive for every colour, and the alpha-modifier constructions it would have to preserve (`bg-muted/30` and nine others) only compile today because the old tokens were bare HSL channel triplets. Against complete `oklch()` values the same classes emit invalid CSS silently. Deleting them is the honest migration.

**Radix stays as headless behaviour.** "Replace the design system" is not "reimplement accessibility": `dialog`, `select`, `tabs` and `tooltip` keep their Radix implementations and take the new class names. The reference system's own dialog has no focus trap, no escape handling and no scroll lock, and this project has no frontend tests to catch their loss.

### Deliberate deviations from `DESIGN-SYSTEM.md`

Each of these departs from the document, and each is a decision rather than an oversight.

**Theme choice persists in `localStorage`, not on the server or in a cookie (§3.2, §10).** The document assumes a server-rendered context. This frontend is a static SPA served by nginx with no SSR, and its reader-facing pages are unauthenticated, so there is no server-side preference to read for the visitor who most needs one. A cookie would offer nothing `localStorage` does not, since either way the initial theme must be applied by an inline script before the bundle loads. The `data-theme` mechanism, the three-state behaviour and the system-preference fallback are adopted exactly as specified — only the storage location differs.

**Photography is not carried over.** The system treats photographs as structural: a 3:2 image in `.lead`, a 4:3 thumbnail in `.story`, a mandatory caption on `.fig`, a dark-mode correction filter. The data model has no image field of any kind, and ADR 0004 keeps article content unstored, so there is nothing to render. Hotlinking each source's `og:image` was considered and rejected — it takes third-party images with no licence, leaks referrers, and breaks whenever a source reorganises. `.fig` renders as an aspect-ratio placeholder that preserves the layout's proportions, with a `TODO` naming what would fill it. An empty area is more honest than a broken-image icon and far more honest than someone else's photograph.

**The author signature becomes a machine attribution.** The reference data carries `author` and `authorRole`, and `.artfoot` is described as the author's signature. These Articles are tool-authored (ADR 0021). A human name beneath machine-composed text is the one element of the design that would actively mislead a reader, and the system's own rule for internal screens — "rozhraní nikdy nepředstírá, že rozhodl nástroj" — is the same principle applied to the other side of the product.

**`.sumbox` gains a fourth column.** The reference has three (`agree` / `differ` / `open`); this product has four Analysis Dimensions, and the reference's third — open questions — has no data behind it, while `uniqueReporting` has nowhere to go. The columns become agreement, contradiction, uniqueReporting and framing, with `~` in `--mid` for the fourth so no second accent colour is introduced. `styleguide.html` is updated in the same commit, because a reference that is wrong once is not trusted again.

**Components with no data behind them are dev-only, not omitted and not shipped.** `.trend` and `.qa` require values the model does not hold. They render with sample data behind an `import.meta.env.DEV` guard, each carrying a `TODO` stating what it waits for. The same guard covers the seven reference screens with no backend. This is a narrow exception to the speculative-generality rule in CLAUDE.md and ADR 0009: the components come from a complete design rather than from anticipated need, and keeping them visible in development is what keeps the ported system checkable against its own styleguide. Nothing unbacked reaches a production build.

## Consequences
- Ticket 26's prototype round no longer determines the product's appearance, and this ADR is where a future reader finds out why. The masthead, footer and login *structure* it settled do still stand.
- `styleguide.html` becomes a maintained part of the codebase. If it is allowed to drift, the "class names are preserved" constraint that shapes the whole port loses its purpose, and the port's later stages have no reference to check against.
- The frontend has no automated tests (`vitest.config.ts` runs with `passWithNoTests`), so a wholesale visual replacement has no regression net. Screen-by-screen comparison against the reference HTML is the verification, and it is an acceptance criterion of ticket 39 rather than a follow-up — tickets 22 and 26 both shipped with visual verification explicitly not performed.
- The database is empty at authoring time, so every screen will first be built against its own empty state. The dev-only mocks and the ported styleguide are, for now, the only places the system can be seen carrying content — which raises their value considerably above what "prototype leftovers" would suggest.
- Fonts become a build asset rather than a third-party request. The variable `opsz` axis and the `latin-ext` subset are both load-bearing — the first for §4.1's optical sizing, the second for Czech diacritics — and a well-meant later "optimisation" that drops either would quietly damage the typography the system is built on.
