# 16 — Automated Article Ingestion

**What to build:** A scheduled process that discovers newly-published articles across all monitored RSS outlets, deduplicates them against Stories already being tracked, and creates a Draft Analysis for anything genuinely new — without spending Extraction/Synthesis LLM cost until an Admin reviews and approves it. See ADR 0013 for the full design rationale.

**Blocked by:** 03 — Discovery: GDELT + RSS, 15 — Cross-Source Narrative & Article Rebrand.

**Status:** ready-for-agent

- [x] `Analysis.status` gains a `DRAFT` value (`DRAFT | PENDING | COMPLETE | FAILED`)
- [x] A new endpoint (e.g. `POST /api/ingestion/run`) triggers one ingestion pass; authenticated via a shared secret (a new `INGESTION_SECRET` env var, checked via header) rather than the existing JWT/cookie session, since no human/browser is involved
- [x] One ingestion pass lists the latest items across all monitored RSS feeds (reusing `queryRssFeeds`)
- [x] For each item not already known, keywords are extracted and `discoverCoverage` runs to check whether it matches Coverage already attached to an Analysis created within the last 48 hours
- [x] No match found → a new `Analysis` is created at `status: DRAFT`; the triggering article is scraped, keyword-extracted, and Discovery is run and its results stored as candidate Coverage — the same cheap steps `createAnalysis`/`discoverSources` already do for a human-seeded Analysis, but run automatically with no human input
- [x] A match found against an Analysis with `status: PENDING` or `DRAFT` → the new article is added as another candidate Coverage on that existing Analysis, not a new Draft
- [x] A match found against an Analysis with `status: COMPLETE` → does not modify that Analysis; instead creates a distinct review-queue item flagging it as a possible addition, requiring separate Admin approval before anything about the completed Analysis changes
- [x] A new Admin-only page lists all `DRAFT` Analyses (and pending "possible addition" flags) for review
- [x] From the review queue, an Admin can approve a Draft — flips `status: DRAFT → PENDING` and proceeds through the existing confirm-Coverages/Extraction/Synthesis pipeline unchanged — or reject it
- [x] A rejected Draft is marked (not deleted), and Ingestion's dedup check treats it as already-seen so it isn't recreated on a later run
- [x] The reader-facing Article listing (ticket 15's `COMPLETE`-only allow-list filter) correctly shows no `DRAFT` or rejected entries with no additional filtering logic needed
- [x] `docker-compose.yml` gains a lightweight sidecar service that calls the ingestion endpoint every 15–30 minutes
- [x] `CONTEXT.md` gains an "Ingestion" glossary entry, distinguishing it from "Discovery" (already reflected as of this ticket's design session — verify it's still accurate once implemented)
