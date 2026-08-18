# 09 — Admin-action audit log

Type: grilling
Status: open
Blocked by: none — can start immediately

## Question

Spun out of [Quick fixes: no-brainers regardless of scale](01-quick-fixes-no-brainers.md) — **P2-24** confirmed real (no audit log of admin actions exists anywhere in the codebase today), but it's a new table plus wiring into 4 call sites (approve/reject Draft, approve/reject StoryRelation), not a one-liner alongside the actual quick fixes.

Decide:

1. What does a minimal audit-log row need — actor (admin user id), action type, target (Analysis/StoryRelation id), timestamp, and... anything else? The audit doesn't specify a shape, just that these actions "spend LLM money" and currently leave no trace.
2. Does this need its own admin-facing UI to view the log, or is "queryable via Prisma Studio" sufficient for now — same pattern as `LlmCallLog` (see `CONTEXT.md`'s "LLM Call Log" entry: "a maintainer's tool... inspected via Prisma Studio rather than surfaced anywhere in the app itself")?
3. Which 4 call sites get wired: `approveDraft`/reject-equivalent in `ingestionService.ts`, `approveStoryRelation`/`rejectStoryRelation`. Confirm this is the complete list — check for any other mutating admin action that spends money or changes state irreversibly.
