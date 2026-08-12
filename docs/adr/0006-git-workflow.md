# ADR 0006 — Git branching workflow and PR process

## Status
Accepted

## Context
Each ticket is implemented by an agent working in isolation. Changes need to be reviewable before landing on `main`. A consistent branching convention and PR process prevents agents from stepping on each other and makes the history readable.

## Decision
- **One branch per ticket**, named `ticket/NN-slug` (e.g. `ticket/10-authentication-authorization`), branched from `main`.
- All commits for a ticket land on that branch. The agent commits incrementally as it works, using descriptive commit messages.
- When the ticket is complete (all acceptance criteria checked off in the ticket file), the agent pushes the branch with `git push -u origin ticket/NN-slug` and outputs the GitHub compare URL so the developer can open the PR in one click.
- PRs target `main` directly — no `develop` or staging branch.
- Plain `git` is used throughout. The `gh` CLI is not required.

## Consequences
Every change is reviewable before it hits `main`. The branch name embeds the ticket number so history and open PRs are easy to navigate. The compare URL output means the developer always has a one-click path to opening the PR without remembering GitHub's URL structure.

The trade-off is that each ticket requires an active GitHub remote — agents cannot push without one. The remote must be configured before any ticket beyond 01 is started.
