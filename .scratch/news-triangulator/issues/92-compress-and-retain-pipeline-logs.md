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

- [ ] Replace the `pino-roll` file transport in `logger.ts` with an in-process
      `rotating-file-stream` (`rfs`) sink: daily rotation, `compress: 'gzip'` on rotated files,
      and a `maxFiles` retention window (start at ~14 days — a tunable constant, same convention
      as the pipeline's other thresholds). Optionally a `maxSize` hard cap per file as a safety
      net. Keep the colorized in-process `pino-pretty` console stream exactly as-is.
- [ ] Filenames stay date-stamped and namespaced-by-service (`backend-YYYY-MM-DD.log` active,
      `…​.log.gz` once rotated) so `docker compose logs` and manual `zcat` both stay obvious.
- [ ] `LOG_DIR` / `LOG_LEVEL` / `SERVICE_NAME` env handling unchanged. `mkdir` behaviour
      preserved (rfs `path` + it creates the dir).
- [ ] Drop the `pino-roll` dependency; add `rotating-file-stream`.
- [ ] ADR 0038: amend the "No retention policy" consequence — record that daily files are now
      gzip-rotated and pruned to `maxFiles`, the switch from a worker-thread transport to an
      in-process rfs stream, and why (`pino-roll` can't compress).
- [ ] README's logging note (if any) + ADR 0038's example paths updated to the new filename shape.
- [ ] Tests: `logger.test.ts` still green; a small check that `createLogger` builds without
      throwing and writes a line to a temp `LOG_DIR` (if that's cheap enough — otherwise skip, per
      the file's existing "transport is too heavy to test" stance, and note it).
- [ ] Typecheck + full suites. `/code-review` clean.
