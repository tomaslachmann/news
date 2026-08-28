import type { EntityType } from '../repositories/entity.js'
import { COMBINING_DIACRITICS } from './entityKey.js'
import type { WikidataItemDetail } from './wikidataSearchClient.js'

// Pure matching logic for the semi-automated Wikidata linker (ticket 93 / ADR 0042) — no I/O, no
// LLM. The scan job (entityWikidataScanService.ts) feeds it Wikidata item details it already
// fetched and gets back a score (for ordering the admin suggestion queue) and a boolean auto-link
// verdict (the deterministic six-condition gate).

/** The `P31` (instance of) target Q-ids that count as "the right kind of thing" for each of our
 *  four entity types (research §1.3). `haswbstatement:P31=<qid>` does NOT walk `P279*` subclasses,
 *  so this enumerates the common concrete subtypes rather than just the root class. Deliberately
 *  not exhaustive — a missed exotic subtype just routes an entity to the admin queue instead of
 *  auto-linking, which is the safe direction. A tunable constant, same convention as
 *  storyMatching.ts's MATCH_THRESHOLD; tune against the real corpus. */
export const TYPE_P31_QIDS: Record<EntityType, string[]> = {
  // Q5 human — single value, unambiguous.
  PERSON: ['Q5'],
  // country, sovereign state, state, historical country / unrecognised state, country within the UK.
  COUNTRY: ['Q6256', 'Q3624078', 'Q7275', 'Q3024240', 'Q1520223', 'Q1489259', 'Q3336843'],
  // city, big city, town, village, municipality, human settlement, capital, administrative
  // territorial entity, region, district of a country, urban municipality of Czechia.
  PLACE: [
    'Q515',
    'Q1549591',
    'Q3957',
    'Q532',
    'Q15284',
    'Q486972',
    'Q5119',
    'Q56061',
    'Q82794',
    'Q149621',
    'Q15300250',
  ],
  // organization, business, company, public company, government agency, political party,
  // nonprofit, university, television station, sports club, association, international
  // organization, government of a country.
  ORGANIZATION: [
    'Q43229',
    'Q4830453',
    'Q783794',
    'Q891723',
    'Q327333',
    'Q7278',
    'Q163740',
    'Q3918',
    'Q1616075',
    'Q847017',
    'Q48204',
    'Q484652',
    'Q7188',
  ],
}

/** `P31` targets that mark a Wikidata item as a Wikimedia-internal page (disambiguation, category,
 *  template, list, project page) rather than a real-world entity — the reconciliation service
 *  filters the same family via `Q17442446`. An item whose only `P31` is one of these is never a
 *  valid link target. */
export const WIKIMEDIA_INTERNAL_QIDS = [
  'Q4167410', // Wikimedia disambiguation page
  'Q4167836', // Wikimedia category
  'Q11266439', // Wikimedia template
  'Q13406463', // Wikimedia list article
  'Q14204246', // Wikimedia project page
  'Q11753321', // Wikimedia navigational template
  'Q17442446', // Wikimedia internal item
  'Q4663903', // Wikimedia content assessment
]

/** Fold a name to its comparison form: NFD + strip diacritics + collapse internal whitespace +
 *  lowercase (cs locale) + trim. "Petr  Fiala" and "petr fiala" and "Petr Fiala" all compare
 *  equal; "Fiala" does not match "Petr Fiala" (exact, not substring — research §4). */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('cs')
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeName(value).split(' ').filter(Boolean))
}

/** 0–1: exact normalized match is 1, otherwise the Jaccard overlap of the two word sets. Used only
 *  for queue ordering — the auto-link gate needs an *exact* match, not a high fuzzy score. */
export function labelMatchScore(canonicalName: string, names: string[]): number {
  const target = normalizeName(canonicalName)
  if (names.some((n) => normalizeName(n) === target)) return 1
  const targetTokens = tokenSet(canonicalName)
  let best = 0
  for (const name of names) {
    const tokens = tokenSet(name)
    const intersection = [...tokens].filter((t) => targetTokens.has(t)).length
    const union = new Set([...tokens, ...targetTokens]).size
    if (union > 0) best = Math.max(best, intersection / union)
  }
  return best
}

