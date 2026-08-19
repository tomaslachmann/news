import { fromPrisma, type PrismaTransactionLike, type SendOptions } from 'pg-boss'
import { getQueueClient } from './queueClient.js'
import type { JobNameValue, JobPayload } from './jobDefinitions.js'

export interface EnqueueOptions {
  // Pass the active Prisma transaction so the enqueue commits atomically with the domain write
  // that schedules it — pg-boss's own adapter, no custom outbox table needed.
  tx?: PrismaTransactionLike
}

export async function enqueueJob<K extends JobNameValue>(
  name: K,
  payload: JobPayload[K],
  options: EnqueueOptions = {}
): Promise<string | null> {
  const boss = await getQueueClient()
  const sendOptions: SendOptions = options.tx ? { db: fromPrisma(options.tx) } : {}
  return boss.send(name, payload, sendOptions)
}
