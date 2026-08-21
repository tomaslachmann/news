# 53 — Trim the public Chrome's nav for a logged-in Admin

**What to build:** `Chrome`'s `PrimaryNav` (`packages/frontend/src/components/Chrome.tsx:21-44`),
the public reader-facing nav, currently exposes the *entire* Admin surface directly when
`isAdmin`: "Nová analýza", "Uživatelé", "Sběr článků" all appear as top-level links alongside the
public rubrics. `AdminChrome` already exists as the dedicated Admin nav (`/admin/ingestion`,
`/admin/entities`, `/admin/entity-aliases`, `/admin/users`) — the public nav shouldn't duplicate it
item-by-item. Collapse those into a single "Admin" (or similar) entry point instead.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] `PrimaryNav` shows one link/entry for an Admin instead of three — e.g. a single "Admin" link
      into the Admin area (a sensible landing route under `AdminLayout`, such as
      `/admin/ingestion`), not "Nová analýza"/"Uživatelé"/"Sběr článků" individually.
- [ ] Decide (and note the decision) what that one entry actually is: a plain link to one Admin
      route, or a small dropdown/menu listing the Admin routes — either is fine, but don't just
      re-list all of `AdminChrome`'s links inline under a new label, which would defeat the point.
- [ ] `/new-analysis` stays reachable for an Admin somehow (it's not one of `AdminChrome`'s own nav
      links today either — check whether it needs its own entry point or is reachable from within
      the Admin area once there).
- [ ] Compact/sticky nav (`PrimaryNav compact`) gets the same trim — no separate divergent behavior
      there.
- [ ] Non-Admin users see no change at all.

## Notes

Comment as given: "public navbar when logged in as admin should not have everything from admin
navbar but only admin or something like that" — the exact shape of the single entry point (plain
link vs. small menu) is left to judgment; keep it simple and consistent with this repo's existing
`ds/components.css` nav patterns.
