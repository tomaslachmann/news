# ADR 0038 — Structured, namespaced, daily-rotated pipeline logging

## Status
Accepted

## Context
ADR 0020 already made a call about LLM call observability: durable full-content records live in
the `LlmCallLog` table, not in Docker logs, because "Docker logs are ephemeral relative to this
project's needs." That's still true and unchanged by this ADR. But it left a different, real gap:
there was almost no way to watch an Ingestion run or a background job *happen* — `rss.ts`,
`ingestionService.ts`, and `discovery.ts` only logged on warning/error paths, `llmClient.ts` and
`embeddingClient.ts` logged nothing to the console at all, and every log line (`Fastify({ logger:
true })`, plus a bespoke `console.log`-backed adapter in the worker) went to stdout with no
namespace, no color, and no persistence beyond Docker's own log driver. A user watching `docker
compose logs -f` during a real run couldn't tell what stage it was at, and there was no file to go
back through afterward (ticket 86).

## Decision
`packages/backend/src/logger.ts` provides one lazily-initialized root `pino` logger per process
(keyed off a `SERVICE_NAME` environment variable — `backend`, `worker`, or `scripts` — set by
docker-compose/package.json scripts, not by an imperative init call; see the file's own comment
for why an explicit "call this first" function doesn't work reliably across ES module import
ordering) and a `createLogger(namespace)` helper that returns a namespaced child of it. Every
module that wants to trace its own flow — `rss.ts`, `ingestionService.ts`, `discovery.ts`,
`llmClient.ts`, `embeddingClient.ts`, every job type via `registerJobWorker`'s single choke point —
either accepts the already-threaded `FastifyBaseLogger` and calls `.child({ namespace })` on it, or
(for cross-cutting modules with many call sites, like `llmClient.ts`) creates its own module-level
namespaced logger directly.

Each root logger fans out to two destinations via `pino.multistream()`:
- **Colorized console** — `pino-pretty`, built synchronously in-process (not through
  `pino.transport()`'s worker-thread machinery, which structured-clones its options and can't
  carry a live `messageFormat` function across that boundary — this was hit and fixed during
  implementation, not a hypothetical). Namespace color is a deterministic hash of the namespace
  string into a small fixed ANSI palette (same approach the `debug` npm package uses), so a given
  namespace always renders the same color without a manually maintained map.
- **Daily-rotated NDJSON files** — `pino-roll`, writing to `${LOG_DIR}/<service>` and rolling to a
  new file every day (`<service>.<date>.<n>.log`). `LOG_DIR` defaults to `./logs` (gitignored),
  bind-mounted from the host in `docker-compose.yml` so the files persist across container
  restarts/rebuilds, unlike Docker's own log driver.

**This is additive to ADR 0020, not a reopening of it.** Log lines here trace *flow* — what stage a
run is at, right now, and a lightweight persisted trail of that — using call metadata (`callSite`,
`model`, `durationMs`, success/failure). They never duplicate the full prompt/response text
`LlmCallLog` already holds uncapped; that table stays the source of truth for "what exactly did the
model see and say."

Separately, `llmClient.ts`'s single `chat.completions.create` call now passes `store: true` —
OpenAI's own per-call flag that makes a completion retrievable on platform.openai.com's Logs page.
This doesn't change what's transmitted (the prompt/response already goes to OpenAI as part of the
request); it only affects how long OpenAI's own dashboard keeps it viewable.

## Consequences
- A developer running `docker compose logs -f backend worker` (or reading
  `./logs/backend.<date>.1.log` / `./logs/worker.<date>.1.log` afterward) can now see a real
  Ingestion pass unfold: which feeds were fetched and how many items each returned, which items
  matched an existing Story vs. created a new Draft, every LLM/embedding call's model and duration,
  and every job's start/finish/failure with duration — without touching `LlmCallLog` at all.
- `registerJobWorker` (`jobs/registerWorker.ts`) is the single instrumentation point for all 8 job
  types' start/finish/failure/duration tracing — adding a 9th job type gets this for free, no new
  logging code needed at the call site.
- No retention policy on the log files, same explicit trade-off ADR 0020 already made for
  `LlmCallLog`: unbounded growth is accepted for now, revisited only if real disk usage becomes a
  problem in practice, not preemptively.
- `jobs/consoleLogger.ts` (the worker's previous bespoke `console.log` adapter) is deleted, not
  kept as a fallback — every process that logs now goes through the same `logger.ts`.
- A namespaced child logger is created per call to a top-level pipeline function (e.g. once per
  `queryRssFeeds()` invocation) rather than cached at module scope where a request-scoped
  `FastifyBaseLogger` is involved — cheap (pino child creation has no meaningful overhead) and
  avoids the ES-module import-ordering hazard a module-level `.child()` call against a
  not-yet-initialized parent would hit.
