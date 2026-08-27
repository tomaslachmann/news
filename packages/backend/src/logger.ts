import path from 'node:path'
import pino from 'pino'
import pinoPretty from 'pino-pretty'

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

// A small fixed ANSI color palette, picked from a hash of the namespace string -- same approach
// the `debug` npm package uses, so a given namespace (e.g. "rss", "entity.extract") gets the same
// color every run without a manually maintained namespace -> color map that goes stale the moment
// a new namespace is added.
const NAMESPACE_COLORS = [36, 33, 35, 32, 34, 96, 93, 95, 92, 94]

/** Exported for `logger.test.ts` -- the pure hashing logic is what's worth unit-testing here; the
 *  real `createLogger` spins up a `pino.transport()` worker thread and real file I/O (`pino-roll`),
 *  too heavy for a fast unit test and not what actually needs coverage. */
export function colorForNamespace(namespace: string): number {
  let hash = 0
  for (let i = 0; i < namespace.length; i++) hash = (hash * 31 + namespace.charCodeAt(i)) >>> 0
  return NAMESPACE_COLORS[hash % NAMESPACE_COLORS.length]
}

// `pino.transport({ targets: [...] })` runs every target in a worker thread, which means every
// option -- including `messageFormat` -- gets structured-cloned across the thread boundary. A
// live function can't survive that (DataCloneError), so the colorized pretty stream is built
// directly, in-process, instead (`pinoPretty()` is synchronous and returns a plain writable
// stream); only the file target -- pino-roll's options are plain serializable data, no functions
// -- goes through `pino.transport()`. `pino.multistream()` fans one logger out to both.
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

function buildFileTransport(service: string) {
  return pino.transport({
    target: 'pino-roll',
    options: {
      file: path.join(LOG_DIR, service),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      mkdir: true,
    },
  })
}

let rootLogger: pino.Logger | undefined

function getRootLogger(): pino.Logger {
  if (!rootLogger) {
    const streams = [
      { stream: buildPrettyStream(SERVICE_NAME), level: LOG_LEVEL },
      { stream: buildFileTransport(SERVICE_NAME), level: LOG_LEVEL },
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