export interface CandidateAssessment {
  qid: string
  score: number
  labelMatch: number
  typeCoherent: boolean
  hasCswikiSitelink: boolean
  isWikimediaInternal: boolean
  reasons: string[]
}

const SCORE_WEIGHTS = { label: 60, type: 25, cswiki: 10, popularity: 5 }
const POPULARITY_SITELINK_CAP = 20

/** Weighted 0–100 score for ordering the admin suggestion queue (research §8.4). A Wikimedia-
 *  internal item scores 0 outright. Not a gate — that is `evaluateAutoLink`. */
export function scoreCandidate(
  candidate: WikidataItemDetail,
  entityType: EntityType,
  canonicalName: string
): CandidateAssessment {
  const labelMatch = labelMatchScore(canonicalName, candidate.names)
  const typeCoherent = candidate.p31.some((p) => TYPE_P31_QIDS[entityType].includes(p))
  const isWikimediaInternal = candidate.p31.some((p) => WIKIMEDIA_INTERNAL_QIDS.includes(p))
  const popularity = Math.min(1, candidate.sitelinkCount / POPULARITY_SITELINK_CAP)

  const reasons: string[] = []
  if (labelMatch === 1) reasons.push('přesná shoda jména')
  else if (labelMatch > 0) reasons.push(`částečná shoda jména (${Math.round(labelMatch * 100)} %)`)
  else reasons.push('jméno nesouhlasí')
  reasons.push(typeCoherent ? 'typ odpovídá' : 'typ nesouhlasí')
  reasons.push(candidate.hasCswikiSitelink ? 'má článek na cs.wikipedia' : 'chybí článek na cs.wikipedia')
  if (isWikimediaInternal) reasons.push('interní stránka Wikimedia (rozcestník / kategorie)')

  const score = isWikimediaInternal
    ? 0
    : Math.round(
        SCORE_WEIGHTS.label * labelMatch +
          SCORE_WEIGHTS.type * (typeCoherent ? 1 : 0) +
          SCORE_WEIGHTS.cswiki * (candidate.hasCswikiSitelink ? 1 : 0) +
          SCORE_WEIGHTS.popularity * popularity
      )

  return {
    qid: candidate.qid,
    score,
    labelMatch,
    typeCoherent,
    hasCswikiSitelink: candidate.hasCswikiSitelink,
    isWikimediaInternal,
    reasons,
  }
}

export interface AutoLinkVerdict {
  pass: boolean
  /** Which conditions failed (empty when `pass` is true) — Czech, for the audit log / queue note. */
  failures: string[]
}

/** The deterministic six-condition auto-link gate (research §8.1 / §8.4). Passes iff the primary
 *  candidate has an *exact* normalized cs label/alias match, a coherent `P31` type, a `cswiki`
 *  sitelink, is not a Wikimedia-internal page, and has no rival candidate that ALSO has both an
 *  exact name match and a coherent type. `rivals` is the full type-constrained candidate list
 *  (the primary may or may not be among it — it is filtered out by qid here). */
export function evaluateAutoLink(params: {
  primary: WikidataItemDetail
  rivals: WikidataItemDetail[]
  entityType: EntityType
  canonicalName: string
}): AutoLinkVerdict {
  const { primary, rivals, entityType, canonicalName } = params
  const assessment = scoreCandidate(primary, entityType, canonicalName)

  const failures: string[] = []
  if (assessment.labelMatch !== 1) failures.push('není přesná shoda jména')
  if (!assessment.typeCoherent) failures.push('typ položky neodpovídá typu entity')
  if (!assessment.hasCswikiSitelink) failures.push('položka nemá článek na cs.wikipedia')
  if (assessment.isWikimediaInternal) failures.push('položka je interní stránka Wikimedia')

  const hasRival = rivals.some((r) => {
    if (r.qid === primary.qid) return false
    const rivalAssessment = scoreCandidate(r, entityType, canonicalName)
    return rivalAssessment.labelMatch === 1 && rivalAssessment.typeCoherent
  })
  if (hasRival) failures.push('existuje jiná položka stejného typu se shodným jménem')

  return { pass: failures.length === 0, failures }
}
