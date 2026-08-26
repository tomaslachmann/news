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

**Status:** done

- [x] Before the session: survey current state as raw material to grill against — what
      `ThreadSection` in `ArticlePage.tsx` renders today, what fields the Thread aggregate/backend
      already expose (member list, roles, `eventTime` ordering) vs. what a real Thread page would
      need that isn't exposed yet, and whether any existing page (`HomePage.tsx`, styleguide) has a
      layout pattern worth reusing.
- [x] Run the `/grilling` session with the user, grounded in that survey.
- [x] Record the outcome below (decisions reached, and what — if anything — gets spun into its own
      follow-up implementation ticket).
- [x] File follow-up ticket(s) for anything the session decides should be built; note explicitly if
      the session decides the current inline `ThreadSection` is sufficient as-is and no dedicated
      page is needed after all.

## Outcome

**Grilling session held 2026-08-26.**

Surveyed current state before the session (see also `.scratch/backend-audit/issues/17-thread-recompute.md`):
`Thread` already has `title`/`slug` (unique, declared but unrouted)/`firstEventAt`/`lastEventAt`/
`status`/`memberCount`; a Thread never has fewer than 2 members (`threadRecomputeJob.ts` never
creates a 1-member Thread); member `role` is deliberately never reader-facing (ticket 17's Answer,
Q2, ADR 0012-aligned); no standalone `GET /api/thread/:slug` endpoint exists — Thread data today
only rides inside `AnalysisDetail.thread` (`ArticlePage.tsx`'s inline `ThreadSection`), COMPLETE-
members-only, gated to `memberCount >= 2` visible members. Also found the actual reference design
mockup (`thread.html`, ported partially into the styleguide as `NT.thread`/`data3.js`) — far more
ambitious than the real backend can honestly back: a chart tracking one specific numeric claim
across sources/days, per-event "what changed" narrative + breakthrough/correction badges, per-
outlet-article agreement percentages, a thread-level open-questions synthesis, and editorial
per-source role labels. None of that has any real data behind it in this codebase today.

Decisions reached with the user:

- **Build the dedicated page.** `Thread.slug` exists for exactly this; a multi-stage arc deserves
  its own URL rather than only being reachable from whichever member Article a reader opened first.
- **No role labels on the new page either** — carries forward ticket 17/ADR 0012's existing call.
- **Trend chart (tracked numeric value): out of scope entirely**, not even a placeholder. Spun into
  ticket 66 (grilling) as a general `NarrativeBlock` chart-type question, not a Thread-specific
  bolt-on — no capability to extract/track a single numeric claim across sources and time exists
  anywhere in this codebase.
- **Chronology + "all articles" table: build both, at two different real granularities.** The
  chronology timeline stays at Thread-member (Story/Analysis) granularity — real fields only
  (headline+link, `eventTime`, source count, `sourceOverlap` gauge/%, `agreementCategory` chip),
  dropping the mockup's fabricated "what changed" prose and mark badges. The "all articles" table
  goes to individual-outlet-article (Coverage) granularity — made honest by matching each
  Coverage's `articleUrl` against every dimension item's `Attribution.articleUrl` across its
  Analysis, tagging each row with every dimension it was actually cited under (shoduje se / v
  rozporu / jedinečné / bez zvláštního zjištění) instead of a fabricated percentage.
- **Sources rail**: real aggregated per-outlet Coverage counts across the thread; drop the
  mockup's invented editorial role labels (no classification for that exists).
- **Entities rail**: real, aggregated entity mentions across every member Analysis — pure
  aggregation, no new LLM call needed.
- **Open-questions rail**: no real thread-level synthesis exists (spun into ticket 67, grilling).
  Ships now anyway with mock/placeholder content, clearly marked in code as awaiting ticket 67 —
  not DEV-gated, since there are no real readers of this deployment yet.
- **`daystats` strip**: keep, real numbers throughout (opened = `firstEventAt`, member/source
  counts, average `sourceOverlap.percentage`, contradiction count, `lastEventAt`) — rename
  "Otevřené rozpory" to plain "Rozpory" (no resolved/unresolved status is actually tracked).
- **"How a thread forms" explainer box**: keep, rewritten to describe the real
  `ACTIVE`/`DORMANT`/`CLOSED`/`thread.recompute` logic instead of the mockup's invented rules.
- **No perex** (summary paragraph) — no real thread-level summary text exists (`runThreadTitlePass`
  only ever produces a short title); matches `ArticlePage.tsx`'s own real header precedent (title +
  byline, no perex either).
- **Homepage gets a "recently updated Threads" highlight** — new, no design precedent for it
  (checked the reference design's homepage template — nothing thread-related there). Top 3 by
  `lastEventAt`, real data, same visible-member gate as everywhere else, modeled on this session's
  own recent compact homepage rails (ticket 61's "Nejčtenější").
- **New `/threads` browse-all list page + a real nav entry** — paginated, `lastEventAt` DESC,
  includes `ACTIVE`/`DORMANT`/`CLOSED` (a closed arc is still worth reading), same row shape as the
  homepage teaser. A real, working nav link — unlike the site's existing dead rubric placeholders.

Follow-up tickets filed from this session:

- **66 — Grilling: a chart/data `NarrativeBlock` type.** Whether/how the LLM-authored (or
  deterministic) Narrative document gains a chart-shaped block, and what upstream numeric-claim-
  tracking capability it would need. Not resolved yet.
- **67 — Grilling: thread-level "open questions" synthesis.** How to honestly derive what's still
  unresolved across a Thread's members. Not resolved yet.
- **68 — Thread detail backend.** `GET /api/thread/:slug` + repository/mapper/service layer for
  everything decided above except the homepage section and the browse-all list.
- **69 — Thread detail frontend page.** Consumes 68. Blocked by 68.
- **70 — Homepage "recently updated Threads" section.** Blocked by 68.
- **71 — `/threads` browse-all list page + nav entry.** Blocked by 68.
