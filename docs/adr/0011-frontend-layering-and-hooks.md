# ADR 0011 — Frontend layering and the hook-wrapping policy

## Status
Accepted

## Context
No frontend architecture had been formalized either, and MVC doesn't map onto a component-based UI any more cleanly than it does onto a JSON API — React's own model is server state (owned by the TanStack Query cache) plus client state (Context, local `useState`), rendered by components. The structure already present — `pages/`, `components/ui/`, `components/`, `services/`, `context/` — is close to the right shape; it just hadn't been named as the deliberate architecture, and `HomePage.tsx` calls `useMutation({ mutationFn: createAnalysis, ... })` directly inline rather than through any consistent pattern.

## Decision
- The frontend architecture is: `pages/` (route-level, own their local UI state) + `components/ui/` (shadcn primitives) + `components/` (shared, cross-page) + `services/` (thin `fetch`/SSE wrappers, boundary-mocked per ADR 0007) + `context/` (global client state) + TanStack Query (server-state cache). No MVC labels.
- Every TanStack Query call is wrapped in a dedicated hook, colocated with the service file it wraps (e.g. `services/analyses/hooks.ts` next to `services/analyses/index.ts`) — regardless of how many places currently use it.
- Current technical-layer folders stay as-is. No migration to feature-based folders (`features/analysis/`, `features/auth/`) unless a single feature's files start spilling across more than 4–5 unrelated directories.
- TanStack Query (server state) + Context (client state, currently just `AuthContext`) is the complete state-management story. No additional store library (Redux, Zustand, Jotai) — a new piece of global state gets its own Context, not a general-purpose store.
- `HomePage.tsx`'s existing inline `useMutation` calls are left as-is. Unlike the backend's Prisma-import ban, there's no lint rule that can mechanically detect an un-wrapped query, so there's no forcing function requiring a retrofit — the hook-wrapping rule applies to new and changed code going forward (starting with ticket 08, see its updated acceptance criteria).

## Consequences
New pages get a small, consistent shape: a hook per server interaction, a page that composes them. The always-wrap rule (rather than a reuse threshold) trades a small amount of single-use boilerplate for not having to make a judgment call on every new query about whether "this will probably be reused" — consistent with this project's general preference (ADR 0009) for mechanical rules over agent judgment where one is available.

Because there's no lint gate forcing consistency here the way there is on the backend, this ADR is the only thing keeping the policy alive — an implementing agent that hasn't read it could easily reintroduce inline `useMutation` calls, and the code-review skill's Standards axis is the sole backstop if that happens.
