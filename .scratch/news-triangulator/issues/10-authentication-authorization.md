# 10 — Authentication & Authorization

**What to build:** The full auth layer: User model in PostgreSQL, login/logout API routes, JWT middleware, `GET /api/me`, env-var seeding of the first Admin on startup, a `/login` page in React, and an auth context that makes the current user's role available to every component. After this ticket, all subsequent tickets that touch protected routes can add the auth guard without any further infrastructure work.

**Blocked by:** 01 — Project Scaffold.

**Status:** done

- [x] Prisma schema gains a `User` model: `id`, `email` (unique), `passwordHash`, `role` (enum: `ADMIN` | `READONLY`), `createdAt`
- [x] On backend startup, if no `User` rows exist and `ADMIN_EMAIL` + `ADMIN_PASSWORD` are set in env, a single Admin User is created with a bcrypt-hashed password
- [x] `POST /api/auth/login` accepts `{ email, password }`, verifies credentials against the database using bcrypt, and on success sets a 30-day httpOnly cookie containing a signed JWT (`{ userId, role }`, signed with `JWT_SECRET`)
- [x] `POST /api/auth/logout` clears the httpOnly cookie and returns 200
- [x] `GET /api/me` reads the JWT from the cookie, verifies it, and returns `{ id, email, role }` — or 401 if the cookie is absent or invalid
- [x] A Fastify middleware (`requireAdmin`) validates the JWT cookie and checks `role === "ADMIN"`; returns 401 if unauthenticated, 403 if authenticated but not Admin
- [x] `JWT_SECRET` is read from env; the backend refuses to start if it is absent
- [x] `.env.example` is updated with `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- [x] React app calls `GET /api/me` on mount and stores the result in a context (`AuthContext`) available to all components; unauthenticated state is represented as `null`
- [x] A `ProtectedRoute` component wraps any route that requires Admin role; it redirects to `/login` (preserving the intended destination in a query param) if the user is not an Admin
- [x] `/login` page: email + password form using shadcn/ui components; calls `POST /api/auth/login`; on success navigates to the preserved destination or `/`; shows error message on invalid credentials
- [x] After successful login, `GET /api/me` is re-called so `AuthContext` reflects the new session without a full page reload
- [x] The seed URL input form and all other Admin-only UI controls are hidden (not just disabled) when `AuthContext` role is not `ADMIN`
- [x] A nav bar link to `/login` (when unauthenticated) and a logout button (when authenticated) is visible on all pages
