/** Deterministic parser for a Czech-language numeral phrase (ticket 47 / ADR 0034) — turns text
 *  like "241 miliard korun" into `{ normalizedValue: 241_000_000_000, unit: 'CZK' }`. Never asked
 *  of the LLM (ADR 0014's "never trust an LLM with a computation a deterministic check can verify
 *  instead"): `NarrativeValueRef.text`/`sourceIds` come from the model, `normalizedValue`/`unit`
 *  are always derived from `text` here, as a post-processing step. Returns `null`/`null` when
 *  `text` can't be safely parsed, rather than guessing. */

export interface ParsedCzechNumeral {
  normalizedValue: number | null
  unit: string | null
}

// Czech magnitude words (nominative/genitive-singular/genitive-plural forms actually seen in
// running text) — each multiplies the base number they follow.
const MAGNITUDE_WORDS: Record<string, number> = {
  tisíc: 1e3,
  tisíce: 1e3,
  tisíců: 1e3,
  milion: 1e6,
  miliony: 1e6,
  milionu: 1e6,
  milionů: 1e6,
  miliarda: 1e9,
  miliardy: 1e9,
  miliard: 1e9,
  bilion: 1e12,
  biliony: 1e12,
  bilionů: 1e12,
}

// Known unit/currency words that follow the (optional magnitude-multiplied) number, normalized to
// a short canonical unit string — a currency code where one exists, otherwise the Czech word
// itself lowercased. Not exhaustive: an unrecognized trailing word still becomes the unit, just
// without normalization (see below).
const KNOWN_UNITS: Record<string, string> = {
  kč: 'CZK',
  korun: 'CZK',
  korunu: 'CZK',
  koruny: 'CZK',
  eur: 'EUR',
  euro: 'EUR',
  eura: 'EUR',
  eurech: 'EUR',
  dolar: 'USD',
  dolarů: 'USD',
  dolary: 'USD',
  usd: 'USD',
  '%': '%',
  procent: '%',
  procenta: '%',
  procentních: '%',
}

/** Parses a plain Czech-formatted number: space (incl. NBSP) as a thousands separator, comma as
 *  the decimal separator — e.g. "1 234,5" -> 1234.5. Returns null if `text` isn't a number at all. */
function parsePlainNumber(text: string): number | null {
  const cleaned = text.replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

export function parseCzechNumeralValue(text: string): ParsedCzechNumeral {
  const trimmed = text.trim()
  // Leading Czech-formatted number (spaces/NBSP as thousands separators, comma decimal).
  const match = /^(-?[\d\s]+(?:,\d+)?)\s*(.*)$/.exec(trimmed)
  if (!match) return { normalizedValue: null, unit: null }

  const [, numberPart, rest] = match
  const baseValue = parsePlainNumber(numberPart ?? '')
  if (baseValue === null) return { normalizedValue: null, unit: null }

  const words = (rest ?? '').trim().split(/\s+/).filter(Boolean)
  const firstWord = words[0]?.toLowerCase()

  let value = baseValue
  let remainingWords = words
  if (firstWord && firstWord in MAGNITUDE_WORDS) {
    value = baseValue * MAGNITUDE_WORDS[firstWord]
    remainingWords = words.slice(1)
  }

  const unitWord = remainingWords[0]?.toLowerCase()
  if (!unitWord) return { normalizedValue: value, unit: null }

  const unit = KNOWN_UNITS[unitWord] ?? unitWord
  return { normalizedValue: value, unit }
}
