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

**Status:** todo

- [ ] New file `services... ` — actually `packages/backend/src/logger.ts`: `initRootLogger(service:
      string): pino.Logger` (multi-target: `pino-pretty` to stdout with a namespace-hashed-color
      `messageFormat`, plus `pino-roll` writing NDJSON to `${LOG_DIR ?? './logs'}/<service>`,
      `frequency: 'daily'`, `mkdir: true`) and `createLogger(namespace: string): pino.Logger`
      (child of the root, throws a clear error if called before `initRootLogger`). `LOG_LEVEL` env
      var (default `info`) controls both targets.
- [ ] `index.ts`: call `initRootLogger('backend')`; `Fastify({ loggerInstance: rootLogger })`
      replacing `logger: true` — existing per-request logging (`request.log`) keeps working
      unchanged, now flowing through the same colorized/file-backed pipeline.
- [ ] `worker.ts`: call `initRootLogger('worker')`; delete `jobs/consoleLogger.ts` and its test
      (superseded, not kept as a shim). Each of the 8 job registrations gets its own
      `createLogger(JobName.X)` instead of the one shared `workerLog` — e.g.
      `runEntityRelationJob(payload, {...}, createLogger(JobName.EntityRelation))`.
- [ ] `jobs/registerWorker.ts`: wrap the per-job `handler` call with start/success/failure/duration
      logging using `createLogger(name)` (the job name is already namespace-shaped) — this alone
      gives every one of the 8 jobs "started / finished in Nms / failed after Nms" tracing with no
      changes to the individual job files.
- [ ] Pipeline stage tracing (info-level, using the logger already threaded through each call —
      only new `.info()` calls, no signature changes):
  - `rss.ts`: `fetchFeed` — log before each feed fetch (source name, url) and the result (item
    count on success; the existing `warn` already covers failure).
  - `ingestionService.ts`: run start (item count target unknown until after `queryRssFeeds`, so log
    right after: "fetched N candidates from M feeds"), and a run-summary log at the end (the
    existing `summary` object's counts — checked/created/attached/flagged/skipped).
  - `discovery.ts`: GDELT query start/result count, alongside its existing `warn` fallback.
  - `articleScraper.ts`/`scrapeForCoverage`: scrape attempt/result per URL.
- [ ] `llmClient.ts`: module-level `const log = createLogger('llm')`; log before each call
      (`callSite`, `model`) and after (success + rough duration, or failure) — no prompt/response
      content (stays exclusively in `LlmCallLog`, per ADR 0020/this ticket's own ADR).
- [ ] `embeddingClient.ts`: module-level `const log = createLogger('embedding')`; replace the two
      bare `console.error` cache-failure calls with it, and add a cache-hit/cache-miss-then-API-call
      trace line.
- [ ] `llmClient.ts`: add `store: true` to the single `openai.chat.completions.create` call in
      `callModel` — makes every chat completion visible on platform.openai.com's Logs page.
- [ ] `docker-compose.yml`: bind-mount `./logs:/app/packages/backend/logs` on `backend` and
      `worker` (not `ingestion-cron`, out of scope per research above); `.gitignore` gets
      `packages/backend/logs/`.
- [ ] New dependencies (`packages/backend/package.json`): `pino-pretty`, `pino-roll`.
- [ ] New ADR (`docs/adr/0038-...`): records that this extends, not reverses, ADR 0020 — pino/file
      logging is for real-time flow visibility, `LlmCallLog` stays the durable full-content record;
      log lines never duplicate prompt/response text.
- [ ] Tests: `logger.ts` (namespace→color determinism, root-not-initialized error),
      `registerWorker.ts` (start/success/failure logging wraps the handler without changing its
      existing per-job-independent-settlement behavior — extend the existing test file, don't
      replace its coverage).
- [ ] Manually verify against the real Docker backend (rebuild, not restart): trigger a real
      ingestion pass, confirm colorized namespaced lines appear in `docker compose logs -f backend
      worker`, confirm `./logs/backend.<today>.1.log` and `./logs/worker.<today>.1.log` exist and
      contain the same lines as clean NDJSON, and confirm a real chat completion shows up under
      platform.openai.com's Logs page.
- [ ] Typecheck + full test suites pass. `/code-review` clean.
