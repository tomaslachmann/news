# 15 — Cross-Source Narrative & Article Rebrand

**What to build:** A generated Cross-Source Narrative — one readable article per Analysis, combining what every source reported, with inline citations — becomes the default view of a completed Analysis. Built from the full text of every Coverage plus the four already-computed Analysis Dimensions, which act as a binding classification so the Narrative can be detailed without ever resolving a disputed fact itself (see ADR 0012). The reader-facing (no-login) product surface is rebranded from "Analysis" to "Article" throughout — the domain entity, DB, and API keep the "Analysis" name; only reader-facing copy changes.

**Blocked by:** 07 — Synthesis Pass, 08 — Analysis Results UI, 09 — History Page.

**Status:** ready-for-agent

- [ ] A new LLM pass (Cross-Source Narrative) takes the full extracted text of every Coverage plus the Analysis's four Dimensions as input, and produces continuous prose with inline citations
- [ ] The Narrative states Agreement claims plainly, citing every confirming Source; presents Contradiction claims as open disagreement (never resolves which is correct); attributes Unique Reporting claims to their one Source; describes Framing differences rather than smoothing them over
- [ ] The Narrative is never generated eagerly — it's generated on first view of a completed Analysis and cached (stored so subsequent views don't re-trigger the LLM call)
- [ ] `GET /api/analyses/:id` (or a new endpoint) returns the cached Narrative once generated, generating it on demand if not yet cached
- [ ] The Narrative is the default view when opening `/analysis/:id`; the existing four-dimension tabs (Agreement/Contradiction/Unique Reporting/Framing) remain available as a secondary "structured breakdown" view
- [ ] For anyone without a login, all reader-facing copy — nav label, page titles, the History page — refers to "Article"/"Articles" instead of "Analysis"/"Analyses"; routes stay unchanged (`/history`, `/analysis/:id`)
- [ ] The reader-facing Article listing is filtered to `status: COMPLETE` only (an allow-list, not a block-list of specific statuses to exclude — so a future status addition is excluded by default rather than requiring this filter to be updated)
- [ ] Admin-authenticated views keep using "Analysis" terminology and retain visibility into all statuses
- [ ] `mappers/analysis.ts`'s `row.status.toLowerCase() as X['status']` casts are tightened (e.g. an explicit status-map lookup, mirroring `mappers/coverage.ts`'s `STATUS_MAP` pattern) so the compiler catches a mismatch between the Prisma enum and the shared status union, rather than trusting an unchecked cast
- [ ] `CONTEXT.md` gains "Cross-Source Narrative" and "Article" glossary entries; `CLAUDE.md`'s stated non-goals are updated to clarify a generated Narrative is in scope as long as it never adjudicates a disputed fact (already reflected as of this ticket's design session — verify it's still accurate once implemented)
