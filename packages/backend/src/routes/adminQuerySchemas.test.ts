import { describe, it, expect } from 'vitest'
import {
  DraftQuerySchema,
  PendingAdditionQuerySchema,
  StoryRelationQuerySchema,
} from '@news-triangulator/shared'

// The admin Ingestion queue routes (routes/ingestion.ts) parse `request.query` — always a bag of
// strings — through these schemas and 400 on failure via `parseAdminQuery`. These assert the
// coercion and the rejections that guard the repository's dynamic ORDER BY / OFFSET.

describe('DraftQuerySchema', () => {
  it('coerces the string querystring values into typed params', () => {
    const parsed = DraftQuerySchema.parse({
      page: '3',
      pageSize: '10',
      sort: 'coverageCount',
      dir: 'asc',
      outlet: '  Novinky  ',
      createdAfter: '2026-01-01',
    })
    expect(parsed).toMatchObject({
      page: 3,
      pageSize: 10,
      sort: 'coverageCount',
      dir: 'asc',
      outlet: 'Novinky',
    })
    expect(parsed.createdAfter).toBeInstanceOf(Date)
  })

  it('accepts an empty query (every field optional)', () => {
    expect(DraftQuerySchema.parse({})).toEqual({})
  })

  it('rejects an unknown sort column', () => {
    expect(DraftQuerySchema.safeParse({ sort: 'sourceName' }).success).toBe(false)
  })

  it('rejects an unknown direction', () => {
    expect(DraftQuerySchema.safeParse({ dir: 'sideways' }).success).toBe(false)
  })

  it('rejects page 0 and a non-integer page', () => {
    expect(DraftQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    expect(DraftQuerySchema.safeParse({ page: '1.5' }).success).toBe(false)
  })

  it('rejects a pageSize over the max and an unparseable date', () => {
    expect(DraftQuerySchema.safeParse({ pageSize: '5000' }).success).toBe(false)
    expect(DraftQuerySchema.safeParse({ createdAfter: 'not-a-date' }).success).toBe(false)
  })
})

describe('PendingAdditionQuerySchema', () => {
  it('takes page/dir/outlet/date-range but has no sort column', () => {
    expect(PendingAdditionQuerySchema.parse({ dir: 'desc', outlet: 'iDnes' })).toMatchObject({
      dir: 'desc',
      outlet: 'iDnes',
    })
    // `sort` isn't part of this schema — zod strips unknown keys rather than failing.
    expect(PendingAdditionQuerySchema.parse({ sort: 'coverageCount' })).toEqual({})
  })
})

describe('StoryRelationQuerySchema', () => {
  it('takes only page/dir/date-range', () => {
    expect(StoryRelationQuerySchema.parse({ dir: 'asc' })).toEqual({ dir: 'asc' })
    expect(StoryRelationQuerySchema.parse({ outlet: 'iDnes' })).toEqual({})
    expect(StoryRelationQuerySchema.safeParse({ dir: 'nope' }).success).toBe(false)
  })
})
