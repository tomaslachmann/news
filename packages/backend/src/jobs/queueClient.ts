import { PgBoss } from 'pg-boss'
import { JobName, JOB_RETRY_POLICY } from './jobDefinitions.js'

let boss: PgBoss | null = null
let starting: Promise<PgBoss> | null = null
let stopping: Promise<void> | null = null

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is required to start the job queue')
  return url
}

// Lazily starts a single shared pg-boss instance and declares every known queue (idempotent —
// pg-boss's own createQueue is ON CONFLICT DO NOTHING) so queues exist with the right retry
// policy before any worker registers a handler against them.
export async function getQueueClient(): Promise<PgBoss> {
  if (boss) return boss
  if (!starting) {
    starting = (async () => {
      try {
        const client = new PgBoss(requireDatabaseUrl())
        await client.start()
        await Promise.all(
          Object.values(JobName).map((name) => client.createQueue(name, JOB_RETRY_POLICY[name]))
        )
        boss = client
        return client
      } catch (err) {
        // A transient startup failure (DB briefly unreachable, etc.) must not wedge every future
        // call behind this rejected promise forever — clear it so the next call retries cleanly.
        starting = null
        throw err
      }
    })()
  }
  return starting
}

export async function stopQueueClient(): Promise<void> {
  if (stopping) return stopping
  if (!boss) {
    starting = null
    return
  }
  const client = boss
  boss = null
  starting = null
  stopping = client.stop().finally(() => {
    stopping = null
  })
  return stopping
}
