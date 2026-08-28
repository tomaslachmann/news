import { describe, it, expect } from 'vitest'
import { entityInitials } from './entityInitials'

describe('entityInitials', () => {
  it('is one letter for a single-word name', () => {
    expect(entityInitials('Srbsko')).toBe('S')
    expect(entityInitials('Haag')).toBe('H')
  })

  it('is first + last word initials for a multi-word name', () => {
    expect(entityInitials('Ratko Mladić')).toBe('RM')
    expect(entityInitials('Mezinárodní trestní tribunál pro bývalou Jugoslávii')).toBe('MJ')
  })

  it('uppercases Czech diacritics correctly', () => {
    expect(entityInitials('Česká národní banka')).toBe('ČB')
    expect(entityInitials('šumava')).toBe('Š')
  })

  it('handles whitespace and an empty name', () => {
    expect(entityInitials('  Petr   Fiala  ')).toBe('PF')
    expect(entityInitials('')).toBe('?')
    expect(entityInitials('   ')).toBe('?')
  })
})
