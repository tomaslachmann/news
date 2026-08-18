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
- [Source identity: adopt Source/SourceFeed now?](issues/02-source-identity-model.md) — confirmed P0-6 (worse than described: Ingestion's attach path had no duplicate-source check at all, not just inconsistent naming); adopted the full `Source`/`SourceFeed` schema now (not the lighter option initially recommended); fixed at the DB level via a partial unique index, plus the Ingestion collision-check gap. Split P1-13 (no robots.txt/rate-limiting/backoff) into its own ticket.
- [Pagination and request caps](issues/03-pagination-and-request-caps.md) — DB still empty, no usage data to weigh against; built full keyset pagination now (reader listing + Admin draft queue) per the project's future-growth framing. The draft queue's visibility filter had to move from a JS post-filter into a `HAVING` clause (raw SQL) to paginate correctly. Added `MAX_CUSTOM_URLS`/`MAX_COVERAGES_PER_ANALYSIS` caps and fixed P0-2 (bounded Ingestion's known-URL lookback to 30 days instead of the whole table).
- [Entity model: table vs. JSON — revisit ADR 0022?](issues/04-entity-model-table-vs-json.md) — ADR 0022's entity-resolution-avoidance reasoning doesn't rule out a normalized table (the `key` stays a deterministic label either way); adopted `Entity`/`StoryEntity`/`StoryEntityRelation` tables now, recorded as [ADR 0024](../../docs/adr/0024-entity-storage-table-not-json.md) (amends ADR 0022's storage-shape clause only). Fixes P1-9 via IDF-weighted containment. Clean cutover, no `entitiesLegacy`. `storyCount` maintained transactionally only — no correction job, no new dependency on ticket 06. Omitted `EntityAlias`/`wikidataId`/`salience`/trigram search as speculative-generality. Split P1-14+P1-15 into [ticket 11](issues/11-entity-extraction-chunking-and-model-var.md); split salience/fuzzy-search into [ticket 12](issues/12-entity-salience-and-fuzzy-search.md). Unblocks (but does not resolve) [ticket 07](issues/07-thread-aggregate.md)'s `Thread` question. Decisions only — not yet implemented.

## Not yet specified

- Concrete numeric trigger conditions for the two deferred-candidate tickets (retrieval/matching architecture, async job queue) aren't chosen yet — resolving those tickets *is* choosing the trigger, not a prerequisite to them.
- Whether `docs/audit.md` itself is kept (translated, as reference material) or deleted once every finding has a home — not yet decided; revisit once the map's tickets are resolved and nothing in the raw file is still unaccounted for.
- P1-12 (title-less Coverage logged as a verification failure it never underwent) — real, but deferred out of ticket 01 pending P2-23 (splitting `EXTRACTION_FAILED` into a real `blockReason` enum), since an honest fix for P1-12 likely wants the same reason-taxonomy machinery. Not yet sharp enough to ticket on its own until P2-23 is scoped.

## Out of scope

(none yet — the destination is a full triage of every audit finding, so nothing is ruled out up front; a ticket may still turn out to sit beyond scope once resolved, at which point it moves here)
