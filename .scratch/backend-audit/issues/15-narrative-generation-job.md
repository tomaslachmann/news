# 15 — Narrative generation as a queued job (supersedes ADR 0026's TTL fix)

Type: grilling
Status: open
Blocked by: 13

## Question

Split from [Thread aggregate](07-thread-aggregate.md) via [ADR 0028](../../../docs/adr/0028-pg-boss-job-queue-adoption.md). Moves narrative generation off `getAnalysisDetail`'s lazy-on-first-view trigger entirely, onto a job enqueued in the same transaction that marks an Analysis `COMPLETE` — matching how the tool-authored headline is already eagerly generated there (ADR 0021). This is the audit's originally-intended fix for P0-5 (§6: "Řešení: narrative generovat jako job... Zápis do DB pak slouží jako přirozený mutex napříč instancemi"); ticket 06 shipped a lighter interim fix (`narrativeGenerationFailedAt` + 24h TTL retry, ADR 0026) specifically *because* the queue was deferred at the time.

Not yet decided:

1. `narrativeGenerationFailedAt`'s role changes from "gates a read-endpoint's lazy retry" to "informs the job's own retry/backoff" — does `pg-boss`'s built-in retry config replace this field's purpose entirely (in which case: drop it, or keep it as an audit trail?), or does it still do real work (e.g. a longer cooldown than `pg-boss`'s own retry backoff would apply, for a case that's more likely a genuine content issue than a transient one)?
2. `getAnalysisDetail` currently returns `narrative: undefined` while generation is pending/hasn't run yet, and the frontend presumably renders "no narrative" the same way for "never attempted" and "failed." Once generation always happens at COMPLETE-time instead of first-view, does the reader ever see an Analysis mid-generation (COMPLETE but narrative not yet ready), and if so does the API/frontend need a distinct "generating" state, or is "no narrative yet" still an acceptable interim display?
3. `inFlightNarrativeGenerations` (the in-memory dedup Map) becomes entirely dead code once generation no longer happens in the request handler — confirm it's fully removable, not just unused in the common path.
4. Existing tests in `analysisService.test.ts` (the TTL-gating tests just added in ticket 06) test behavior this ticket removes — decide whether those tests get deleted outright or whether any of their assertions (e.g. "does not cache an empty narrative result") still apply to the job's own logic and should move rather than disappear.
