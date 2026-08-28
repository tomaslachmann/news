# 92 — Compress and retain the daily pipeline log files

**Type:** chore

**What to resolve:** User report: leaving the worker running all day produces ~15 MB of log file,
and there's no compression or retention — `./logs/` grows unbounded. ADR 0038's Consequences
section explicitly deferred this: "No retention policy on the log files … unbounded growth is
accepted for now, revisited only if real disk usage becomes a problem in practice." It now is.

**Research done before filing** (2026-08-28, confirmed against the code + `pino-roll` v4):

- `logger.ts`'s file sink is `pino.transport({ target: 'pino-roll', options: { file, frequency:
  'daily', dateFormat: 'yyyy-MM-dd', mkdir: true } })` — runs in a worker thread (only serializable
  options can cross the boundary, hence the transport, per the file's own comment).
- **`pino-roll` v4.0.0 has no compression option.** Its options are `file` / `size` / `frequency` /
  `extension` / `symlink` / `limit.count` / `limit.removeOtherLogFiles` / `dateFormat` / `mkdir`.
  It can bound file *count* (retention) but cannot gzip.
- `pino-pretty` is already built in-process (not via a transport) in this same file, because a
  `messageFormat` function can't be structured-cloned into a worker — so an in-process file stream
  alongside it is consistent with what's already here.
- `logger.test.ts` only exercises `colorForNamespace` (pure) — the transport is deliberately
  untested ("too heavy for a fast unit test"). No test change forced by swapping the sink.
- Two docker services mount `./logs:/app/packages/backend/logs` (backend + worker).
- Log text gzips ~8–15×, so 15 MB/day → roughly 1–2 MB/day compressed.

**Blocked by:** none.

**Status:** todo

- [x] Replace the `pino-roll` file transport in `logger.ts` with an in-process
      `rotating-file-stream` (`rfs`) sink: daily rotation, `compress: 'gzip'` on rotated files,
      and a `maxFiles` retention window (start at ~14 days — a tunable constant, same convention
      as the pipeline's other thresholds). Optionally a `maxSize` hard cap per file as a safety
      net. Keep the colorized in-process `pino-pretty` console stream exactly as-is.
- [x] Filenames stay date-stamped and namespaced-by-service (`backend-YYYY-MM-DD.log` active,
      `…​.log.gz` once rotated) so `docker compose logs` and manual `zcat` both stay obvious.
- [x] `LOG_DIR` / `LOG_LEVEL` / `SERVICE_NAME` env handling unchanged. `mkdir` behaviour
      preserved (rfs `path` + it creates the dir).
- [x] Drop the `pino-roll` dependency; add `rotating-file-stream`.
- [x] ADR 0038: amend the "No retention policy" consequence — record that daily files are now
      gzip-rotated and pruned to `maxFiles`, the switch from a worker-thread transport to an
      in-process rfs stream, and why (`pino-roll` can't compress).
- [x] README's logging note (if any) + ADR 0038's example paths updated to the new filename shape.
- [x] Tests: `logger.test.ts` still green; a small check that `createLogger` builds without
      throwing and writes a line to a temp `LOG_DIR` (if that's cheap enough — otherwise skip, per
      the file's existing "transport is too heavy to test" stance, and note it).
- [x] Typecheck + full suites. `/code-review` clean.

## Implementation notes (2026-08-28)

- `rotating-file-stream@3`; dropped `pino-roll`. File sink is now a plain in-process `Writable` in
  `pino.multistream()`, not a `pino.transport()` worker thread.
- Config: daily `interval` + `intervalBoundary`, `compress: 'gzip'`, `maxFiles: LOG_RETENTION_DAYS`
  (env, default 14), `size: LOG_MAX_FILE_SIZE` (env, default 50M) as a within-day runaway cap, and
  a bare-filename `history` sidecar so pruning spans process restarts.
- Two rfs gotchas hit + fixed: `history` must be a bare filename (an absolute path gets `path`
  prepended and ENOENTs); a custom filename generator must append `.gz` itself when `compress` is
  on — rfs only does that for its built-in generator.
- Active file `<service>.log`; rotated `<service>-YYYY-MM-DD.log.gz` (`.N.` suffix only on a
  same-day size rotation). `zcat`-readable NDJSON.
- No file-IO unit test — `testSetup.ts` globally mocks `createLogger` for the whole suite (ticket
  86's own stance). The pure `logFileNameFor` generator is exported + unit-tested (catches both
  gotchas). Behaviour verified by hand against a temp `LOG_DIR`: dir auto-created, NDJSON written,
  rotation gzips + names correctly, `maxFiles` prunes across many rotations.
- ADR 0038's "No retention policy" consequence marked superseded; `.gitignore` comment updated. No
  new ADR — a scoped amendment to one Consequence, not a reversed decision.
