import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, splitPage } from './pagination.js'
import { ValidationError } from './errors.js'

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a (createdAt, id) pair', () => {
    const createdAt = new Date('2026-01-01T12:00:00.000Z')
    const encoded = encodeCursor({ createdAt, id: 'a1' })

    expect(decodeCursor(encoded)).toEqual({ createdAt, id: 'a1' })
  })

  it('rejects garbage input rather than silently returning a bad cursor', () => {
    expect(() => decodeCursor('not-a-real-cursor')).toThrow(ValidationError)
  })

  it('rejects a cursor whose date component does not parse', () => {
    const bogus = Buffer.from('not-a-date|a1').toString('base64url')
    expect(() => decodeCursor(bogus)).toThrow(ValidationError)
  })

  it('rejects a cursor missing the id component', () => {
    const bogus = Buffer.from('2026-01-01T12:00:00.000Z').toString('base64url')
    expect(() => decodeCursor(bogus)).toThrow(ValidationError)
  })
})

describe('splitPage', () => {
  const row = (id: string) => ({ id, createdAt: new Date('2026-01-01T00:00:00.000Z') })

  it('reports no next page when fewer than limit+1 rows come back', () => {
    const result = splitPage([row('a'), row('b')], 5)

    expect(result.items).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })

  it('drops the extra row and returns a cursor for it when limit+1 rows come back', () => {
    const rows = [row('a'), row('b'), row('c')]
    const result = splitPage(rows, 2)

    expect(result.items).toEqual([row('a'), row('b')])
    expect(result.nextCursor).toBe(encodeCursor(row('b')))
  })

  it('returns no cursor for an empty result', () => {
    const result = splitPage([], 5)

    expect(result.items).toEqual([])
    expect(result.nextCursor).toBeNull()
  })
})
