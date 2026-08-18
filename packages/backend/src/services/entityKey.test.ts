import { describe, it, expect } from 'vitest'
import { deriveEntityKey } from './entityKey.js'

describe('deriveEntityKey', () => {
  it('lowercases the type and slugifies the name', () => {
    expect(deriveEntityKey('PERSON', 'Donald Tusk')).toBe('person:donald-tusk')
  })

  it('produces the same key for the same normalized name, independent of casing', () => {
    expect(deriveEntityKey('COUNTRY', 'Poland')).toBe(deriveEntityKey('COUNTRY', 'poland'))
  })

  it('strips Czech diacritics deterministically', () => {
    expect(deriveEntityKey('PERSON', 'Šimon Pánek')).toBe('person:simon-panek')
  })

  it('collapses non-alphanumeric runs into a single hyphen', () => {
    expect(deriveEntityKey('ORGANIZATION', "O'Brien & Sons,  Inc.")).toBe('organization:o-brien-sons-inc')
  })

  it('trims leading/trailing hyphens produced by punctuation at the edges', () => {
    expect(deriveEntityKey('PLACE', '-Warsaw-')).toBe('place:warsaw')
  })

  it('does not collapse non-Latin-script names onto the same empty slug', () => {
    const a = deriveEntityKey('PERSON', 'Владимир Путин')
    const b = deriveEntityKey('PERSON', 'Сергей Лавров')

    expect(a).not.toBe('person:')
    expect(b).not.toBe('person:')
    expect(a).not.toBe(b)
  })
})
