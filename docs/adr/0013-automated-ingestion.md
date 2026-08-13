# ADR 0013 — Automated ingestion via a Draft Analysis status, not a separate candidate model

## Status
Accepted

## Context
Discovery today only runs once a human has pasted a Seed Article. Automated Ingestion needs to find brand-new articles across all monitored outlets on a schedule and decide which are worth analysing — without spending Extraction/Synthesis LLM cost on every routine or duplicate article across 8 outlets, and without silently creating multiple Analyses for what's really one Story.

Two ways to model "found automatically, not yet reviewed" were considered: add a `DRAFT` status to the existing `Analysis` lifecycle, or introduce a wholly separate candidate model that only becomes an `Analysis` on approval.

## Decision
Add `DRAFT` to `Analysis.status` (alongside `PENDING`/`COMPLETE`/`FAILED`). Ingestion creates the row immediately at `DRAFT` and eagerly runs the cheap steps — scrape, keyword-extract, Discovery — so an Admin reviewing the queue already sees its likely Coverage set. Extraction and Synthesis, the expensive passes, wait for explicit Admin approval, which flips `DRAFT → PENDING` and reuses the existing confirm/stream pipeline unchanged.

Deduplication reuses Discovery itself: before creating a Draft, Ingestion runs the same keyword-search Discovery already does for a human-seeded Analysis, and checks whether a matching Coverage already exists on an Analysis from the last 48 hours. No new matching mechanism, no ML, no cross-outlet slug/ID scheme — outlets don't share one. A match against an already-completed Analysis doesn't reopen it automatically; it surfaces as a new review-queue item ("possible addition to Analysis #X") requiring separate Admin approval. A rejected Draft is marked, not deleted, so Ingestion doesn't re-queue the same story on its next run.

Ingestion is triggered externally — a small `docker-compose.yml` sidecar service polling a new shared-secret-authenticated endpoint every 15–30 minutes — not an in-process scheduler inside the Fastify server, keeping "check for new articles" an explicit, testable action rather than a hidden background timer tied to the server process's lifetime.

The separate-candidate-model alternative was rejected: it would need its own repository/mapper/service/routes/UI, plus a "promote candidate → real Analysis" step re-implementing chunks of the existing seed/Discovery flow a second time — duplicated logic across two entry points that could silently diverge. `DRAFT` reuses one lifecycle instead.

## Consequences
`Analysis.status` now carries two different kinds of meaning depending on how a row was reached — `PENDING` for a human-confirmed Analysis actively running Extraction/Synthesis, `DRAFT` for something nobody's reviewed yet. The reader-facing Article listing (ADR 0012) must show `COMPLETE` only — an allow-list, not a block-list, so a future status addition doesn't require every caller to remember to exclude it too.
