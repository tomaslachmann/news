# 54 — Grilling: homepage / other pages / mock data / dev pages

**Type:** grilling

**What to resolve:** User's comment as given: "do grill session about missing everything on
homepage and rest of pages mock data dev pages etc." This names a symptom (things feel missing
across the homepage and other pages, mock data lingering, dev-only pages) but not a target state —
before anything gets ticketed, run an actual `/grilling` session with the user to pin down what's
actually wrong and what "done" looks like.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] Before the session: survey current state as raw material to grill against — what `HomePage`
      actually renders today vs. what looks like placeholder/mock content, which dev-only routes
      exist (`/styleguide`, `AnalysisPage.devDemos.tsx`, anything gated by `import.meta.env.DEV`),
      and any other page carrying data that looks fabricated rather than real.
- [ ] Run the `/grilling` session with the user, grounded in that survey.
- [ ] Record the outcome below (decisions reached, and what — if anything — gets spun into its own
      follow-up ticket).
- [ ] File follow-up tickets for anything the session decides should be built/fixed; note
      explicitly anything the session decides is fine as-is.

## Outcome

_(filled in after the grilling session)_
