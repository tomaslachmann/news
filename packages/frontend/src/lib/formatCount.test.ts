import { describe, expect, it } from 'vitest'
import { formatCzechCount } from './formatCount'

describe('formatCzechCount', () => {
  it('uses Czech noun forms for one, two to four, and the remaining counts', () => {
    expect(formatCzechCount(1, 'článek', 'články', 'článků')).toBe('1 článek')
    expect(formatCzechCount(2, 'článek', 'články', 'článků')).toBe('2 články')
    expect(formatCzechCount(4, 'článek', 'články', 'článků')).toBe('4 články')
    expect(formatCzechCount(0, 'článek', 'články', 'článků')).toBe('0 článků')
    expect(formatCzechCount(7, 'článek', 'články', 'článků')).toBe('7 článků')
    expect(formatCzechCount(21, 'článek', 'články', 'článků')).toBe('21 článků')
    expect(formatCzechCount(10, 'zdroj', 'zdroje', 'zdrojů')).toBe('10 zdrojů')
    expect(formatCzechCount(5, 'rozpor', 'rozpory', 'rozporů')).toBe('5 rozporů')
  })
})
