import path from 'node:path'
import pino from 'pino'
import pinoPretty from 'pino-pretty'
import { createStream, type Generator as RfsGenerator } from 'rotating-file-stream'

// See docs/adr/0038-structured-namespaced-logging.md. This complements, not replaces, ADR 0020's
// LlmCallLog table — log lines here trace pipeline flow (what stage a run is at, right now, and
// a persisted-by-day trail of that), never the full prompt/response content LlmCallLog already
// holds uncapped.
//
// The root logger self-initializes lazily on the first `createLogger` call, reading `SERVICE_NAME`
// from the environment rather than requiring an explicit "call this first" init step. An explicit
// init call would be fragile here: several modules (llmClient.ts, embeddingClient.ts) create their
// own module-level `createLogger(...)` logger, and ES module imports are always fully resolved
// (running every imported module's top-level code) before the importing module's own body runs —
// so an index.ts-body call to an imperative `initRootLogger` would execute *after* those
// transitively-imported modules already tried to create their loggers, not before. `SERVICE_NAME`
// is set in the process environment (docker-compose.yml, package.json scripts) instead, which is
// available before any JS module body runs at all.
const LOG_DIR = process.env.LOG_DIR ?? path.join(process.cwd(), 'logs')
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'
const SERVICE_NAME = process.env.SERVICE_NAME ?? 'app'

// Rotated daily, gzipped, and pruned to a window — ADR 0038 deferred a retention policy until
// "real disk usage becomes a problem"; a worker left running all day writes ~15 MB of plain
// NDJSON, so it is one now. Both tunable via env.
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS) || 14
// A within-day safety cap for a runaway loop — a normal day is far under this; it just stops one
// bad day from filling the disk before the daily boundary rotates it.
const LOG_MAX_FILE_SIZE = process.env.LOG_MAX_FILE_SIZE ?? '50M'

// A small fixed ANSI color palette, picked from a hash of the namespace string -- same approach
// the `debug` npm package uses, so a given namespace (e.g. "rss", "entity.extract") gets the same
// color every run without a manually maintained namespace -> color map that goes stale the moment
// a new namespace is added.
const NAMESPACE_COLORS = [36, 33, 35, 32, 34, 96, 93, 95, 92, 94]

/** Exported for `logger.test.ts` -- the pure hashing logic is what's worth unit-testing here; the
 *  real `createLogger` writes to files and is globally mocked in the unit suite (`testSetup.ts`),
 *  not what needs coverage. */
export function colorForNamespace(namespace: string): number {
  let hash = 0
  for (let i = 0; i < namespace.length; i++) hash = (hash * 31 + namespace.charCodeAt(i)) >>> 0
  return NAMESPACE_COLORS[hash % NAMESPACE_COLORS.length]
}

// Both sinks are plain in-process writable streams fanned out by `pino.multistream()`, no
// `pino.transport()` worker thread. The colorized pretty stream has to be in-process anyway --
// its `messageFormat` is a live function, and `pino.transport()` structured-clones its options
// across the thread boundary (DataCloneError on a function). `rotating-file-stream` (the file
// sink, `buildFileStream` below) is a Writable and works directly here too -- it doesn't need a
// transport the way `pino-roll` did, and unlike `pino-roll` it can gzip.
function buildPrettyStream(service: string) {
  return pinoPretty({
    colorize: true,
    translateTime: 'SYS:HH:MM:ss',
    ignore: 'pid,hostname,namespace,service',
    messageFormat: (log: Record<string, unknown>, messageKey: string): string => {
      const namespace = typeof log.namespace === 'string' ? log.namespace : service
      const color = colorForNamespace(namespace)
      const message = log[messageKey]
      return `\x1b[${color}m[${namespace}]\x1b[0m ${typeof message === 'string' ? message : ''}`
    },
  })
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** rfs filename generator: `<service>.log` for the file being written, `<service>-YYYY-MM-DD.log.gz`
 *  once rotated (the content is gzipped, so the name must carry `.gz` — rfs's own built-in
 *  generator does the same). `intervalBoundary` makes `time` the start of the day the lines
 *  belong to, so the date in the name is that day, not the rotation moment (00:00 of the next).
 *  `index` disambiguates a same-day mid-day rotation (the `size` safety cap). rfs passes `null`
 *  for the active file despite the declared `number | Date` type. Exported for `logger.test.ts`. */
export function logFileNameFor(service: string): RfsGenerator {
  return (time, index) => {
    if (!time) return `${service}.log`
    const d = time instanceof Date ? time : new Date(time)
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    const seq = index && index > 1 ? `.${index}` : ''
    return `${service}-${date}${seq}.log.gz`
  }
}

// A plain in-process writable stream, like `buildPrettyStream` above — not a `pino.transport()`
// worker thread. `pino-roll` needed the transport (only serializable options cross the boundary)
// but also can't compress; `rotating-file-stream` does daily rotation + gzip + `maxFiles`
// pruning natively and works fine as a direct `pino.multistream` target.
function buildFileStream(service: string) {
  return createStream(logFileNameFor(service), {
    path: LOG_DIR,
    interval: '1d',
    intervalBoundary: true,
    compress: 'gzip',
    maxFiles: LOG_RETENTION_DAYS,
    size: LOG_MAX_FILE_SIZE,
    // Persist the rotated-file list so `maxFiles` prunes the whole history across restarts (the
    // worker restarts on every deploy), not just files this process run produced. A bare
    // filename — rfs resolves it under `path` (an absolute value gets `path` prepended and breaks).
    history: `.${service}-history`,
  })
}

let rootLogger: pino.Logger | undefined

function getRootLogger(): pino.Logger {
  if (!rootLogger) {
    const streams = [
      { stream: buildPrettyStream(SERVICE_NAME), level: LOG_LEVEL },
      { stream: buildFileStream(SERVICE_NAME), level: LOG_LEVEL },
    ]
    rootLogger = pino({ level: LOG_LEVEL, base: { service: SERVICE_NAME } }, pino.multistream(streams))
  }
  return rootLogger
}

/** A namespaced child of this process's root logger — e.g. `createLogger('rss')`,
 *  `createLogger(JobName.EntityRelation)`. Every line it emits carries `namespace`, which
 *  `pino-pretty`'s messageFormat above uses to pick a stable color. Safe to call at module load
 *  time (top-level `const log = createLogger(...)`) — the root logger builds itself on first use. */
export function createLogger(namespace: string): pino.Logger {
  return getRootLogger().child({ namespace })
}
