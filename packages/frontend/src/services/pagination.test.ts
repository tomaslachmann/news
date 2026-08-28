import { describe, it, expect } from 'vitest'
import { adminQueryString, cursorQueryParam, inclusiveEndOfDay } from './pagination'

describe('adminQueryString', () => {
  it('is empty for a pristine (all-undefined) filter', () => {
    expect(adminQueryString({})).toBe('')
    expect(adminQueryString({ page: undefined, outlet: undefined })).toBe('')
  })

  it('drops empty strings so a cleared text filter does not appear in the URL', () => {
    expect(adminQueryString({ outlet: '', page: 2 })).toBe('?page=2')
  })

  it('serialises the set values, stringifying numbers', () => {
    expect(adminQueryString({ page: 3, sort: 'coverageCount', dir: 'asc' })).toBe(
      '?page=3&sort=coverageCount&dir=asc'
    )
  })

  it('url-encodes filter values', () => {
    expect(adminQueryString({ outlet: 'Seznam Zprávy' })).toBe('?outlet=Seznam+Zpr%C3%A1vy')
  })
})

describe('inclusiveEndOfDay', () => {
  it('is undefined for an empty date', () => {
    expect(inclusiveEndOfDay('')).toBeUndefined()
  })

  it("widens a bare day to that day's last millisecond in UTC", () => {
    expect(inclusiveEndOfDay('2026-01-15')).toBe('2026-01-15T23:59:59.999Z')
  })
})

describe('cursorQueryParam', () => {
  it('is empty without a cursor and encodes one when present', () => {
    expect(cursorQueryParam(undefined)).toBe('')
    expect(cursorQueryParam('a b')).toBe('?cursor=a%20b')
  })
})
