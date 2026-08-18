# 01 — Quick fixes: no-brainers regardless of scale

Type: grilling
Status: resolved
Blocked by: none — can start immediately

## Question

Which of these low-controversy `docs/audit.md` findings should become implementation tickets now? None of them depend on a scale decision — they're either pure correctness bugs, free wins (index additions with no behavior change), or cheap hardening. The session's job is to confirm each one is real (re-check against current code, since the audit was written before tickets 34–37 landed) and decide accept/reject/modify, not to re-litigate scale.

- **P0-1** — no non-unique indexes anywhere in the schema (audit §3, §8.1–§8.4 has concrete `CREATE INDEX` statements)
- **P0-4** — `LlmCallLog` stores full embedding vectors as text with no retention policy; audit estimates hundreds of MB–GB/day growth
- **P1-12** — `approveDraft` silently excludes title-less Coverage, surfacing as a false verification failure
- **P2-17** — non-timing-safe comparison of the ingestion shared secret
- **P2-20** — no `--max-time` on the ingestion cron's curl call
- **P2-24** — no audit log of admin actions that spend LLM money (approve/reject draft, approve/reject relation)
- **P2-25** — `.scratch/` (39+ working tickets) is committed to the repo
- **P2-26** — integration tests run only on `pull_request`, not on push to `ticket/**`, so regressions surface late

## Out of scope for this ticket

Anything that requires a schema migration beyond adding indexes/columns to existing tables, or that depends on a decision made in another ticket in this map (source identity, entity model, pagination, async architecture) — those live in their own tickets.

## Answer

Verified each finding against current code (not just the audit's text, which predates tickets 34–37) before deciding:

- **Accepted, implementing now:** P0-1 (schema genuinely has zero `@@index`, only one `@@unique` — confirmed via `schema.prisma`), P0-4 (`embeddingClient.ts:22` stores the full embedding vector as `JSON.stringify(embedding)` in `responseContent`, forever, confirmed), P2-17 (`ingestionAuth.ts:9` does a plain `!==` string compare on the ingestion shared secret, confirmed), P2-20 (docker-compose's `ingestion-cron` curl loop has no `--max-time`, confirmed), P2-26 (`ci.yml`'s `integration` job is gated `if: github.event_name == 'pull_request'`, genuinely never runs on push to `ticket/**`, confirmed).
- **Confirmed real but split out:** P2-24 (admin-action audit log) — nothing like it exists, but it's a new table plus wiring into 4 call sites, not a one-liner. Spun into its own ticket: [Admin-action audit log](09-admin-action-audit-log.md).
- **Deferred:** P1-12 — confirmed real (title-less Coverage is silently dumped into the same `failedIds` bucket as genuine LLM-rejected Coverage in `approveDraft`, logged as a verification failure it never actually underwent). Left out of this round rather than force a fix now, since the honest version of this fix probably wants the same `blockReason`-style enum machinery as P2-23 (splitting `EXTRACTION_FAILED` into real causes) — tackling them together later avoids doing the reason-taxonomy work twice. Left as fog on the map, not yet its own ticket.
- **Rejected:** P2-25 (`.scratch/` committed) — not a finding. `.scratch/news-triangulator/issues/` has been tracked since the project's first scaffold commit and is documented in `CLAUDE.md` as the implementation-ticket backlog; the audit read deliberate convention as clutter.

Implementation ticket: P0-1 + P0-4 + P2-17 + P2-20 + P2-26, one branch, one PR.

Implemented on `chore/audit-01-quick-fixes`. P0-4's fix (excluding the raw embedding vector from `LlmCallLog.responseContent`) turned out to narrow ADR 0020's explicit "uncapped, full response, every LLM-facing call" description — caught by code review, resolved with a new **ADR 0023** (amending ADR 0020 with a pointer) rather than leaving the trade-off undocumented in code comments alone.
