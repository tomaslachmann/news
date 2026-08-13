# News Triangulator

The goal of this project is to make it possible to understand what actually happened in a news story, given that any single source presents a version shaped by its own framing, omissions and incentives.

Instead of reading one article and trusting it, or reading five and being left with five contradictions, the tool should gather coverage of the same event across multiple independent sources and surface four things: what all of them agree on, where they factually contradict each other, what one source reports that the others leave out entirely, and where the difference is not in the facts at all but in the framing — word choice, emphasis, what gets the headline and what gets buried in paragraph eleven.

The output should let a reader separate three layers that news writing routinely blends together: verifiable claims, attributed claims (someone said X), and interpretation. Every claim stays traceable back to the source that made it, including original wording where the exact phrasing carries the meaning.

The tool is not meant to declare a winner, assign a truth score, or replace the reader's judgement. It is meant to make the shape of the disagreement visible, so the reader can judge it themselves.

---

## Documentation

- **[CONTEXT.md](./CONTEXT.md)** — domain glossary. Consult it for canonical terms; add or update an entry the moment new domain vocabulary is settled, so it never drifts from what the code actually calls things.
- **[docs/adr/](./docs/adr/)** — architecture decision records, numbered sequentially. Check here before revisiting a decision that may already be settled. Write a new ADR when you make a call that is hard to reverse, would surprise a future reader without context, and involved a real trade-off — not for routine or easily-reversed choices.
- **[docs/spec.md](./docs/spec.md)** — full v1 feature specification.
- **[docs/spec-scaffold.md](./docs/spec-scaffold.md)** — specification for the initial project/tooling scaffold (ticket 01).
- **[docs/git-workflow.md](./docs/git-workflow.md)** — the branch-per-ticket workflow: starting a ticket, committing, review, and finishing.
- **[.scratch/news-triangulator/issues/](./.scratch/news-triangulator/issues/)** — implementation tickets. See docs/git-workflow.md for the process of starting and finishing one.
