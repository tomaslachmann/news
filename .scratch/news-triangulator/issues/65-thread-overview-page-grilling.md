# 65 — Grilling: dedicated Thread overview page

**Type:** grilling

**What to resolve:** Confirmed via item-11 audit (docs/user-comments.md) that there is no
dedicated Thread page or route on the frontend today. The only place Thread data ever surfaces is
`ArticlePage.tsx`'s inline `ThreadSection` — a small "Součást vlákna: {title}" block embedded in
each member Article's own page, linking to sibling members' `/article/:id` pages. There is no
timeline view, no thread-level landing destination, and no route in `App.tsx` referencing `thread`
at all.

This gap was already known and deliberately deferred by
`.scratch/backend-audit/issues/17-thread-recompute.md`, which built the Thread aggregate + this
minimal inline surface but explicitly scoped a "genuine UI redesign" of a real Thread page out as
its own future ticket — this is that ticket. Before anything gets built, run an actual `/grilling`
session with the user to pin down what a Thread page should actually show and look like; this is
real UI/UX design work (timeline layout, whether member roles `ORIGIN`/`DEVELOPMENT`/`REACTION`/
`RESOLUTION` get shown or labeled, what happens for a Thread with only one member so far, whether
it needs its own route or could be a modal/expansion from `ArticlePage`) — not something to build
ad hoc from a single assumption.

**Blocked by:** none — the backend Thread aggregate + member roles already exist
(`.scratch/backend-audit/issues/07-thread-aggregate.md`, `16-story-event-time.md`,
`17-thread-recompute.md`), this is purely a frontend/UX question.

**Status:** ready-for-agent

- [ ] Before the session: survey current state as raw material to grill against — what
      `ThreadSection` in `ArticlePage.tsx` renders today, what fields the Thread aggregate/backend
      already expose (member list, roles, `eventTime` ordering) vs. what a real Thread page would
      need that isn't exposed yet, and whether any existing page (`HomePage.tsx`, styleguide) has a
      layout pattern worth reusing.
- [ ] Run the `/grilling` session with the user, grounded in that survey.
- [ ] Record the outcome below (decisions reached, and what — if anything — gets spun into its own
      follow-up implementation ticket).
- [ ] File follow-up ticket(s) for anything the session decides should be built; note explicitly if
      the session decides the current inline `ThreadSection` is sufficient as-is and no dedicated
      page is needed after all.

## Outcome

*Not yet run.*
