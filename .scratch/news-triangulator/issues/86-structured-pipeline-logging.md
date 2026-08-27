# 86 — Structured, namespaced, daily-rotated pipeline logging + OpenAI dashboard logs

**Type:** feature

**What to resolve:** User ask, verbatim: "would be really good to have logs in container for
everything. for example that we are getting sources from ...., next got x from ...y, then parsing,
parsed, sending for embedding etc... we have basically no logging just incomming request etc. and
if best different colors some namespaces etc and to store it by day to new files so we can
actually go through, then openAI api client does not have turned on logging so i cant access logs
in the platform.openai etc." Today `Fastify({ logger: true })` gives raw JSON pino output to
stdout with no persistence beyond Docker's own ephemeral log driver, `worker.ts` uses a bespoke
`console.log`-backed adapter (`consoleLogger.ts`), and almost nothing logs at the "happy path"
level — `rss.ts`/`ingestionService.ts`/`discovery.ts` only warn/error on failure, `llmClient.ts`
and `embeddingClient.ts` log nothing at all to the console (their only trace is the `LlmCallLog` DB
table, ADR 0020). There's no way to watch a run happen, and no persisted-by-day log files to go
back through.

**Research done before filing this ticket** (2026-08-27):

- **ADR 0020** already exists and explicitly rejected "enrich pino logs" in favor of a durable
  `LlmCallLog` DB table, reasoning that "Docker logs are ephemeral relative to this project's
  needs." This ticket doesn't reopen that call — `LlmCallLog` stays the source of truth for full
  prompt/response content (uncapped, queryable via Prisma Studio/Adminer). What's missing is a
  *different* need: real-time operational flow visibility ("what stage is a run at right now, what
  just happened") and a persisted-but-lightweight trail of that flow — which is what daily log
  files give you that an unindexed-by-time DB table doesn't. The two are complementary, not
  competing solutions to the same problem; log lines reference call metadata (callSite, model,
  duration) but never duplicate the full prompt/response text `LlmCallLog` already holds. Worth a
  short ADR of its own (see below) since it's extending a documented decision, not just adding a
  library.
- **`registerJobWorker`** (`jobs/registerWorker.ts`) is the single choke point every one of the 8
  registered job handlers already passes through — wrapping logging here (start/success/
  failure/duration) covers every job type without editing 8 separate job files. Job names
  (`JobName.EntityRelation = 'entity.extract'`, etc., `jobDefinitions.ts`) are already
  dot-namespaced strings, so they double directly as logger namespaces.
- **`ingestionService.ts`'s `runIngestionPassLocked`** already threads an optional
  `log?: FastifyBaseLogger` all the way down through `queryRssFeeds(log)` → `rss.ts`'s
  `fetchFeed(feed, log)`, and separately into `scrapeForCoverage`/`verifyCandidatesAgainstAnchor`.
  This means most of the pipeline already has a logger in scope at every point that matters — the
  gap is (a) that logger not being namespaced/colorized/file-backed at its root, and (b) almost no
  `.info()` calls actually exist at the happy-path milestones (fetched N items from feed X,
  generated embedding, matched vs. created new Story, run summary).
- **`llmClient.ts`/`embeddingClient.ts`** accept no logger at all today (`embeddingClient.ts` even
  falls back to bare `console.error` for its two cache-failure paths) — these need their own
  module-level namespaced logger rather than a threaded parameter, since they're both used from
  many call sites, mirroring how ADR 0020 already treats `llmClient.ts` as a cross-cutting concern.
- **`pino-roll`** (real npm package, latest `4.0.0`, confirmed via `npm view`) is a small,
  actively-maintained pino transport purpose-built for "write NDJSON, roll to a new file every
  day" — exactly `file.2026-08-27.1.log`-style output, `mkdir: true` support, no need to hand-roll
  date-boundary detection. **`pino-pretty`** (already implicitly needed for readable terminal
  output) supports a `messageFormat` function, which is enough to prefix a colorized `[namespace]`
  tag — full per-namespace coloring (not just per-level, which pino-pretty does natively) needs a
  small custom formatter (hash the namespace string to a fixed ANSI color, same approach the
  `debug` npm package uses, so the same namespace always gets the same color without a manually
  maintained namespace→color map).
- **OpenAI dashboard logs**: confirmed via the installed SDK's own `.d.ts`
  (`openai@^7.4.0`, `resources/chat/completions/completions.d.ts`) that `store?: boolean | null`
  is a real, typed parameter on `chat.completions.create` — "Whether or not to store the output of
  this chat completion request for use in [...] the dashboard." One-line addition to
  `llmClient.ts`'s single `callModel` call site turns this on. No SDK-level "enable logging"
  toggle exists beyond this per-call flag — there's no separate embeddings-endpoint equivalent
  (embeddings aren't visible in the dashboard's Logs page regardless), so `embeddingClient.ts` is
  out of scope for this specific part.
- **Docker**: no log volume exists today (`docker-compose.yml`'s only named volume is
  `postgres_data`); Docker's own log driver is not persisted to the host and is lost on container
  removal. `backend`/`worker`'s Dockerfile `WORKDIR` is `/app/packages/backend` — a bind mount at
  that path (host-side `./logs`, matching local dev's own `process.cwd()`-relative default when
  run outside Docker) works for both without needing a separate `LOG_DIR` env var per context,
  though one is still added as an override knob. `ingestion-cron` is a separate plain Node script
  (`scripts/ingestion-cron.mjs`, not part of the backend package, just curls
  `/api/ingestion/run`) — out of scope, its own `console.warn` status lines are enough for what it
  does; the real pipeline logging happens on the backend side it's calling.

**Blocked by:** none.

**Status:** done review

- [x] `packages/backend/src/logger.ts` — implemented differently than originally planned. An
      imperative `initRootLogger(service)` call turned out to be unreliable: ES module imports are
      always fully resolved (running every imported module's top-level code) before the importing
      module's own body runs, so `llmClient.ts`'s/`embeddingClient.ts`'s module-level
      `createLogger('llm')`/`createLogger('embedding')` calls would execute *before*
      `index.ts`'s own `initRootLogger('backend')` line, not after — a real ordering bug caught
      via `npm run typecheck`/manual reasoning before it ever shipped. Replaced with a lazily
      self-initializing root logger keyed off a `SERVICE_NAME` env var (set in
      `docker-compose.yml`/`package.json` scripts, available before any JS module body runs at
      all) — no imperative init call needed anywhere. `createLogger(namespace)` is safe to call at
      module load time.
- [x] A second real bug caught during implementation (not in the original plan):
      `pino.transport({ targets: [...] })` runs every target in a worker thread and
      structured-clones its options across that boundary — a live `messageFormat` function can't
      survive that (`DataCloneError`, reproduced by the real test suite, not hypothetical). Fixed
      by building the colorized `pino-pretty` stream synchronously in-process (no worker thread,
      function stays local) and only routing the file target through `pino.transport()` (pino-roll's
      options are plain serializable data, no functions) — combined via `pino.multistream()`.
- [x] `index.ts`: `Fastify({ loggerInstance: createLogger('http') })` replacing `logger: true` —
      needed explicit generic type args to keep the Logger type parameter as plain
      `FastifyBaseLogger` (Fastify's own default), since passing a `loggerInstance` without them
      makes TS infer the fuller `pino.Logger` type instead, which every route file's
      `FastifyInstance` param (using the plain default) then rejects.
- [x] `worker.ts`: `jobs/consoleLogger.ts` and its test deleted (superseded, not kept as a shim).
      Each of the 8 job registrations gets its own `createLogger(JobName.X)` instead of the one
      shared `workerLog`. `scripts/regenNarrativeForAnalysis.ts` (a 9th, one-off caller of
      `makeConsoleLogger()` the original research missed) updated the same way, its own run
      instructions doc comment now prefixing `SERVICE_NAME=scripts`.
- [x] `jobs/registerWorker.ts`: wraps the per-job `handler` call with start/success/failure/duration
      logging via `createLogger(name)` — covers all 8 job types with no changes to the individual
      job files.
- [x] Pipeline stage tracing added to `rss.ts`, `ingestionService.ts`, `discovery.ts`,
      `articleScraper.ts` exactly as planned, using `.child({ namespace })` on the already-threaded
      logger at each module's entry point.
- [x] `llmClient.ts`/`embeddingClient.ts`: module-level namespaced loggers; `embeddingClient.ts`'s
      two bare `console.error` calls replaced, plus cache-hit/cache-miss/generated tracing.
- [x] `llmClient.ts`: `store: true` added to the single `chat.completions.create` call.
- [x] `docker-compose.yml`: `./logs:/app/packages/backend/logs` bind-mounted on `backend` and
      `worker`, plus `SERVICE_NAME` set per service. `.gitignore` covers `logs/` and
      `packages/backend/logs/`.
- [x] New dependencies: `pino`, `pino-pretty`, `pino-roll` (`pino` added explicitly rather than
      relying on Fastify's transitive copy, since `logger.ts` imports it directly).
- [x] `docs/adr/0038-structured-namespaced-logging.md` — records this as additive to ADR 0020, and
      documents both real bugs found during implementation (see above).
- [x] Tests: `logger.test.ts` covers `colorForNamespace`'s pure hashing logic only (deterministic,
      in-palette, has spread across namespaces) — deliberately not exercising `createLogger` itself,
      which would spin up a real `pino.transport()` worker thread and real file I/O, too heavy for
      a unit test. `registerWorker.test.ts` extended with 2 new tests (start+finish logging,
      failure logging) plus a `../logger.js` mock so the existing 3 tests don't need to know about
      logging at all.
- [x] Manually verified against the real rebuilt Docker backend: triggered a real ingestion pass
      end to end (2461 checked, 712 created, 148 attached — a real one-time backlog catch-up from
      ticket 85's 41 new feeds being polled for the first time) and watched
      `[ingestion]`/`[rss]`/`[embedding]` namespaced, colorized lines the whole way through,
      including the final run-summary log. Confirmed `logs/backend.2026-08-27.1.log` and
      `logs/worker.2026-08-27.1.log` exist on the host as clean NDJSON (worker's file also showed
      real `[llm]`/job-namespaced lines from its own already-queued background jobs). One cosmetic,
      accepted quirk found live: a request-scoped logger that's `.child()`'d twice with the same
      binding key (`namespace: 'http'` from Fastify, then `namespace: 'ingestion'` from
      `runIngestionPassLocked`) produces a technically-duplicate `namespace` key in the raw NDJSON
      line — harmless (both `JSON.parse` and `pino-pretty`'s own parsing take the last value, which
      is the correct, most-specific one) and a known, documented pino child-logger behavior, not a
      bug introduced here. Did not independently verify the OpenAI dashboard's Logs page itself
      (no browser access from this environment) — `store: true` is confirmed to be a real, typed,
      accepted SDK parameter and the live call succeeded with it set; dashboard visibility follows
      from OpenAI's own documented behavior for that flag.
- [x] Typecheck + full unit test suite (709/709) + full integration suite (111/111) pass.
      `/code-review` pending.
