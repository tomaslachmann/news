# 11 — Admin User Management UI

**What to build:** An `/admin/users` page accessible only to Admins. It lists all Users, allows creating new ones (email + password + role), changing an existing user's role, resetting a user's password directly (no email flow), and deleting users. An Admin cannot delete or demote themselves.

**Blocked by:** 10 — Authentication & Authorization.

**Status:** done

- [x] `GET /api/admin/users` (Admin only) returns all Users as `{ id, email, role, createdAt }[]`
- [x] `POST /api/admin/users` (Admin only) accepts `{ email, password, role }`, bcrypt-hashes the password, and creates a new User row; returns 409 if email already exists
- [x] `PATCH /api/admin/users/:id` (Admin only) accepts `{ role }` and/or `{ password }` and updates the User; if `password` is provided it is bcrypt-hashed before storing
- [x] `DELETE /api/admin/users/:id` (Admin only) deletes the User; returns 400 if the requesting Admin tries to delete themselves
- [x] `PATCH /api/admin/users/:id` returns 400 if the requesting Admin tries to change their own role
- [x] `/admin/users` page is wrapped in `ProtectedRoute` requiring Admin role
- [x] The page lists all Users in a table: email, role badge, created date, action buttons (Edit, Reset password, Delete) — Edit and Reset password are combined into a single "Edit" dialog per the "Edit" bullet below; see chat for the ambiguity this resolves
- [x] "Create user" opens a shadcn/ui dialog with email, password, and role fields; submitting calls `POST /api/admin/users`
- [x] "Edit" opens a dialog pre-filled with the user's current role; allows changing role and optionally setting a new password
- [x] "Delete" shows a confirmation dialog before calling `DELETE /api/admin/users/:id`
- [x] The current Admin's own row has the Edit (role) and Delete buttons disabled with a tooltip explaining why
- [x] All API routes under `/api/admin/*` are guarded by the `requireAdmin` middleware from ticket 10
- [x] A link to `/admin/users` appears in the nav bar only when the authenticated user has role `ADMIN`
