import type { AnalysisDimensions } from '@news-triangulator/shared'

export type DimensionsForSearch = Pick<
  AnalysisDimensions,
  'agreement' | 'contradiction' | 'uniqueReporting' | 'framing'
>

/** Flattens what a reader would actually search for into one plain-text string
 *  (`SynthesisResult.searchText`, ticket 83) — `seedHeadline` (the working title, always present)
 *  + the tool-authored `headline` (ADR 0021, absent only if generation was skipped) + every one
 *  of the four Dimensions' own `prose` field (the tool's own synthesized/verified claims).
 *  Deliberately excludes `Attribution.czechQuote` (raw quoted excerpts — a real v2, "search
 *  original quotes," out of this ticket's scope) and Coverage's raw scraped text (noisy,
 *  duplicated near-verbatim across every source, not what this tool represents per CLAUDE.md).
 *  Postgres's own `to_tsvector('simple', ...)` (the migration's generated `searchVector` column)
 *  does the actual tokenizing/lowercasing downstream of this — this function only concatenates,
 *  it never itself alters the text. */
export function buildSearchText(
  seedHeadline: string,
  headline: string | null,
  dimensions: DimensionsForSearch
): string {
  const proseByDimension = [
    ...dimensions.agreement,
    ...dimensions.contradiction,
    ...dimensions.uniqueReporting,
    ...dimensions.framing,
  ].map((item) => item.prose)

  return [seedHeadline, headline, ...proseByDimension].filter((s): s is string => Boolean(s)).join(' ')
}
