# 18 — Ingestion Dedup Verification Gate

**Superseded by 21 — Story Entity & Universal Same-Event Verification.** A production example showed the mis-clustering risk this ticket addressed also happens before an Analysis exists at all (Ingestion's own candidate sourcing for a brand-new Draft, never gated by this ticket's scope) and in the human-seeded flow (never covered here). Ticket 21 generalizes this ticket's `verifySameStory` mechanism to all three attach points instead of just Ingestion's dedup match. See ADR 0017.

**What to build:** ~~An explicit same-event LLM check that gates every match `findRecentAnalysisMatchingUrls` returns during an Ingestion pass, before Ingestion trusts it — closing the gap where a `DRAFT`/`PENDING` match is auto-attached with no human review at all.~~ See ADR 0015 (superseded) for the original design rationale.

**Blocked by:** 16 — Automated Article Ingestion.

**Status:** superseded

- [ ] A new function takes the triggering article's scraped title/excerpt and the matched Analysis's `seedHeadline`, and asks an LLM whether they describe the same real-world event, returning a structured `{ sameEvent: boolean, reasoning: string }`
- [ ] Uses the existing OpenAI-based `llmClient.ts` / a model consistent with keyword extraction — no new provider
- [ ] `ingestionService.ts`'s `runIngestionPass` calls this gate whenever `findRecentAnalysisMatchingUrls` returns a match, before branching on the matched Analysis's status
- [ ] Applies uniformly to all match outcomes — `DRAFT`/`PENDING` auto-attach and `COMPLETE` pending-addition — not just the previously-unreviewed auto-attach path
- [ ] On `sameEvent: false`, the item is treated exactly as if no match had been found — it flows into the existing new-Draft path, not a new status or code branch
- [ ] The gate's reasoning is logged (not discarded) so a wrong verdict is debuggable after the fact
- [ ] `IngestionRunSummary` (or logging) distinguishes a gate-rejected match from a true no-match, at least at the log level, so false-positive rates on the URL heuristic stay visible
- [ ] Tests cover: a genuine match confirmed by the gate (existing attach/flag behavior unchanged), a URL-heuristic match rejected by the gate (falls through to new-Draft), and the gate firing for a `COMPLETE`-match candidate, not just `DRAFT`/`PENDING`
