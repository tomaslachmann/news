# 67 — Grilling: thread-level "open questions" synthesis

**Type:** grilling

**What to resolve:** Split off ticket 65 (Thread overview page), Q6. That ticket's design
reference has an "Otevřené otázky" (open questions) sidebar rail — a curated list of what a Thread
still hasn't resolved, each with a short question + supporting detail. No capability anywhere in
this codebase synthesizes this today: each individual Analysis has its own `contradiction`
dimension items (per-Analysis, LLM-generated at Synthesis time — ADR 0034/ticket 47), but nothing
reads *across* a Thread's several member Analyses to decide which of those (or which cross-member
tension) is still genuinely open versus already resolved by a later member.

Per ticket 65's own answer: until this is resolved, the Thread page ships this rail as visible but
explicitly mock/TODO content (not silently dropped) — this ticket is where the real version gets
designed.

Not yet decided:

1. Is "open question" something a new LLM pass actively generates (reading every member's
   `contradiction`/`agreement`/`uniqueReporting` items plus their prose, then judging what's still
   unsettled), or something derived more mechanically (e.g. any `contradiction` item on the
   *most recent* member that no later member's `agreement` dimension addresses)? The latter avoids
   a new LLM call per Thread but needs a real definition of "addressed by a later member" that
   doesn't currently exist as a data relationship anywhere.
2. When does this run — as part of `thread.recompute` (ticket 17's existing job) each time a new
   member joins, or as its own separate job/pass?
3. Does this ever call an LLM, and if so under what verification discipline (ADR 0034's
   `verifyAndRepair` exists for the Narrative specifically — does a thread-level synthesis need an
   equivalent, or can it stay a smaller, more mechanical judgment that doesn't need one)?
4. Interacts with ticket 66 (chart block) only in that both are "Thread page content with no
   current backing" — otherwise independent; this ticket doesn't need 66 resolved first or vice
   versa.

## Answer

*Not yet run.*
