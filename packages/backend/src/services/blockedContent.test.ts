import { describe, it, expect } from 'vitest'
import { isBlockedContent } from './blockedContent.js'

describe('isBlockedContent', () => {
  it('detects the iDnes ad-block wall phrase', () => {
    const text = 'Neblokujete reklamy a vidíte tuto stránku?\nNapište nám'
    expect(isBlockedContent(text)).toBe(true)
  })

  it('detects the iDnes Premium ad-free upsell phrase', () => {
    const text = 'Chci čtení bez reklam. Využijte služby iDNES Premium bez reklam.'
    expect(isBlockedContent(text)).toBe(true)
  })

  it('returns false for ordinary article text', () => {
    const text = 'Vláda dnes schválila nový zákon o rozpočtu na příští rok po dlouhé debatě.'
    expect(isBlockedContent(text)).toBe(false)
  })

  it('returns false for empty text', () => {
    expect(isBlockedContent('')).toBe(false)
  })
})
