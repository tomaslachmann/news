import { describe, it, expect } from 'vitest'
import { buildPageList, pageRangeLabel } from './adminPaginationModel'

describe('buildPageList', () => {
  it('returns just [1] for a single-page (or empty) result', () => {
    expect(buildPageList(1, 1)).toEqual([1])
    expect(buildPageList(1, 0)).toEqual([1])
  })

  it('lists every page with no ellipsis when they all fit around the window', () => {
    expect(buildPageList(2, 4)).toEqual([1, 2, 3, 4])
  })

  it('collapses the gap between the first page and the current window to an ellipsis', () => {
    expect(buildPageList(7, 10)).toEqual([1, '…', 6, 7, 8, '…', 10])
  })

  it('keeps first and last, no leading ellipsis when the window touches page 1', () => {
    expect(buildPageList(2, 10)).toEqual([1, 2, 3, '…', 10])
  })

  it('keeps first and last, no trailing ellipsis when the window touches the last page', () => {
    expect(buildPageList(9, 10)).toEqual([1, '…', 8, 9, 10])
  })
})

describe('pageRangeLabel', () => {
  it('shows the 1-based row range for a full page', () => {
    expect(pageRangeLabel(1, 20, 57)).toBe('1–20 z 57')
  })

  it('clamps the upper bound to the total on the last page', () => {
    expect(pageRangeLabel(3, 20, 57)).toBe('41–57 z 57')
  })

  it('reads "0 z 0" for an empty result', () => {
    expect(pageRangeLabel(1, 20, 0)).toBe('0 z 0')
  })
})
