# Git Workflow for Implementing Agents

Every ticket is implemented on its own branch. Follow these steps exactly.

## Starting a ticket

Run:

```
mise run ticket-start NN
```

This checks that every ticket listed in the target ticket's `Blocked by:` field is `Status: done`
— refusing to proceed if not — then checks out `main`, pulls, verifies the working tree is clean,
and creates and checks out `ticket/NN-slug`. `NN` is the ticket number; the slug is read from
`.scratch/news-triangulator/issues/NN-slug.md`, so you don't need to type it.

If it refuses because a blocker isn't done, resolve that first — don't start the ticket anyway.

## During implementation

Commit early and often. Each commit should be atomic and have a descriptive message. There is no
strict format requirement, but the message should explain _what_ changed and _why_ if non-obvious.

Check off each acceptance criterion in the ticket file
(`.scratch/news-triangulator/issues/NN-slug.md`) as you complete it — change `- [ ]` to `- [x]`.

## Before finishing: review the diff

Run the local `code-review` skill against `git diff main`, using the ticket file as the Spec
source. It reports two axes — Standards (does the diff follow this repo's conventions?) and Spec
(does it match the ticket's acceptance criteria, and did anything get added that the ticket didn't
ask for?). Its Speculative-Generality check is specifically there to catch hooks, components, or
abstractions the ticket didn't call for — see ADR 0009. Address what it finds before moving on.

If a review round turns up findings, fix them, verify (tests + typecheck), and **commit that round
before running review again**. Without a commit to anchor to, `code-review` diffs the whole
working tree against `main`, so re-running it re-reviews everything from scratch each time —
wasteful, and it mixes already-reviewed code back into every later pass. Committing after each
round scopes the next review to just what changed since. Only re-review the full branch diff when
that's explicitly what's needed (e.g. one final pre-merge pass).

The `code-review` skill already auto-scopes this: it diffs against the full branch (vs. `main`) the
first time it's run on a branch, and against the last commit it reviewed on every run after that —
you don't need to pass an explicit diff target (`git diff main`, a specific SHA) in the invocation
yourself except when deliberately forcing a full-branch pass (e.g. the final pre-merge check).

## Finishing a ticket

Once every acceptance criterion is checked off and the review above is clean, run:

```
mise run ticket-done NN
```

This fails loudly if any `- [ ]` remains in the ticket file. Otherwise it flips
`**Status:** ready-for-agent` to `**Status:** done`, commits the ticket file, pushes the branch,
and prints the GitHub compare URL for the developer to open the PR.

## What NOT to do

- Do not merge into `main` yourself.
- Do not push directly to `main`.
- Do not delete the branch — leave it for the developer to merge via the PR.
- Do not run `ticket-start` for a ticket whose blockers aren't done — it will refuse, but don't try
  to work around that.
