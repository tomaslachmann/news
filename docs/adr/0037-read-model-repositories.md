# ADR 0037 — Read-model repositories for composed/aggregate read surfaces

## Status
Accepted

## Context
ADR 0010's repository rule is "one file per Prisma model" (`repositories/analysis.ts`,
`repositories/coverage.ts`, and so on). That rule fits every repository this codebase had until
the homepage work (tickets 58–61): `repositories/homepageStats.ts` already queries across
`Analysis`, `SynthesisResult`, `Coverage`, `StoryEntity`, and `AnalysisView` in a single file, none
of which is "the Entity model" or "the Analysis model" — it's a composed aggregate built
specifically for one screen's display needs (`GET /api/homepage/summary`, `/minute`,
`/contradictions`, `/entities`, `/most-read`). Ticket 62 adds a second such surface
(`repositories/homepageArticles.ts`, `GET /api/homepage/articles`) and needs a documented answer
to "does this belong in `repositories/analysis.ts`, or is a composed read-model file actually the
right shape ADR 0010 didn't anticipate?"

Forcing a homepage aggregate into `repositories/analysis.ts` (or splitting one query across
several single-model repositories and recombining it in the service layer) would mean either that
file growing a "homepage" section unrelated to `Analysis`'s own CRUD concerns, or the service layer
doing cross-repository joins in application code that SQL/Prisma already does better in one query.
Neither reads as "one file per Prisma model" — they read as working around the rule for a case it
wasn't written for.

## Decision
**A read-model repository is a named exception to ADR 0010's "one file per Prisma model" rule**,
for a repository file that exists to serve one composed, display-specific read surface rather than
one Prisma model's own CRUD lifecycle. It still obeys everything else ADR 0010 says about the
repository layer — the only layer permitted to import `db.ts`/`@prisma/client`, called by exactly
one service, never called directly by a route.

A file qualifies as a read-model repository, not a scope violation of an existing single-model
repository, when:
- It serves one specific display/read surface (a page, a rail, a widget) with its own product-level
  slotting/ordering/limit rules — not a general-purpose query any caller might reuse.
- It composes across more than one Prisma model to answer that display's question, where no single
  model's own repository is the natural home for the join.
- It is named for the read model it serves (`homepageStats.ts`, `homepageArticles.ts`), not for a
  table it happens to touch.

A read-model repository must still **reuse existing per-model mapping/DTO logic where one already
exists**, rather than inventing a parallel shape for the same underlying data. `homepageArticles.ts`
follows `AnalysisListRow`'s existing shape end to end and calls `mappers/analysis.ts`'s existing
`toAnalysisListItem` — it does not define its own teaser/image/entity/outlet mapping. A read-model
repository composing new data with no existing mapper (e.g. `homepageStats.ts`'s Entity Dne
trend snapshot) still gets its own `mappers/<name>.ts`, per ADR 0010's normal rule.

## Consequences
- `repositories/` now contains two kinds of file: one-per-Prisma-model (the default, ADR 0010) and
  named read-model repositories (this ADR) — a reader checking "is this file's shape allowed"
  checks this ADR only for files that don't map to a single model.
- Read-model repositories are still forbidden from becoming a dumping ground for arbitrary
  multi-table queries — the "serves one specific display surface" test above is the actual bar, not
  "convenient to put here." A query with no display consumer of its own belongs in its underlying
  model's own repository, or doesn't belong in the codebase yet.
- ADR 0010 gets a short pointer to this ADR rather than being rewritten — the "one file per Prisma
  model" rule stays the correct default; this ADR only carves out the composed-aggregate case ADR
  0010 didn't originally consider.
