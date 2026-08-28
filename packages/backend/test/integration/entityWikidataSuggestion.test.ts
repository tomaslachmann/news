import { describe, it, expect, afterAll } from 'vitest'
import { createAnalysis, disconnect } from '../../src/repositories/analysis.js'
import { replaceStoryEntities, findEntityByKey, setEntityWikidataId } from '../../src/repositories/entity.js'
import {
  findUnlinkedEntitiesForScan,
  countUnlinkedEntitiesForScan,
  upsertSuggestion,
  deleteSuggestion,
  listSuggestions,
  findSuggestionCandidates,
  findRejectedQidsByEntity,
  rejectCandidate,
} from '../../src/repositories/entityWikidataSuggestion.js'

const FAR_FUTURE = new Date('2999-01-01')
const FAR_PAST = new Date('2000-01-01')

async function seedEntity(key: string, name: string): Promise<string> {
  const analysis = await createAnalysis({ seedUrl: `https://example.cz/${key}`, seedHeadline: 'x' })
  await replaceStoryEntities(
    analysis.storyId,
    [{ key, name, type: 'PERSON', confidence: 0.9, salience: 1 }],
    []
  )
  const entity = await findEntityByKey(key)
  if (!entity) throw new Error(`Test setup: no Entity for ${key}`)
  return entity.id
}

const CANDIDATES = [
  { qid: 'Q1', label: 'A', score: 70, reasons: ['přesná shoda jména'] },
  { qid: 'Q2', label: 'B', description: 'guitarist', score: 40, reasons: ['typ nesouhlasí'] },
]

describe('entityWikidataSuggestion repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('finds an unlinked entity with enough stories and no suggestion, and stops finding it once linked', async () => {
    const id = await seedEntity('person:ewd-scan-1', 'EWD Scan One')

    const before = await findUnlinkedEntitiesForScan({
      minStoryCount: 1,
      suggestionStaleBefore: FAR_FUTURE,
      limit: 100,
    })
    expect(before.map((e) => e.id)).toContain(id)

    await setEntityWikidataId(id, 'Q100')
    const after = await findUnlinkedEntitiesForScan({
      minStoryCount: 1,
      suggestionStaleBefore: FAR_FUTURE,
      limit: 100,
    })
    expect(after.map((e) => e.id)).not.toContain(id)
  })

  it('excludes an entity below the story-count threshold', async () => {
    const id = await seedEntity('person:ewd-scan-2', 'EWD Scan Two') // storyCount 1

    const found = await findUnlinkedEntitiesForScan({
      minStoryCount: 2,
      suggestionStaleBefore: FAR_FUTURE,
      limit: 100,
    })
    expect(found.map((e) => e.id)).not.toContain(id)
  })

  it('upserts a suggestion (one row per entity), lists it, and reads its candidates back', async () => {
    const id = await seedEntity('person:ewd-scan-3', 'EWD Scan Three')

    await upsertSuggestion(id, CANDIDATES)
    await upsertSuggestion(id, [CANDIDATES[0]]) // replaces, does not stack

    expect(await findSuggestionCandidates(id)).toEqual([CANDIDATES[0]])

    const listed = await listSuggestions()
    const mine = listed.find((s) => s.entityKey === 'person:ewd-scan-3')
    expect(mine).toMatchObject({
      canonicalName: 'EWD Scan Three',
      type: 'PERSON',
      candidates: [CANDIDATES[0]],
    })

    // A fresh suggestion means the scan filter skips the entity until it goes stale.
    const fresh = await findUnlinkedEntitiesForScan({
      minStoryCount: 1,
      suggestionStaleBefore: FAR_PAST,
      limit: 100,
    })
    expect(fresh.map((e) => e.id)).not.toContain(id)

    await deleteSuggestion(id)
    expect(await findSuggestionCandidates(id)).toBeNull()
    await deleteSuggestion(id) // idempotent
  })

  it('records candidate rejections idempotently and reads them back per entity', async () => {
    const id = await seedEntity('person:ewd-scan-4', 'EWD Scan Four')

    await rejectCandidate(id, 'Q1', 'admin-1')
    await rejectCandidate(id, 'Q1', 'admin-1') // idempotent, no unique-constraint error
    await rejectCandidate(id, 'Q2', 'admin-1')

    expect((await findRejectedQidsByEntity(id)).sort()).toEqual(['Q1', 'Q2'])
  })

  it('countUnlinkedEntitiesForScan agrees with the find query on a shared filter', async () => {
    const filter = { minStoryCount: 1, suggestionStaleBefore: FAR_FUTURE }
    const rows = await findUnlinkedEntitiesForScan({ ...filter, limit: 100000 })
    const count = await countUnlinkedEntitiesForScan(filter)
    expect(count).toBe(rows.length)
  })
})
