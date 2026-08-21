# 54 — Grilling: homepage / other pages / mock data / dev pages

**Type:** grilling

**What to resolve:** User's comment as given: "do grill session about missing everything on
homepage and rest of pages mock data dev pages etc." This names a symptom (things feel missing
across the homepage and other pages, mock data lingering, dev-only pages) but not a target state —
before anything gets ticketed, run an actual `/grilling` session with the user to pin down what's
actually wrong and what "done" looks like.

**Blocked by:** none.

**Status:** done

- [ ] Before the session: survey current state as raw material to grill against — what `HomePage`
- [x] Before the session: survey current state as raw material to grill against — what `HomePage`
      actually renders today vs. what looks like placeholder/mock content, which dev-only routes
      exist (`/styleguide`, `AnalysisPage.devDemos.tsx`, anything gated by `import.meta.env.DEV`),
      and any other page carrying data that looks fabricated rather than real.
- [x] Run the `/grilling` session with the user, grounded in that survey.
- [x] Record the outcome below (decisions reached, and what — if anything — gets spun into its own
      follow-up ticket).
- [x] File follow-up tickets for anything the session decides should be built/fixed; note
      explicitly anything the session decides is fine as-is.

## Outcome

**Grilling session held 2026-08-21.**

Surveyed current state before the session:

- `HomePage.tsx` is still entirely fabricated sample content: hardcoded stories, entities, ticker,
  feed, conflicts and most-read data, explicitly documented in the file comments as a mockup port
  rather than real API-backed UI.
- `/styleguide` is a dev-only route (`import.meta.env.DEV` in `App.tsx`) backed by the ported
  design-system reference (`StyleguidePage.tsx` + raw styleguide assets).
- `ArticlePage.tsx` still renders two ad hoc DEV-only sample sections from
  `AnalysisPage.devDemos.tsx`: wording-comparison and value-variants demos, both hardcoded and
  both carrying `TODO(grill)` notes about missing backing data shapes.
- No other production route was found to be obviously rendering fabricated sample content today;
  the "other pages" concern narrowed to those two article-page DEV demos rather than a broader
  hidden class of fake data.

Decisions reached with the user:

- **Production routes should show only real data.** Honest empty states are acceptable; fabricated
  sample/editorial-demo data is not.
- **Homepage structure stays as-is.** The problem is not "redesign the homepage"; it is "work out
  what backend/data shape is missing so the existing homepage sections can be wired to real data."
- **`/styleguide` is explicitly fine as-is.** It remains a retained dev-only design-system
  reference and is not considered product debt from this session.
- **Split the problem in two.** First: homepage real-data wiring and the backend/data shape needed
  for it. Second: separate debt around ad hoc DEV-only page demos that are not the styleguide.
- **Homepage follow-up is two-step.** First create one audit/spec ticket that maps each current
  homepage section to the missing backend/data shape; from that audit, create multiple
  implementation tickets.
- **Article DEV demos are debt.** The two ad hoc DEV-only sections in `AnalysisPage.devDemos.tsx`
  get their own follow-up ticket; they are not resolved inside the homepage audit and they are not
  grandfathered in as "fine like `/styleguide`."

Follow-up tickets filed from this session:

- **56 — Homepage real-data audit + ticket fan-out.** Audit each existing homepage section against
  current backend/data-model support, define the required shapes, and split the work into concrete
  implementation tickets.
- **57 — Resolve ArticlePage DEV-only demo sections.** Decide and build the real-data-backed
  version or remove the ad hoc sample sections; `/styleguide` is explicitly out of scope.

Explicitly fine as-is after this session:

- `/styleguide` stays as the dev-only design-system reference route.
- The complaint about "other pages" does **not** expand into a larger unbounded audit for now; it
  currently resolves to the two `ArticlePage` DEV demo sections only.
