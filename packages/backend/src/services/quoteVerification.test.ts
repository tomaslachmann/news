import { describe, it, expect } from 'vitest'
import { isVerbatimQuote } from './quoteVerification.js'

describe('isVerbatimQuote', () => {
  it('returns true for a real verbatim substring', () => {
    expect(isVerbatimQuote('schválila rozpočet', 'Vláda dnes schválila rozpočet.')).toBe(true)
  })

  it('returns false for a quote that does not appear in the source', () => {
    expect(isVerbatimQuote('citát, který tam není', 'Vláda dnes schválila rozpočet.')).toBe(false)
  })

  it('rejects an empty quote even though every string trivially "contains" the empty string', () => {
    expect(isVerbatimQuote('', 'Vláda dnes schválila rozpočet.')).toBe(false)
  })

  it('matches across a non-breaking space vs. regular space difference', () => {
    const sourceWithNbsp = `Vláda dnes schválila rozpočet.`
    expect(isVerbatimQuote('dnes schválila', sourceWithNbsp)).toBe(true)
  })

  it('matches across curly vs. straight quote differences', () => {
    const sourceWithCurly = 'Ministr řekl: „jde o vyrovnaný návrh“.'
    expect(isVerbatimQuote('"jde o vyrovnaný návrh"', sourceWithCurly)).toBe(true)
  })
})
