# 67 — Grilling: thread-level "open questions" synthesis

**Type:** grilling

**Status:** done

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

**Grilling session held 2026-08-26.**

Surveyed current state before the session: `DimensionItem`/`ContradictionItem`
(`packages/shared/src/index.ts`) carry only `id` (a UUID scoped to one Analysis's one Synthesis run
— ticket 47, added so `NarrativeAssertion.dimensionItemId` could cite it intra-Analysis), `prose`,
and `attributions[]` (`outlet`/`czechQuote`/`articleUrl`) — no topic/claim/entity field, no
cross-Analysis key of any kind. `thread.recompute` (ticket 17, `threadRecomputeJob.ts`) is a pg-boss
background job, triggered whenever a `StoryRelation` confirms as `FOLLOW_UP`, currently doing only
cheap DB-only aggregation plus one exception: a one-time LLM call (`runThreadTitlePass`) at Thread
*creation* only, whose failures are caught internally and never consume the job's own
"cheap, deterministic" retry budget (10×/5s), falling back to the ORIGIN member's title instead.
Extraction/Synthesis run request-synchronous (ADR 0028); Narrative generation and entity extraction
are already separate background jobs from Synthesis. A precedent for a small, unverified LLM
judgment already exists (`runHeadlinePass`/`runThreadTitlePass`: bare Zod-schema validation, no
`verifyAndRepair`/`verifyNarrativeDocumentOrThrow` machinery).

Decisions reached with the user:

- **Mechanism: LLM judgment, not mechanical derivation.** A new pass reads every member's
  `contradiction`/`agreement`/`uniqueReporting` items and prose and judges what's still genuinely
  open. Mechanical matching (e.g. "any contradiction unaddressed by a later member's agreement") was
  ruled out — there is no structural key linking items across different Analyses today (matching
  would mean inventing one, or comparing free text), and "is this tension still open" is an
  interpretive judgment the LLM is already trusted for elsewhere (framing, quote selection), not a
  raw computation ADR 0014's principle would forbid it from doing.
- **Trigger: a new, separate background job**, not folded into `thread.recompute` itself. Unlike the
  one-time title pass, open questions need re-evaluating on *every* new member (a new Analysis can
  resolve or add a tension), which is a materially different, more frequent cost/failure profile than
  `thread.recompute`'s current DB-only retry policy was tuned for. Mirrors this codebase's existing
  Synthesis→Narrative job split: keep the cheap deterministic aggregation job cheap, give the LLM
  pass its own retry policy suited to LLM flakiness. Enqueued from the same trigger points as
  `thread.recompute` (or chained off its completion).
- **Runs on every member addition**, not just Thread creation.
- **Verification/traceability: cite specific dimension items.** Each open question references the
  specific `{ analysisId, dimensionItemId }` it's about — satisfies this project's core design goal
  (root `CLAUDE.md`: "every claim stays traceable back to the source that made it"). A freeform-prose
  alternative (matching the `runHeadlinePass`/`runThreadTitlePass` precedent) was rejected as exactly
  the untraceable-claim gap the project exists to avoid. Verified with a dangling-reference check,
  same shape as Narrative's existing entity/source/value ref checks.
- **Failure mode: retry once, then fall back to an empty rail** (no open questions shown) rather than
  failing the whole `thread.recompute`/job chain or blocking the Thread page. A new discipline for
  this codebase, between `verifyAndRepair`'s drop-and-continue and `verifyNarrativeDocumentOrThrow`'s
  retry-then-throw-the-job — appropriate here because this is a supplementary rail (ticket 65 already
  ships it as replaceable mock content), not the primary Narrative document.
- **Ticket 66 interaction**: confirmed independent, as originally noted — neither blocks the other.

Follow-up ticket filed from this session:

- **74 — Implementation: thread-level open-questions synthesis.** New background job + LLM pass +
  dangling-ref verification, replacing the mock/placeholder open-questions rail ticket 65 shipped.
  Not blocked — the Thread aggregate and member Analyses already exist.
