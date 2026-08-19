import { describe, it, expect, afterAll } from 'vitest'
import { disconnect } from '../../src/repositories/analysis.js'
import { tryClaimIngestionLock, releaseIngestionLock } from '../../src/repositories/ingestionRunLock.js'

describe('IngestionRunLock repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('claims the lock when it is free, and releases it', async () => {
    const runId = await tryClaimIngestionLock(30)
    expect(runId).not.toBeNull()

    await releaseIngestionLock(runId!)

    // Released — a fresh claim must succeed again.
    const secondRunId = await tryClaimIngestionLock(30)
    expect(secondRunId).not.toBeNull()
    await releaseIngestionLock(secondRunId!)
  })

  it('refuses a second claim while the lock is already held', async () => {
    const firstRunId = await tryClaimIngestionLock(30)
    expect(firstRunId).not.toBeNull()

    const secondRunId = await tryClaimIngestionLock(30)

    expect(secondRunId).toBeNull()

    await releaseIngestionLock(firstRunId!)
  })

  it('lets a later claim reclaim a stale lock (staleAfterMinutes elapsed)', async () => {
    const firstRunId = await tryClaimIngestionLock(30)
    expect(firstRunId).not.toBeNull()

    // A staleAfterMinutes of 0 treats any already-held lock (claimed strictly in the past) as
    // immediately reclaimable — simulates a previous run having crashed without releasing it,
    // without needing to actually wait out a real timeout in this test.
    const reclaimedRunId = await tryClaimIngestionLock(0)

    expect(reclaimedRunId).not.toBeNull()
    expect(reclaimedRunId).not.toBe(firstRunId)

    await releaseIngestionLock(reclaimedRunId!)
  })

  it('release is a no-op if runId does not match the current holder, so a stale run cannot clobber a newer lease', async () => {
    const firstRunId = await tryClaimIngestionLock(30)
    expect(firstRunId).not.toBeNull()
    // Simulate firstRunId's lease having been reclaimed as stale by another run in the meantime.
    const reclaimedRunId = await tryClaimIngestionLock(0)
    expect(reclaimedRunId).not.toBeNull()

    // The old (stale) run finally reaches its own `finally` block and tries to release its
    // now-superseded runId — must not clear the new holder's lease.
    await releaseIngestionLock(firstRunId!)

    const stillHeld = await tryClaimIngestionLock(30)
    expect(stillHeld).toBeNull()

    await releaseIngestionLock(reclaimedRunId!)
  })
})
