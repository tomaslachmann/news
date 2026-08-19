# 17 — `Thread`/`ThreadMember` + `thread.recompute`

Type: grilling
Status: open
Blocked by: 13 (queue), 16 (`Story.eventTime`)

## Question

The aggregate itself, split from [Thread aggregate](07-thread-aggregate.md) via [ADR 0029](../../../docs/adr/0029-thread-aggregate.md), which settles the schema (`Thread`/`ThreadMember`, `ACTIVE`/`DORMANT`/`CLOSED`, `ORIGIN`/`DEVELOPMENT`/`REACTION`/`RESOLUTION`), the recompute mechanism (recursive CTE over `PUBLISHED` `FOLLOW_UP` edges, §8.6, `UNION` not `UNION ALL`, depth-capped at 50), and the `DORMANT → ACTIVE` revival approach (entity-configuration overlap via ADR 0024's tables, not a stretched candidate window). Not blocked by tickets 14/15 — `FOLLOW_UP` edges are already produced by the existing (for now still synchronous) relation-linking path regardless of when that itself moves to the queue.

Not yet decided:

1. `deriveThreadTitle` — the audit specifies "z Agreement napříč členy, ne z 1 titulku" (from Agreement across members, not one headline) but doesn't give a mechanism. Is this an LLM call (matching how the tool-authored Analysis headline works, ADR 0021 — same model? own `THREAD_MODEL` env var, matching ticket 11/12's per-pass-model precedent?) or a simpler derivation (e.g. the `ORIGIN` member's own generated headline, reused)?
2. `inferRole(member, index, total)` — the audit's pseudocode leaves this a black box. A plausible default: first member `ORIGIN`, last `RESOLUTION`, everything between `DEVELOPMENT` (with `REACTION` reserved for a member whose confirming `StoryRelation` reasoning indicates a response/reaction rather than a factual continuation) — needs a concrete rule, and confirmation this is presentation-only (never surfaced as an asserted fact the way ADR 0012 already guards against elsewhere).
3. Reader-facing surface: does ticket 37's existing "Related Events" section on the Article page gain a "this Event is part of a longer Thread" affordance now, or does this ticket build the data model only and leave the UI to a follow-up? (The Thread aggregate has no value to a reader until something displays it.)
4. `DORMANT → CLOSED` is manual-admin-action only per the audit's state diagram — does an Admin surface for this exist yet anywhere comparable (the Draft/StoryRelation review queues, tickets 36/09), or does this ticket need to add one?
5. `thread_active_idx`-style query needs — does anything read "all ACTIVE Threads" today (e.g. a homepage "ongoing stories" section), or is this schema built with no reader currently consuming it (worth flagging explicitly, matching this project's own audit §2.3 concern about Event Graph shipping before its reader surface did)?
