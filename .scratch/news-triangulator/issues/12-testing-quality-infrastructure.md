# 12 — Testing & Quality Infrastructure

**What to build:** Vitest and testcontainers-based testing infrastructure, ESLint/Prettier enforcement, and ticket-lifecycle automation scripts, per ADR 0007, ADR 0008, and ADR 0009. This ticket has no product-facing behavior — it establishes the tooling every ticket from 08 onward depends on for its testing and workflow acceptance criteria.

**Blocked by:** 07 — Synthesis Pass.

**Status:** ready-for-agent

- [ ] Vitest is configured for `packages/backend` and `packages/frontend`; `npm test` at the root runs both packages' unit suites
- [ ] `packages/backend` depends on `testcontainers`; a shared integration-test harness spins up a Postgres container, runs `prisma migrate deploy` against it, and tears it down after the suite
- [ ] Integration tests live under `packages/backend/test/integration/**`; unit tests are colocated as `*.test.ts` next to their source files
- [ ] `mise run test` runs unit tests only (no Docker required); `mise run test:integration` runs the testcontainers integration suite
- [ ] `gdelt.ts`'s and `articleScraper.ts`'s `fetch()` calls are each wrapped in a thin client module (mirroring `llmClient.ts`), with unit tests mocking those modules instead of the network
- [ ] `llmClient.ts`'s `callJsonModel` has unit tests with the OpenAI client mocked
- [ ] At least one integration test exists exercising a Prisma-backed code path against the real (containerized) Postgres instance
- [ ] A root ESLint config (`typescript-eslint` type-checked preset + `eslint-plugin-react-hooks` for the frontend package) and a root Prettier config (no semicolons, single quotes, matching existing code) are added; `mise run lint` actually lints all three packages instead of no-op-ing
- [ ] Husky + lint-staged run `eslint --fix` and `prettier` on staged files as a pre-commit hook
- [ ] A GitHub Actions workflow runs typecheck + lint + unit tests on every push to a `ticket/*` branch, and additionally runs the integration suite on pull requests targeting `main`
- [ ] `mise run ticket-start NN` creates and checks out `ticket/NN-slug`, reading the slug from `.scratch/news-triangulator/issues/NN-slug.md`, and exits with an error if any ticket listed in that file's `Blocked by:` field is not `Status: done`
- [ ] `mise run ticket-done NN` fails if any `- [ ]` remains in the ticket file; otherwise it flips `Status` to `done`, commits the ticket file, pushes the branch, and prints the GitHub compare URL
- [ ] `docs/git-workflow.md` is updated to reference `ticket-start`/`ticket-done` in place of the manual steps, and documents running the local `code-review` skill (Standards + Spec axes, ticket file as the Spec source) before `ticket-done`
- [ ] Ticket 08's `Blocked by:` field is updated to also list this ticket
