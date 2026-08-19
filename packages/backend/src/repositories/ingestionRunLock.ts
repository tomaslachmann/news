import { randomUUID } from 'node:crypto'
import { prisma } from '../db.js'

// The single lease row this lock is claimed against — seeded once by the migration. Not
// per-caller configuration; this whole model exists to serialize exactly one job
// (runIngestionPass), so one fixed id is all it ever needs.
const LOCK_ID = 'ingestion'

/**
 * Attempts to claim the ingestion run lease, returning a fresh run id on success or null if
 * another run already holds it and hasn't gone stale — see ADR-adjacent notes on
 * `IngestionRunLock` (P2-22, docs/audit.md). A single atomic conditional UPDATE, same idiom as
 * `updateAnalysisStatusIfCurrently`/`updateStoryRelationStatusIfCurrently`: two concurrent
 * callers racing this same UPDATE serialize at the row level, so at most one can ever match.
 *
 * `staleAfterMinutes` lets a later run reclaim an abandoned lease (a previous run crashed
 * without releasing it) rather than deadlocking ingestion forever.
 */
export async function tryClaimIngestionLock(staleAfterMinutes: number): Promise<string | null> {
  const runId = randomUUID()
  const staleThreshold = new Date(Date.now() - staleAfterMinutes * 60 * 1000)

  const result = await prisma.ingestionRunLock.updateMany({
    where: {
      id: LOCK_ID,
      OR: [{ runningSince: null }, { runningSince: { lt: staleThreshold } }],
    },
    data: { runningSince: new Date(), runId },
  })

  return result.count > 0 ? runId : null
}

/** Releases the ingestion run lease — only if `runId` still matches the current holder, so a
 *  run whose lease was reclaimed as stale (it ran unexpectedly long, or crashed and a later run
 *  already took over) can't clobber the new holder's lease when it finally reaches its own
 *  `finally` block. */
export async function releaseIngestionLock(runId: string): Promise<void> {
  await prisma.ingestionRunLock.updateMany({
    where: { id: LOCK_ID, runId },
    data: { runningSince: null, runId: null },
  })
}
