# 39 — Port the "Kvalitní deník" design system into the frontend

**What to build:** Replace the frontend's current visual system wholesale with the design system delivered as `news_design` (variant E, "Kvalitní deník") — its tokens, its component CSS, its class names, its screens. This supersedes the visual direction ticket 26 finalised: 26's masthead/footer/login *structure* survives and is re-clothed, but the token set, typography, component styling and page composition all come from the new system. The acceptance bar is visual parity with the reference HTML, screen by screen, not "inspired by".

Source of truth is `DESIGN-SYSTEM.md` plus `ds/tokens.css`; `styleguide.html` is the living reference and is ported into the app so it cannot rot. See ADR 0031 for what is deliberately *not* carried over and why.

**Blocked by:** None. Ticket 38 supplies the byline's source-overlap gauge; until it lands, the byline renders without the gauge and this ticket does not wait for it.

**Status:** ready-for-agent

## Mechanics

- [ ] `ds/tokens.css` and `ds/base.css` land **unchanged** and are imported globally from `main.tsx` — not translated into a JS theme object, not merged into Tailwind's `theme.extend`, per `DESIGN-SYSTEM.md` §10
- [ ] `ds/components.css` (57 KB) is split into per-component files colocated with their components and imported globally. **Plain CSS, never CSS Modules** — Modules hash class names, which breaks both `styleguide.html`'s validity as a reference and §10's "názvy tříd se zachovají"
- [ ] `tailwind.config.js`'s HSL semantic colour set (`--background`, `--foreground`, `--muted`, …) and the matching `:root` / `.dark` blocks in `index.css` are **deleted**. Tailwind is retained for layout utilities only; colour, typography and spacing come exclusively from tokens. The ~179 semantic-colour class usages across 17 files go away with the pages that use them, not via a compatibility shim
- [ ] The 10 alpha-modifier usages (`bg-muted/30`, `hover:bg-primary/90`, …) are removed rather than reproduced. They currently compile to `hsl(var(--muted) / .3)`, which only works because the old tokens were bare HSL channel triplets; the new tokens are complete `oklch()` values and the same construction would silently emit invalid CSS
- [ ] `class-variance-authority` is dropped from the components it styles; variants map to modifier class names (`cn('btn', variant && \`btn--${variant}\`)`). `cn()` stays. Remove the dependency if nothing else uses it
- [ ] Radix stays as headless behaviour under the new styling — `dialog`, `select`, `tabs`, `tooltip`, `label` keep their Radix implementations and get new class names. Focus trap, escape handling, portalling and keyboard navigation are not reimplemented by hand
- [ ] Dark mode is driven by `data-theme` on `<html>` with **three** states: absent (follow `prefers-color-scheme`), `light`, `dark`. Tailwind's `darkMode` switches to the `[data-theme="dark"]` selector. The toggle lives in `.utilbar` and cycles system → light → dark
- [ ] Theme choice persists in `localStorage`, read by a small inline script in `index.html` before the bundle loads so a dark-preferring visitor never sees a light flash. This is a deliberate deviation from `DESIGN-SYSTEM.md` §3.2 (which specifies server or cookie storage) — see ADR 0031
- [ ] The three hardcoded colours that survive nowhere else (`text-green-700` ×2, `bg-yellow-50` / `text-yellow-800`) move onto `--ok` / `--mid`; they are unreadable in dark mode as they stand
- [ ] Newsreader, Inter Tight and IBM Plex Mono are **self-hosted**, not loaded from `fonts.googleapis.com`. Variable `woff2` with the `opsz` axis intact (§4.1 depends on it), `latin` **and `latin-ext`** subsets — without `latin-ext` Czech diacritics disappear. `font-synthesis: none` is part of the system, so any italic in use needs a real italic file
- [ ] `e.css`'s short aliases (`--t-h1` → `--text-h1`) are not carried over; ported pages use the long token names directly, per §2

## Screens

Each of these is visually compared against its reference HTML before being checked off.

