import type { ArticleCategory } from '../repositories/coverage.js'

// Per-source raw-category-signal -> canonical ArticleCategory mapping (ticket 78, ticket 77's
// grilling). Hardcoded, not admin-editable -- matches how Source/SourceFeed rows themselves are
// already raw-SQL-seeded, code-defined config (see the source-identity migrations). Keyed by
// Source.id, the same fixed strings those seed migrations use.
//
// Every table here is deliberately incomplete: a raw tag/code a source actually emits but that
// doesn't cleanly fit one of the 13 ArticleCategory values (e.g. Deník N's "Hlavní", ČT24's
// "Média", or a topic tag like "Ruská válka na Ukrajině") is left out on purpose, not mapped to
// OTHER -- resolvePrimaryCategory's "no match -> null" fallback is what ticket 77's Answer means
// by "never a guessed default". OTHER is reserved for a raw value that's clearly a rubric but
// doesn't fit any of the other 12 -- none of the 6 sources below have one yet.

/// Novinky, Aktuálně, ČT24 and Seznam Zprávy each tag every item inline with their own
/// `<category>` value, but independently verified live (2026-08-26) to use the same shared
/// vocabulary of generic Czech news-rubric names -- one table reused across all four sourceIds
/// rather than four near-identical copies.
const STANDARD_CZECH_RUBRIC_MAP: Record<string, ArticleCategory> = {
  Domácí: 'DOMESTIC',
  Zahraničí: 'WORLD',
  Zahraniční: 'WORLD',
  Svět: 'WORLD',
  Ekonomika: 'ECONOMY',
  Byznys: 'ECONOMY',
  'Česká ekonomika': 'ECONOMY',
  Sport: 'SPORT',
  Fotbal: 'SPORT',
  Tenis: 'SPORT',
  Kultura: 'CULTURE',
  Film: 'CULTURE',
  Literatura: 'CULTURE',
  Politika: 'POLITICS',
  Krimi: 'CRIME',
  Mobil: 'SCIENCE_TECH',
  Věda: 'SCIENCE_TECH',
  'Hlavní město Praha': 'REGIONAL',
}

/// Deník N multi-tags each item, mixing real rubrics with ongoing-story topic tags in the same
/// `<category>` field (ticket 77's Answer) -- only the confirmed rubric-level tags are mapped
/// here; topic tags ("Ruská válka na Ukrajině", "USA", "Investigativa", ...) are left unmapped on
/// purpose. "Česko" is this outlet's own name for its domestic-news rubric (its 2nd most frequent
/// category tag), not the "Domácí" wording the other four outlets use.
const DENIK_N_MAP: Record<string, ArticleCategory> = {
  Česko: 'DOMESTIC',
  Svět: 'WORLD',
  Ekonomika: 'ECONOMY',
  Byznys: 'ECONOMY',
  Kultura: 'CULTURE',
  Věda: 'SCIENCE_TECH',
  Komentáře: 'COMMENTARY',
  Lifestyle: 'LIFESTYLE',
  Zdraví: 'HEALTH',
  Zdravotnictví: 'HEALTH',
}

/// České noviny tags each item with a terse internal single-letter code, not a readable rubric
/// name (ticket 77's Answer). Confirmed by reading a live sample of each code's actual article
/// content/URLs (2026-08-26): "m" carries this outlet's foreign-affairs items (short for
/// "mezinárodní"), not "media". A 5th code ("p") was named in ticket 77's original research but
/// didn't appear in this session's sample -- left out rather than guessed.
const CESKE_NOVINY_MAP: Record<string, ArticleCategory> = {
  d: 'DOMESTIC',
  m: 'WORLD',
  e: 'ECONOMY',
  s: 'SPORT',
}

const SOURCE_CATEGORY_MAPS: Record<string, Record<string, ArticleCategory>> = {
  'src-novinky': STANDARD_CZECH_RUBRIC_MAP,
  'src-aktualne': STANDARD_CZECH_RUBRIC_MAP,
  'src-ct24': STANDARD_CZECH_RUBRIC_MAP,
  'src-seznamzpravy': STANDARD_CZECH_RUBRIC_MAP,
  'src-denikn': DENIK_N_MAP,
  'src-ceskenoviny': CESKE_NOVINY_MAP,
}

/** Resolves a Coverage's `primaryCategory` from its source's own raw category signal: the first
 *  of `rawCategories` (in feed order) that this Source's mapping table maps to a real
 *  ArticleCategory wins. `null` when `sourceId` has no mapping table at all (e.g. iRozhlas/iDnes
 *  until ticket 79), `rawCategories` is empty/undefined, or none of its values map -- never a
 *  guessed default (ticket 77's Answer, ticket 78). */
export function resolvePrimaryCategory(
  sourceId: string,
  rawCategories: string[] | undefined
): ArticleCategory | null {
  const map = SOURCE_CATEGORY_MAPS[sourceId]
  if (!map || !rawCategories) return null

  for (const raw of rawCategories) {
    const mapped = map[raw]
    if (mapped) return mapped
  }
  return null
}
