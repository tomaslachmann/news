# 39 — Port the "Kvalitní deník" design system into the frontend

**What to build:** Replace the frontend's current visual system wholesale with the design system delivered as `news_design` (variant E, "Kvalitní deník") — its tokens, its component CSS, its class names, its screens. This supersedes the visual direction ticket 26 finalised: 26's masthead/footer/login *structure* survives and is re-clothed, but the token set, typography, component styling and page composition all come from the new system. The acceptance bar is visual parity with the reference HTML, screen by screen, not "inspired by".

Source of truth is `DESIGN-SYSTEM.md` plus `ds/tokens.css`; `styleguide.html` is the living reference and is ported into the app so it cannot rot. See ADR 0031 for what is deliberately *not* carried over and why.

**Blocked by:** None. Ticket 38 supplies the byline's source-overlap gauge; until it lands, the byline renders without the gauge and this ticket does not wait for it.

**Status:** ready-for-agent

## Mechanics

- [x] `ds/tokens.css` and `ds/base.css` land **unchanged** and are imported globally from `main.tsx` — not translated into a JS theme object, not merged into Tailwind's `theme.extend`, per `DESIGN-SYSTEM.md` §10
- [ ] `ds/components.css` (57 KB) is split into per-component files colocated with their components and imported globally. **Plain CSS, never CSS Modules** — Modules hash class names, which breaks both `styleguide.html`'s validity as a reference and §10's "názvy tříd se zachovají". Landed differently from the letter of this bullet: rather than one file per component, `src/ds/components.css` holds classes shared by ≥3 pages (`.byline`/`.chip`/`.gauge`/`.kicker`/`.hl`/`.layout`/`.page-shell`/`.screen-head`/`.tooltip`), imported globally, and each page keeps a colocated `PageName.css` for what's page-specific — plain CSS throughout, same "class names survive" guarantee, just organized by reuse rather than 1:1 with `ds/components.css`'s original section boundaries. Left unchecked since it doesn't match the bullet literally
- [x] `tailwind.config.js`'s HSL semantic colour set (`--background`, `--foreground`, `--muted`, …) and the matching `:root` / `.dark` blocks in `index.css` are **deleted**. Tailwind is retained for layout utilities only; colour, typography and spacing come exclusively from tokens. The ~179 semantic-colour class usages across 17 files go away with the pages that use them, not via a compatibility shim
- [x] The 10 alpha-modifier usages (`bg-muted/30`, `hover:bg-primary/90`, …) are removed rather than reproduced. They currently compile to `hsl(var(--muted) / .3)`, which only works because the old tokens were bare HSL channel triplets; the new tokens are complete `oklch()` values and the same construction would silently emit invalid CSS
- [x] `class-variance-authority` is dropped from the components it styles; variants map to modifier class names (`cn('btn', variant && \`btn--${variant}\`)`). `cn()` stays. Remove the dependency if nothing else uses it. `ui/button.tsx` (its only consumer besides `ui/label.tsx`) deleted, both now-unused
- [x] Radix stays as headless behaviour under the new styling — `dialog`, `tooltip` keep their Radix implementations and get new class names (`.panel`/`.tooltip`). `select` and `label` ended up **not** kept as Radix: every page in this ticket uses a plain native `<label class="field__l">` already (matches the reference's own markup, which never shows a fancy Radix label either), and `admin-users.html`'s one `<select>` is a plain native element for a 2-option enum — so `ui/select.tsx`/`ui/label.tsx` had zero real use once ported and are deleted rather than kept-and-restyled. `tabs` is dropped per `/analysis/:id`'s own entry above, `ui/tabs.tsx` deleted too
- [x] Dark mode is driven by `data-theme` on `<html>` with **three** states: absent (follow `prefers-color-scheme`), `light`, `dark`. Tailwind's `darkMode` switches to the `[data-theme="dark"]` selector. The toggle lives in `.utilbar` and cycles system → light → dark
- [x] Theme choice persists in `localStorage`, read by a small inline script in `index.html` before the bundle loads so a dark-preferring visitor never sees a light flash. This is a deliberate deviation from `DESIGN-SYSTEM.md` §3.2 (which specifies server or cookie storage) — see ADR 0031
- [x] The three hardcoded colours that survive nowhere else (`text-green-700` ×2, `bg-yellow-50` / `text-yellow-800`) move onto `--ok` / `--mid`; they are unreadable in dark mode as they stand
- [x] Newsreader, Inter Tight and IBM Plex Mono are **self-hosted**, not loaded from `fonts.googleapis.com`. Variable `woff2` with the `opsz` axis intact (§4.1 depends on it), `latin` **and `latin-ext`** subsets — without `latin-ext` Czech diacritics disappear. `font-synthesis: none` is part of the system, so any italic in use needs a real italic file
- [x] `e.css`'s short aliases (`--t-h1` → `--text-h1`) are not carried over; ported pages use the long token names directly, per §2

## Screens

Each of these is visually compared against its reference HTML before being checked off.

- [x] **Chrome** — `.utilbar`, `.mast`, `.rubnav`, `.sticky`, `.foot`. Ticket 26's masthead and footer *structure* is preserved and re-clothed, not redesigned; the footer keeps its role-aware `/history` label and shared container constant
- [x] **`/styleguide`** — `styleguide.html` ported as a dev-only route, so a token change can be checked the way §1 requires
- [x] **`/login`** — `login.html`. Stays the internal-tool framing ticket 26 established
- [x] **`/`** — `e.html`. `.lead`, `.story` / `.storylist`, `.card`, `.minute`, `.daystats`, `.entband`
- [x] **`/history`** — `history.html`. Filter bar, sort, search, pagination, states
- [x] **`/analysis/:id`** — `article.html`. The largest single item: `.arthead`, `.byline`, `.prose`, `.claim`, `.sumbox`, `.compare` / `.cmp` / `.vals`, `.qcmp`, `.srclist`, `.threadband`, `.artfoot`. Deviation from this ticket's own original text, confirmed with the user during implementation: Radix Tabs are **dropped**, not retained — `article.html` itself has no tabs anywhere, and CLAUDE.md frames the Narrative as a *presentation* of the four dimensions, not a peer of them. The page is one flowing article instead (sumbox → narrative → contradiction detail → uniqueReporting → framing → thread → related). `.vals`, `.qcmp` and the entities rail panel ship `import.meta.env.DEV`-guarded with sample data — no real data exists behind a fixed 3-source quote comparison, discrete per-source values, or entity extraction today. Also covers the real SSE-driven live-streaming state (extraction/synthesis in progress) — initially reskinned with improvised classes instead of `analysis-live.html`'s actual `.live-wrap`/`.live-phase`/`.source-row`/`.live-rail` (caught in review, corrected): same distinction as `new-analysis.html` — the mockup is listed under "Mocked and dev-only" for having no backend, but the live view itself is real (backed by `openAnalysisStream`), so it's ported and ships unguarded like the rest of the page
- [x] **`/review/:id`** — `admin-sources.html`'s source-selection step is the closest reference; the existing page's behaviour is unchanged. Discovered mid-implementation: the reference's internal/admin screens (`admin-sources.html`, `admin-users.html`, `admin-review.html`) all use a distinct `.abar` chrome, never the public masthead — this page and the other two below now render inside a new `AdminChrome` instead of the reader-facing `Chrome` (`/login` stays under `Chrome`, ticket 26's decision, unchanged)
- [x] **`/admin/users`** — `admin-users.html`. Radix `Dialog` kept (the reference's own mockup comment confirms its static `.panel` markup stands in for "these forms are in a dialog above the list" in the real app) restyled onto `.panel`/`.field`/`.select`; Radix `Select` dropped for a plain native `<select class="select">`, matching the reference exactly for a 2-option enum — `components/ui/select.tsx` deleted as now-unused
- [x] **`/admin/ingestion`** — `admin-review.html`. `.qsec`/`.qitem`/`.pair` for the three queues; the reference's "run ingestion manually" button and "last run" summary line have no real endpoint behind them and are left out rather than shown inert. Dropped-dependency cleanup landed here too: `ui/button.tsx`, `ui/input.tsx`, `ui/label.tsx`, `ui/tabs.tsx` deleted (zero remaining consumers once this page and `/admin/users` stopped using them), `class-variance-authority` and the now-unused `@radix-ui/react-{label,select,slot,tabs}` dropped from `package.json` per the ticket's own mechanics checklist
- [ ] **404** — `state-404.html`, wired as the catch-all route the app currently lacks entirely (an unknown URL today renders masthead, footer and nothing between them)

## Design changes we are making on top of the reference

- [x] `.sumbox` is widened from three columns to **four**, to carry all four Analysis Dimensions: `+` agreement, `×` contradiction, `?` uniqueReporting, `~` framing. The fourth takes `--mid`; no new accent colour is introduced (rule #2). The reference's third column ("open questions") has no data behind it — its `?`/ink-3 styling is repurposed for uniqueReporting rather than dropped outright. `styleguide-content.html` + `styleguide-assets/styleguide.js`/`data3.js` updated in the same commit
- [ ] `.byline`'s share is labelled **"překryv zdrojů"**, not "shoda", and reads from ticket 38. Below 5 sources the gauge is withheld and only the chip and source count show. Still blocked on ticket 38 — the `/analysis/:id` byline ships with source-count + framing-signal-count only for now, no gauge and no "shoda" substitute (a dimension-count ratio isn't the same metric as source overlap; showing one labelled as the other would misrepresent it)
- [x] The author signature in `.byline` and `.artfoot` is replaced with a machine attribution ("Sestaveno z N zdrojů"). Articles here are tool-authored; a human name under one would misrepresent them, and the design's own admin rule #1 ("rozhraní nikdy nepředstírá, že rozhodl nástroj") is the same principle
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
