import type { AnalysisDimensions } from '@news-triangulator/shared'

// DESIGN-SYSTEM.md §3.3 — the only place these boundaries are allowed to exist (ADR 0030). A
// future frontend consumer switches on interpretSourceOverlap's returned tier instead of
// re-typing 85/65 into a CSS class name or a JS conditional.
export const SOURCE_OVERLAP_OK_THRESHOLD = 85
export const SOURCE_OVERLAP_MID_THRESHOLD = 65

/** Below this many sources, a ten-segment gauge implies more precision than the data has (ADR
 *  0030) — one outlet moves a three-source bar by a third. The backend still returns the
 *  percentage regardless of source count; a display-layer consumer decides whether to render a
 *  gauge at all below this threshold. */
export const MIN_SOURCES_FOR_GAUGE = 5

export type SourceOverlapTier = 'ok' | 'mid' | 'bad'

/** Source Overlap (ticket 38, ADR 0030) — counted, never asked of a model. For each item in the
 *  `agreement` dimension, the number of distinct outlets among its attributions; the metric is
 *  the mean of those counts over `sourceCount` (the Analysis's non-excluded, non-failed Coverage
 *  count), expressed as a whole-number percentage. No LLM involvement, no randomness: the same
 *  `dimensions` and `sourceCount` always yield the same number.
 *
 *  Null means "undefined for this Analysis", not "not computed yet" — an Analysis whose
 *  `agreement` dimension is empty has no overlap to measure, a genuine terminal state rather
 *  than a pending one. */
export function computeSourceOverlapPercentage(
  dimensions: Pick<AnalysisDimensions, 'agreement'>,
  sourceCount: number
): number | null {
  if (dimensions.agreement.length === 0 || sourceCount === 0) return null

  const outletCounts = dimensions.agreement.map(
    (item) => new Set(item.attributions.map((a) => a.outlet)).size
  )
  const mean = outletCounts.reduce((sum, count) => sum + count, 0) / outletCounts.length
  // Clamped to 100: `outlet` is free-text from the model (never cross-checked against a
  // canonical source list, unlike `czechQuote`/`articleUrl`), so two attributions naming the same
  // real outlet under different spellings can push the distinct count above `sourceCount`.
  return Math.min(100, Math.round((mean / sourceCount) * 100))
}

/** Maps an already-computed percentage onto DESIGN-SYSTEM.md §3.3's three-way interpretation —
 *  the only place that table's boundaries are read. */
export function interpretSourceOverlap(percentage: number): SourceOverlapTier {
  if (percentage >= SOURCE_OVERLAP_OK_THRESHOLD) return 'ok'
  if (percentage >= SOURCE_OVERLAP_MID_THRESHOLD) return 'mid'
  return 'bad'
}
