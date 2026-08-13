# ADR 0009 — Ticket lifecycle automation and self-gated review

## Status
Accepted

## Context
ADR 0006 established the branch-per-ticket workflow, documented as manual steps in `docs/git-workflow.md`. In practice, implementation agents have skipped creating the ticket branch and forgotten to update the ticket file's checkboxes and status. Separately, agents have introduced hooks, components, and abstractions not called for by a ticket's own acceptance criteria, with nothing checking for that before the ticket is marked done.

## Decision
- `mise run ticket-start NN` creates the `ticket/NN-slug` branch and refuses to proceed if any ticket listed in that ticket's `Blocked by:` field is not `Status: done`.
- `mise run ticket-done NN` verifies no `- [ ]` remains in the ticket file, flips `Status` to `done`, commits the ticket file, pushes the branch, and prints the compare URL — replacing the five-step manual finish sequence in `docs/git-workflow.md` with one command.
- Before running `ticket-done`, the implementing agent runs the existing local `code-review` skill (Standards + Spec axes) against `git diff main`, using the ticket file as the Spec source. Its Speculative-Generality smell — "abstraction, parameters, or hooks added for needs the spec doesn't have" — is the mechanism that catches unrequested abstractions.

## Consequences
The review is self-triggered by the same agent that wrote the diff, which is weaker than an independent reviewer. It's not pure self-grading, though — the skill's Standards/Spec sub-agents run with fresh context and no memory of why the implementing agent made its choices. This does not replace human PR review; it catches problems earlier, before the ticket is even marked done, not instead of review at merge time. `docs/git-workflow.md` needs updating to reference these commands in place of the manual steps it currently documents.
