import { describe, it, expect } from 'vitest'
import {
  computeSourceOverlapPercentage,
  interpretSourceOverlap,
  SOURCE_OVERLAP_OK_THRESHOLD,
  SOURCE_OVERLAP_MID_THRESHOLD,
  MIN_SOURCES_FOR_GAUGE,
} from './sourceOverlap.js'

const attribution = (outlet: string) => ({ outlet, czechQuote: 'x', articleUrl: `https://${outlet}.cz/x` })

describe('computeSourceOverlapPercentage', () => {
  it('returns null for an empty agreement dimension — nothing to measure, not "not computed yet"', () => {
    expect(computeSourceOverlapPercentage({ agreement: [] }, 5)).toBeNull()
  })

  it('returns 100 for a single source confirming its own single agreement item', () => {
    const dimensions = { agreement: [{ prose: 'x', attributions: [attribution('iDnes')] }] }
    expect(computeSourceOverlapPercentage(dimensions, 1)).toBe(100)
  })

  it('returns 100 when every agreement item is attributed to every source', () => {
    const dimensions = {
      agreement: [
        { prose: 'a', attributions: [attribution('iDnes'), attribution('Novinky'), attribution('ČTK')] },
        { prose: 'b', attributions: [attribution('iDnes'), attribution('Novinky'), attribution('ČTK')] },
      ],
    }
    expect(computeSourceOverlapPercentage(dimensions, 3)).toBe(100)
  })

  it('still computes and returns a real percentage below the gauge-display source threshold — the backend never gates on it, only a display layer does', () => {
    const dimensions = {
      agreement: [{ prose: 'x', attributions: [attribution('iDnes'), attribution('Novinky')] }],
    }
    const sourceCount = 3
    expect(sourceCount).toBeLessThan(MIN_SOURCES_FOR_GAUGE)
    expect(computeSourceOverlapPercentage(dimensions, sourceCount)).toBe(67)
  })

  it('means distinct-outlet counts across multiple agreement items rather than just the first', () => {
    const dimensions = {
      agreement: [
        { prose: 'a', attributions: [attribution('iDnes'), attribution('Novinky')] }, // 2 of 4
        { prose: 'b', attributions: [attribution('iDnes')] }, // 1 of 4
      ],
    }
    // mean(2, 1) / 4 = 0.375 -> 38%
    expect(computeSourceOverlapPercentage(dimensions, 4)).toBe(38)
  })

  it('counts distinct outlets, not attribution entries — a duplicate outlet on one item does not inflate the count', () => {
    const dimensions = {
      agreement: [{ prose: 'x', attributions: [attribution('iDnes'), attribution('iDnes')] }],
    }
    expect(computeSourceOverlapPercentage(dimensions, 2)).toBe(50)
  })

  it('is deterministic — the same inputs always yield the same output', () => {
    const dimensions = {
      agreement: [{ prose: 'x', attributions: [attribution('iDnes'), attribution('Novinky')] }],
    }
    const results = Array.from({ length: 5 }, () => computeSourceOverlapPercentage(dimensions, 3))
    expect(new Set(results).size).toBe(1)
  })

  it('returns null rather than dividing by zero when sourceCount is 0', () => {
    const dimensions = { agreement: [{ prose: 'x', attributions: [attribution('iDnes')] }] }
    expect(computeSourceOverlapPercentage(dimensions, 0)).toBeNull()
  })

  it('clamps to 100 when inconsistent outlet spellings inflate the distinct count above sourceCount', () => {
    const dimensions = {
      agreement: [
        { prose: 'x', attributions: [attribution('iDnes'), attribution('iDNES.cz'), attribution('Novinky')] },
      ],
    }
    expect(computeSourceOverlapPercentage(dimensions, 2)).toBe(100)
  })
})

describe('interpretSourceOverlap', () => {
  it('is "ok" at and above the ok threshold', () => {
    expect(interpretSourceOverlap(SOURCE_OVERLAP_OK_THRESHOLD)).toBe('ok')
    expect(interpretSourceOverlap(100)).toBe('ok')
  })

  it('is "mid" from the mid threshold up to just below the ok threshold', () => {
    expect(interpretSourceOverlap(SOURCE_OVERLAP_MID_THRESHOLD)).toBe('mid')
    expect(interpretSourceOverlap(SOURCE_OVERLAP_OK_THRESHOLD - 1)).toBe('mid')
  })

  it('is "bad" below the mid threshold', () => {
    expect(interpretSourceOverlap(SOURCE_OVERLAP_MID_THRESHOLD - 1)).toBe('bad')
    expect(interpretSourceOverlap(0)).toBe('bad')
  })
})
