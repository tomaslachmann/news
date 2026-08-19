import type { FastifyBaseLogger } from 'fastify'

/** No Fastify app runs in the worker process, so there's no request-scoped logger to reuse — a
 *  thin console-backed adapter implementing every FastifyBaseLogger level (not just the ones the
 *  job pipeline happens to call today) gives job failures an application-log trail alongside
 *  pg-boss's own archive row, without adding a direct pino dependency the worker would otherwise
 *  need only for this. Implementing only today's used levels would silently break the moment a
 *  call site logs at a level this adapter doesn't have — `log?.info(...)` only short-circuits
 *  when `log` itself is nullish, not when a method on it is missing. */
export function makeConsoleLogger(): FastifyBaseLogger {
  const log =
    (method: 'log' | 'warn' | 'error' | 'debug') =>
    (obj: unknown, msg?: string): void =>
      console[method](msg ?? '', obj)
  const logger: FastifyBaseLogger = {
    level: 'info',
    fatal: log('error'),
    error: log('error'),
    warn: log('warn'),
    info: log('log'),
    debug: log('debug'),
    trace: log('debug'),
    silent: () => {},
    child: () => logger,
  }
  return logger
}
