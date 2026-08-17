# ADR 0019 — Unify same-event classification between Discovery and Ingestion; dedup on submission

## Status
Accepted

## Context
ADR 0018 gave automated Ingestion its own retrieval mechanism (embedding-similarity matching against open Stories, no LLM on the hot path) while leaving human-seeded Discovery's mechanism (GDELT/RSS keyword search, per-candidate LLM verification via `verifySameStory`) untouched. That split was deliberate and remains correct — but it left two separate, independent implementations of the same underlying question: "does this candidate describe the same real-world event as an anchor headline?" Discovery answers it with an LLM call per candidate; Ingestion answers it with cosine similarity plus a time-decay factor, deferring LLM confirmation to a bulk pass at Draft approval.

This duplication had a real, previously-undiagnosed consequence: `analysisRepo.createAnalysis` (human-seeded Story creation) never computed an embedding, because Discovery's own classification never needed one. That meant Ingestion's matching pool — which scans every open Story regardless of origin, per ADR 0018 — could never actually recognize a human-seeded Story, since it had nothing to compare against. Ticket 23's notes flagged this as a "known, intentional gap." It turned out to be a symptom of the deeper duplication, not an independent gap: once Discovery and Ingestion's same-event question shares one embedding representation, the gap closes as a side effect rather than needing separate work.

A second, related gap surfaced during this investigation: human-seeded submission never checked whether the seed URL already matched an open Story at all — from any origin, Ingestion or another human. It always created a new `Story`+`Analysis` unconditionally. This is the same underlying problem wearing a different hat: "is this event already being tracked?" was answered for Ingestion's inbound RSS items but never for a human's inbound seed URL.

Scoped via a `/grill-with-docs` session (2026-08-17), which also settled what "one pipeline" should and shouldn't mean here — see Decision.

## Decision

**1. Candidate *sourcing* stays separate.** Discovery's GDELT/RSS search for a specific seed and Ingestion's continuous RSS polling answer genuinely different questions ("find articles for this seed" vs. "watch these feeds forever") and there is no duplication to remove by merging them. This ADR does not touch `discovery.ts`'s or `rss.ts`'s retrieval mechanisms.

**2. Same-event *classification* is unified, with per-caller cost budgets.** Both paths now go through the same embedding-similarity core (`storyMatching.ts`'s `findBestMatch`, unchanged from ADR 0018) as the first pass. What differs is what happens after a candidate clears `MATCH_THRESHOLD`:
   - **Human-seeded submission** (`analysisService.createAnalysis`) can afford — and now runs — an LLM confirmation (`verifySameStoryLogged`) on the embedding match before trusting it. It's a rare, real-time, human-waited call; the cost profile that made Ingestion's per-item LLM call unattractive at polling scale (ADR 0018) simply doesn't apply here.
   - **Ingestion's per-item hot path** is unchanged: still embedding-only, still deferring LLM confirmation to the bulk quality gate at Draft approval (ADR 0018's `approveDraft`). Nothing about Ingestion's cost profile changed, so nothing about its mechanism needed to.

**3. Human-seeded Stories now get an embedding at creation** (`analysisRepo.createAnalysis` accepts an optional `embedding`, mirroring `createDraftAnalysis`), computed the same way Ingestion computes one for an RSS item (`buildEmbeddingInput`, title + excerpt). This closes ticket 23's gap directly: once both a human-seeded Story and an Ingestion-created Story carry an embedding, Ingestion's existing `findRecentStoriesForMatching` query (which already scans every Analysis status/origin) recognizes both without any change to Ingestion's own code.

   No backfill for Stories created before this shipped: the matching window (`DEDUP_WINDOW_HOURS`, 48h) makes any older Story already irrelevant to matching, embedding or not — it simply couldn't have matched anything today either.

   Embedding generation failure degrades gracefully rather than blocking submission: the Story is created without an embedding (same as every human-seeded Story before this ADR), and the dedup check in point 4 is skipped for that submission. Unlike Ingestion's per-item retry-next-poll safety net, a one-off human submission has no "next poll" to fall back on, so failing outright would be strictly worse than proceeding without the new capability.

