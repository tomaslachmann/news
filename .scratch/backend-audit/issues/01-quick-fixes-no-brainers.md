# 01 — Quick fixes: no-brainers regardless of scale

Type: grilling
Status: open
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
