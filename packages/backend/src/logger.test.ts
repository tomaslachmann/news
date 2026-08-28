import { describe, it, expect } from 'vitest'
import { colorForNamespace, logFileNameFor } from './logger.js'

describe('colorForNamespace', () => {
  it('is deterministic — the same namespace always hashes to the same color', () => {
    expect(colorForNamespace('rss')).toBe(colorForNamespace('rss'))
    expect(colorForNamespace('entity.extract')).toBe(colorForNamespace('entity.extract'))
  })

  it('returns a value from the fixed ANSI color palette, not an out-of-range index', () => {
    const namespaces = [
      'rss',
      'ingestion',
      'llm',
      'embedding',
      'entity.extract',
      'narrative.generate',
      'scraper',
    ]
    for (const ns of namespaces) {
      const color = colorForNamespace(ns)
      expect(Number.isInteger(color)).toBe(true)
      expect(color).toBeGreaterThanOrEqual(30)
      expect(color).toBeLessThan(100)
    }
  })

  it('gives different-looking namespaces at least some spread across the palette, not one constant color', () => {
    const namespaces = ['rss', 'ingestion', 'llm', 'embedding', 'discovery', 'scraper', 'entity.extract']
    const colors = new Set(namespaces.map(colorForNamespace))
    expect(colors.size).toBeGreaterThan(1)
  })
})

describe('logFileNameFor', () => {
  const name = logFileNameFor('worker')

  it('is the bare active filename when rfs passes no time', () => {
    // rfs passes literal null for the file currently being written (its type says number | Date).
    expect(name(null as unknown as number)).toBe('worker.log')
  })

  it('is a date-stamped .log.gz for a rotated file (content is gzipped, so the name says so)', () => {
    expect(name(new Date('2026-08-28T00:00:00Z'), 1)).toBe('worker-2026-08-28.log.gz')
  })

  it('adds a sequence suffix for a same-day mid-day rotation, not for the first', () => {
    const t = new Date('2026-01-05T00:00:00Z')
    expect(name(t, 1)).toBe('worker-2026-01-05.log.gz')
    expect(name(t, 3)).toBe('worker-2026-01-05.3.log.gz')
  })

  it('zero-pads month and day', () => {
    expect(name(new Date('2026-03-04T00:00:00Z'))).toBe('worker-2026-03-04.log.gz')
  })
})
