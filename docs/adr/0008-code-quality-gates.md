# ADR 0008 — Code quality gates: lint/format enforcement and qualitative coverage review

## Status
Accepted

## Context
No ESLint or Prettier configuration exists anywhere in the repo. `mise.toml`'s `lint` task runs `npm run lint --workspaces --if-present`, which silently no-ops because no package defines a `lint` script. There is also no CI and no git hooks, so nothing currently enforces the coding-quality expectations already stated in `CLAUDE.md`.

## Decision
- ESLint (`typescript-eslint`'s type-checked preset, plus `eslint-plugin-react-hooks` for the frontend package) and Prettier (configured to match the existing code style — no semicolons, single quotes) are added, with shared config at the repo root.
- Enforcement happens in two places, not one: a husky + lint-staged pre-commit hook (fast, staged-files-only — `eslint --fix` and `prettier`), and GitHub Actions CI, which runs typecheck + lint + unit tests on every push to a `ticket/*` branch, plus the testcontainers integration suite on pull requests targeting `main`.
- No numeric coverage threshold is enforced. Whether a ticket's diff was meaningfully tested is judged qualitatively, per ticket, by the local `code-review` skill's Spec axis (see ADR 0009) — which checks the diff against that ticket's acceptance criteria — rather than by a coverage percentage gate.

## Consequences
The pre-commit hook can in principle be bypassed (`--no-verify`); CI is the actual gate a PR cannot get past without a human deliberately overriding it, which is why both exist rather than just one. Skipping a numeric coverage threshold trades a hard, gameable number (tests that pad coverage without testing anything meaningful) for a judgment call that depends on the review step in ADR 0009 actually running — if that step is ever skipped, nothing else in this ADR would have caught it.
