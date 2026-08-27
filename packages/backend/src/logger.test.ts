import { describe, it, expect } from 'vitest'
import { colorForNamespace } from './logger.js'

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
