# Map: Backend Audit Remediation

Label: wayfinder:map

## Destination

A triage decision on every finding in `docs/audit.md` (a 1701-line, Czech-language architectural audit of the backend): for each, decide whether it's a real bug/gap worth fixing now, or a legitimate scale-oriented improvement worth deferring with an explicit, checkable trigger condition — never a silent drop. Reaching the end of this map means every finding has landed in exactly one of: accepted-now (→ implementation tickets in `.scratch/news-triangulator/issues/`), deferred-with-trigger, or ruled out of scope.

## Notes

- Source document: `docs/audit.md`, untracked and not committed — a stray artifact from a code-review sub-agent that went off-script during the Event Graph work (tickets 34–37) and produced a general architecture audit instead of the scoped diff review it was asked for. Read in full before charting this map. Its own §2.3 note ("Event Graph has no reader surface — decide whether to feature-flag it off") is stale: ticket 37 shipped that reader surface (Related Events on the Article page) after the audit was written.
- Project scale framing (user, 2026-08-18): not solo/personal-only forever — there's real intent to grow — but not scaling today either. This is why findings that are pure scale-architecture (job queue, pgvector, `Thread` aggregate) get a trigger-deferred option instead of being dismissed outright or built speculatively.
- Consult `CONTEXT.md` for domain vocabulary and `docs/adr/` before any ticket touches a term or decision that might already be settled — in particular **ADR 0022** (Story-relation data model: entities stored as Story-scoped JSON, not a table) is directly disputed by the audit's §7.3 and is the subject of [Entity model: table vs. JSON — revisit ADR 0022?](issues/04-entity-model-table-vs-json.md).
- Implementation work that comes out of an accepted-now ticket goes through the normal `/mattpocock-skills:to-spec` → `/mattpocock-skills:to-tickets` → `/mattpocock-skills:implement` pipeline into `.scratch/news-triangulator/issues/`, same as tickets 32–37 — this map produces decisions, not code.
- Never resolve more than one ticket per session (this map has no `research`-typed tickets, so no exception applies here).

## Decisions so far

- [Quick fixes: no-brainers regardless of scale](issues/01-quick-fixes-no-brainers.md) — accepted P0-1 (no indexes), P0-4 (LlmCallLog stores full embedding vectors forever), P2-17 (non-timing-safe secret compare), P2-20 (no curl `--max-time`), P2-26 (integration tests skip push-to-`ticket/**`); split P2-24 (admin audit log) into its own ticket; deferred P1-12 (title-less Coverage misclassified as a verification failure) to pair with P2-23 later; rejected P2-25 (`.scratch/` committed) as not-a-finding — that's this project's deliberate ticket-tracking convention.

## Not yet specified

- Concrete numeric trigger conditions for the two deferred-candidate tickets (retrieval/matching architecture, async job queue) aren't chosen yet — resolving those tickets *is* choosing the trigger, not a prerequisite to them.
- Whether `docs/audit.md` itself is kept (translated, as reference material) or deleted once every finding has a home — not yet decided; revisit once the map's tickets are resolved and nothing in the raw file is still unaccounted for.
- P1-12 (title-less Coverage logged as a verification failure it never underwent) — real, but deferred out of ticket 01 pending P2-23 (splitting `EXTRACTION_FAILED` into a real `blockReason` enum), since an honest fix for P1-12 likely wants the same reason-taxonomy machinery. Not yet sharp enough to ticket on its own until P2-23 is scoped.

## Out of scope

(none yet — the destination is a full triage of every audit finding, so nothing is ruled out up front; a ticket may still turn out to sit beyond scope once resolved, at which point it moves here)
