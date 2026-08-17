# 28 — Local Dev Workflow: Ingestion Cron Script, Navbar Highlighting, README

**What to build:** A bundle of small, independently-scoped fixes surfaced by a `/grill-with-docs` session (2026-08-17) that started as a navbar bug report and a "how do I even run this locally" question:

1. The admin `NavBar` never highlights the active route, on any link — reader-facing or admin.
2. The Ingestion cron (`ingestion-cron` in `docker-compose.yml`, polling `POST /api/ingestion/run` every 20 min) only runs under full `docker compose up`. The documented local workflow (`npm run db` + `npm run dev`) never triggers it, so Ingestion silently never fires in local dev unless you `curl` the endpoint yourself.
3. `IngestionReviewPage`'s empty states ("Momentálně žádné koncepty." / "Momentálně žádná.") look identical whether Ingestion has never run or has run and genuinely found nothing new — no hint which is true.
4. `README.md` is stale: no mention of Roles/Auth, the admin Ingestion review queue, the admin Users page, `mise` tasks, or test/lint commands — and it documents raw `npm run …` throughout despite `mise.toml` already wrapping nicer tasks that nothing points to.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] `NavBar` (`App.tsx`) highlights the current route for every link — `react-router-dom`'s `NavLink` (or equivalent `useLocation` check), applied to all of Domů/Články/Historie/Uživatelé/Sběr článků, not just the admin-only links
- [ ] A new, separate, explicitly opt-in script polls `POST /api/ingestion/run` on an interval, mirroring `docker-compose.yml`'s `ingestion-cron` sidecar exactly (same endpoint, same `x-ingestion-secret` header, same ~20-minute interval) — **not** added to `npm run dev`, since every poll can spend real OpenAI money (embedding calls per ADR 0018, plus whatever an admin approves downstream). Warns and no-ops (does not crash the script or block anything else) if `INGESTION_SECRET` isn't set locally, matching the endpoint's own behavior
- [ ] `IngestionReviewPage`'s two empty states gain a short explanatory line distinguishing "Ingestion hasn't been triggered" from "ran and found nothing new" — no new backend/schema tracking of last-run time (that's a bigger feature than this ticket scopes); a static hint pointing at the new opt-in script/README section is sufficient
- [ ] `README.md` rewritten to cover: Roles/Auth (`ADMIN` vs `READONLY`), the admin Ingestion review queue and what it's for, the admin Users page, `mise` tasks in place of raw `npm run` commands (`mise run dev/db/studio/typecheck/test/lint/ticket-start/ticket-done`), test/lint commands, the new opt-in ingestion-cron script and why it's separate from `npm run dev`, `mise run studio` (Prisma Studio) as the way to inspect/clear local data, and an honest description of Discovery and Seed-Article submission vs. automated Ingestion as two currently-distinct entry points (with a pointer to ticket 27 for where that's headed)

## Notes

Scoped alongside ticket 27 (unifying Discovery/Ingestion's retrieval mechanism) from the same grilling session, but kept separate and immediately buildable — none of these four items depend on the mechanism-unification decision ticket 27 is blocked on.

Session investigation (read-only code audit) confirmed the core Draft → approve → Review Step → Analysis pipeline is not broken — no code fix needed there, only the four items above.
