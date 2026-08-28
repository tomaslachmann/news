import { describe, it, expect } from 'vitest'
import { buildDraftExclusionNotice } from './reviewPageViewModel'
import type { DraftExclusion } from '@/services/ingestion'

const failed = (outlet: string): DraftExclusion => ({
  coverageId: `c-${outlet}`,
  outlet,
  reason: 'failed-verification',
})
const noTitle = (outlet: string): DraftExclusion => ({
  coverageId: `c-${outlet}`,
  outlet,
  reason: 'no-title',
})

describe('buildDraftExclusionNotice', () => {
  it('returns null when nothing was excluded', () => {
    expect(buildDraftExclusionNotice([])).toBeNull()
  })

  it('groups failed-verification outlets under their own labelled bucket', () => {
    const notice = buildDraftExclusionNotice([failed('iDnes'), failed('Novinky')])

    expect(notice?.groups).toEqual([
      {
        reason: 'failed-verification',
        label: 'Neprošly ověřením, že popisují stejnou událost',
        outlets: ['iDnes', 'Novinky'],
      },
    ])
  })

  it('keeps the no-title bucket separate from failed verification, not merged into one', () => {
    const notice = buildDraftExclusionNotice([noTitle('ČT24'), failed('iDnes')])

    expect(notice?.groups.map((g) => g.reason)).toEqual(['failed-verification', 'no-title'])
    expect(notice?.groups.find((g) => g.reason === 'no-title')?.outlets).toEqual(['ČT24'])
  })

  it('orders buckets failed-verification first regardless of input order', () => {
    const notice = buildDraftExclusionNotice([noTitle('ČT24'), failed('iDnes')])

    expect(notice?.groups[0]?.reason).toBe('failed-verification')
  })

  it('omits a bucket entirely when no outlet falls into it', () => {
    const notice = buildDraftExclusionNotice([noTitle('ČT24')])

    expect(notice?.groups.map((g) => g.reason)).toEqual(['no-title'])
  })
})