**4. Human-seeded submission now checks for an existing match before creating anything.** `createAnalysis` embeds the seed, runs it through the same `findBestMatch` query Ingestion uses, and — if a candidate clears threshold and is LLM-confirmed as the same event — returns that match instead of creating a duplicate `Story`/`Analysis`. A `FAILED`-status match is treated as no match at all (not Ingestion's "already seen, skip" behavior): a human explicitly resubmitting a URL deserves a fresh attempt, not a silent no-op.

   What happens next depends on the matched Analysis's status, decided by the same grilling session:
   - **DRAFT or PENDING**: the submitted seed is attached as Coverage, and a DRAFT match is also run through the normal `approveDraft` flow inline. An Admin explicitly seeking this story out and submitting it is treated as a stronger, more deliberate signal than Ingestion finding it passively — it shouldn't then sit in the Ingestion review queue waiting for a second, separate approval click from the same person.
   - **COMPLETE**: no Coverage is added and nothing is re-synthesized; the Admin is taken straight to the existing `/analysis/:id`. Re-opening a finished Analysis to incorporate a new source is out of this ADR's scope — the Admin can decide that for themselves having seen what already exists, rather than the system pre-flagging it the way Ingestion's own COMPLETE-match handling does for a passive process with nobody watching.

   Because a confirmed match is a probabilistic judgement (embedding threshold + one LLM call), not a certainty, the Admin always gets a confirm/override moment before anything is created or attached — "this looks like the same story: *headline*, status *X* — continue with it, or create separate anyway." A false positive here (silently merging into the wrong Analysis) is more costly than a false negative (a harmless duplicate Story, exactly the status quo before this ADR), so the override exists specifically to make false positives cheap to escape.

**5. Only `POST /api/analyses` submission gained a permission-model dependency worth naming explicitly**: only Admins can reach this path at all (Role definition, `CONTEXT.md`), so there is no ReadOnly-vs-Admin distinction to design for in the confirm/override flow — the Admin who submits and the Admin who'd need to override are always the same actor.

## Consequences
- Discovery's real-time submission path is now slightly more expensive per call (one additional embedding call, and one additional LLM call only when a candidate clears the match threshold) — negligible next to the existing keyword-extraction and per-candidate verification calls it already makes.
- Ingestion's hot-path cost is completely unchanged; ADR 0018's cost rationale for it still holds and nothing here revisits it.
- `POST /api/analyses`'s response is now a discriminated union (`outcome: 'created' | 'matched'`) instead of always creating an Analysis — a breaking API shape change, confined to this one endpoint and its one frontend caller (`HomePage`).
- A new endpoint, `POST /api/analyses/:id/attach-seed`, exists purely to serve the "continue with this match" action.
- `CONTEXT.md`'s `Discovery` and `Ingestion` entries need correcting to describe the shared classification step, while keeping the two entry points themselves distinct — see the ADR 0018 gap this closes.
- No change to `pgvector`-vs-in-application-cosine-similarity (ADR 0018's reasoning is unaffected by which caller triggers the comparison).
- **Two known, accepted limitations, not fixed by this ADR:**
  - The submission dedup check has a TOCTOU race: nothing locks or transactionally re-checks between reading candidate Stories and writing the new Analysis. Two admins submitting the same or an equivalent seed URL within the same few-second window can both pass the dedup check and both create a Story for the same event. This is the same class of imperfection Ingestion's own sequential-poll matching already accepts (ADR 0018 doesn't attempt exact-once matching either), and the failure mode — a duplicate Story — is exactly the pre-existing status quo whenever a match is a false negative, not a new regression. A real fix (a DB-level uniqueness/locking strategy) is out of scope here; revisit only if concurrent-admin double-submission turns out to happen in practice, not preemptively.
  - `attachSeedToMatch` re-scrapes the seed URL that `createAnalysis` already scraped moments earlier in the same user flow, discarding that first result. This is consistent with ADR 0004 (no article caching) rather than an oversight — introducing a cache purely to bridge these two requests would cut against that decision for one narrow case. The cost is a second network fetch and a small chance the second fetch fails where the first succeeded, surfaced to the Admin as a plain "couldn't reach the article" error on an otherwise-already-confirmed action.
