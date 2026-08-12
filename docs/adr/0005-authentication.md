# ADR 0005 — Username/password authentication with JWT in httpOnly cookie

## Status
Accepted

## Context
The tool is multi-user: Admins can submit Seed Articles and trigger Analysis; ReadOnly users can browse history and view completed Analyses. Unauthenticated visitors can also read, but cannot mutate anything. The deployment target is a self-hosted Docker Compose stack — OAuth providers, email flows, and external auth services add unnecessary complexity for this context.

## Decision
- **Credentials**: email + bcrypt-hashed password stored in a `User` table in PostgreSQL.
- **Session**: JWT signed with `JWT_SECRET` from `.env`, delivered in an httpOnly cookie. No refresh token — 30-day expiry. Re-login when expired.
- **First admin**: seeded from `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars on backend startup if no User rows exist.
- **Frontend auth state**: `GET /api/me` called once on app load, result held in React context. The httpOnly cookie is invisible to JavaScript so this endpoint is the sole source of truth for role-based UI.
- **Auth boundary**: `GET /api/analyses` and `GET /api/analyses/:id` are public. All mutating and streaming routes require a valid JWT with Admin role.

## Consequences
No external dependency, no email infrastructure, no OAuth app registration. Works entirely within the existing Fastify + PostgreSQL stack.

The 30-day JWT with no refresh is a deliberate simplification: this is a personal tool on a trusted machine. The trade-off is that a stolen cookie is valid for up to 30 days with no server-side revocation mechanism. Acceptable for the deployment context; revisit if the tool is ever exposed to the public internet.

Password reset is handled by an Admin directly from the `/admin/users` UI — no email flow needed.
