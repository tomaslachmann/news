import { describe, it, expect } from 'vitest'
import { parseCzechNumeralValue } from './czechNumeral.js'

describe('parseCzechNumeralValue', () => {
  it('parses a magnitude word plus a currency unit', () => {
    expect(parseCzechNumeralValue('241 miliard korun')).toEqual({
      normalizedValue: 241_000_000_000,
      unit: 'CZK',
    })
  })

  it('parses "Kč" as the CZK unit with no magnitude word', () => {
    expect(parseCzechNumeralValue('500 Kč')).toEqual({ normalizedValue: 500, unit: 'CZK' })
  })

  it('parses a thousands-separated, comma-decimal number', () => {
    expect(parseCzechNumeralValue('1 234,5 milionu Kč')).toEqual({
      normalizedValue: 1_234_500_000,
      unit: 'CZK',
    })
  })

  it('parses a percentage', () => {
    expect(parseCzechNumeralValue('15 %')).toEqual({ normalizedValue: 15, unit: '%' })
    expect(parseCzechNumeralValue('15 procent')).toEqual({ normalizedValue: 15, unit: '%' })
  })

  it('parses a bare number with no unit', () => {
    expect(parseCzechNumeralValue('100')).toEqual({ normalizedValue: 100, unit: null })
  })

  it('keeps an unrecognized trailing word as the raw unit, unnormalized', () => {
    expect(parseCzechNumeralValue('12 zraněných')).toEqual({ normalizedValue: 12, unit: 'zraněných' })
  })

  it('returns null/null for text with no leading number', () => {
    expect(parseCzechNumeralValue('hodně peněz')).toEqual({ normalizedValue: null, unit: null })
  })

  it('returns null/null for an empty string', () => {
    expect(parseCzechNumeralValue('')).toEqual({ normalizedValue: null, unit: null })
  })
})
