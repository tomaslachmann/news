# 61 — Homepage "Nejčtenější" readership metric

**What to build:** Replace the homepage's fabricated `Nejčtenější` rail with a real readership
metric, or explicitly decide that the rail should not exist until readership tracking is in scope.
Ticket 60 must not invent a ranking from unrelated signals such as source count or contradiction
count.

**Blocked by:** none.

**Status:** ready-for-agent

- [x] Decide what "read" means for this local product: Article page view, distinct session view,
      time-on-page threshold, or another concrete metric.
- [x] Add the persistence needed to record that metric without leaking private reader identity.
- [x] Add a backend/API surface returning homepage-ready most-read Articles for a defined time
      window.
- [x] Wire the homepage `Nejčtenější` rail to that real metric.
- [x] Remove the fabricated sample ranking once the real metric exists.

## Notes

Filed from ticket 60 implementation planning on 2026-08-21. The existing homepage mock ranks items
without any readership data. That should be a separate product/data decision, not folded into the
aggregate rails ticket by substituting another available count.

**Implementation notes (agent, 2026-08-21):**
- "Read" = **Article page view** — one `AnalysisView` row per successful `ArticlePage` render of a
  COMPLETE Analysis (`POST /api/analyses/:id/view`, fired once per mount from a `useEffect`). Chose
  this over "distinct session view" (would require a session/cookie identifier — directly against
  "without leaking private reader identity") and "time-on-page threshold" (needs a client-side
  heartbeat/beacon — real added complexity and tracking surface for a local product with no
  analytics requirement). No dedup: the same visitor reloading an Article twice counts as two reads
  by design — there is no reader identity captured to dedupe against in the first place.
- Persistence is a raw, unaggregated event table (`AnalysisView { id, analysisId, createdAt }`),
  not a running counter or a scheduled-job snapshot like ticket 59's entity stats — this table is
  small and purpose-built, so the "most read in the last 24h" ranking is a live `groupBy` + `COUNT`
  query, computed on request, same live-query shape as the existing Minute/Contradictions rails
  (not a materialized snapshot the entity-stats trend comparison needed).
- `POST /api/analyses/:id/view` is a no-op (still 204) for a missing id or one that isn't COMPLETE
  — never an error, and never distinguishable from a successful record by its response, mirroring
  `GET /api/analyses/:id`'s own "never leak existence" posture from ticket 52. Only fires from the
  public `ArticlePage`, never from the Admin-only `/analysis/:id` monitoring view.
- Verified end-to-end against the real dev DB: recorded views for two COMPLETE Analyses and one
  DRAFT one, confirmed `GET /api/homepage/most-read` returns the two COMPLETE ones ranked by count
  and silently excludes the DRAFT one, and confirmed a missing id 204s as a no-op. No
  headless-browser tool was available to visually confirm the rendered rail (same limitation as
  tickets 51/52's own agent notes).
- Self-review (`/code-review`) found and fixed two real bugs: the view-recording `useEffect`'s
  once-per-mount guard was a plain boolean, but `/article/:id` is a single route React Router
  reuses across in-place navigations (no remount) — clicking a thread/related-event link from one
  Article to another permanently suppressed the beacon for every Article after the first one
  visited that way. Fixed by guarding on *which id* was last recorded instead. It also found the
  most-read `groupBy` had no secondary sort, so a view-count tie (easy on a low-traffic instance)
  had unstable ordering across identical requests — fixed by adding a `_max.createdAt` tiebreak
  (most-recently-viewed wins), smoke-tested live against a real tie. A third finding (a latent,
  currently-unreachable gap if the "Analysis never leaves COMPLETE" invariant were ever loosened)
  was left as-is — defending against it now would be exactly the unrequested
  speculative-generality ADR 0009 warns against, not a real bug in the current codebase.