- [ ] **Chrome** — `.utilbar`, `.mast`, `.rubnav`, `.sticky`, `.foot`. Ticket 26's masthead and footer *structure* is preserved and re-clothed, not redesigned; the footer keeps its role-aware `/history` label and shared container constant
- [ ] **`/styleguide`** — `styleguide.html` ported as a dev-only route, so a token change can be checked the way §1 requires
- [ ] **`/login`** — `login.html`. Stays the internal-tool framing ticket 26 established
- [ ] **`/`** — `e.html`. `.lead`, `.story` / `.storylist`, `.card`, `.minute`, `.daystats`, `.entband`
- [ ] **`/history`** — `history.html`. Filter bar, sort, search, pagination, states
- [ ] **`/analysis/:id`** — `article.html`. The largest single item: `.arthead`, `.byline`, `.prose`, `.claim`, `.sumbox`, `.compare` / `.cmp` / `.vals`, `.qcmp`, `.srclist`, `.threadband`, `.artfoot`. Radix tabs are retained for the four dimensions
- [ ] **`/review/:id`** — `admin-sources.html`'s source-selection step is the closest reference; the existing page's behaviour is unchanged
- [ ] **`/admin/users`** — `admin-users.html`
- [ ] **`/admin/ingestion`** — `admin-review.html`
- [ ] **404** — `state-404.html`, wired as the catch-all route the app currently lacks entirely (an unknown URL today renders masthead, footer and nothing between them)

## Design changes we are making on top of the reference

- [ ] `.sumbox` is widened from three columns to **four**, to carry all four Analysis Dimensions: `+` agreement, `×` contradiction, `?` uniqueReporting, `~` framing. The fourth takes `--mid`; no new accent colour is introduced (rule #2). The reference's third column ("open questions") has no data behind it and is dropped. **`styleguide.html` is updated in the same commit** — otherwise it stops being a valid reference immediately
- [ ] `.byline`'s share is labelled **"překryv zdrojů"**, not "shoda", and reads from ticket 38. Below 5 sources the gauge is withheld and only the chip and source count show
- [ ] The author signature in `.byline` and `.artfoot` is replaced with a machine attribution ("Sestaveno z N zdrojů"). Articles here are tool-authored; a human name under one would misrepresent them, and the design's own admin rule #1 ("rozhraní nikdy nepředstírá, že rozhodl nástroj") is the same principle
- [ ] Photography: `.fig` renders as an `aspect-ratio` placeholder box with no `<img>` element at all — the data model has no image field and ADR 0004 keeps article content unstored. Each placeholder carries a `TODO` naming what would fill it

## Mocked and dev-only

- [ ] Screens with no backend behind them — `new-analysis.html`, `analysis-live.html`, `thread.html`, `admin-source-management.html`, `admin-llm-log.html`, `state-failed.html`, `state-session.html` — ship as routes guarded by `import.meta.env.DEV`, never reachable in a production build
- [ ] `.trend` and `.qa` have no data behind them either; they render with sample data inside their pages under the same dev-only guard
- [ ] Every mock carries a `TODO` stating what it is waiting for and which kind: either a named ticket, or "grill" for something not yet scoped

## Verification

- [ ] `tsc --noEmit`, `eslint`, `vite build` and the test suite pass
- [ ] Every screen above is opened side by side with its reference HTML and the differences are written up for the project owner to sign off. Tickets 22 and 26 both shipped with "visual verification not performed"; this one does not

## Notes

Scoped in a grilling session (2026-08-19). An earlier React drop (`news-triangulator-ui-bootstrap`) was evaluated and discarded: it is an incomplete derivative of this system — it does not compile (imports `Chrome`, `LoginPage`, `StatePages`, none of which exist in it), uses a flat `--nt-*` token set instead of the three-tier one, and contradicts `DESIGN-SYSTEM.md` on dark-mode mechanism and component conventions. `news_design` is the source of truth.

One branch, but committed in the order the sections above are written — tokens and base first, then chrome, then styleguide, then one screen per commit — so review can follow it. See `docs/git-workflow.md` on committing between review rounds.
