import type { HomepageArticleItem } from '@news-triangulator/shared'
import type { AnalysisListRow } from '../repositories/analysis.js'
import { toAnalysisListItem } from './analysis.js'

/** `findHomepageArticleRows` only ever returns a COMPLETE Analysis with a SynthesisResult (see its
 *  own docstring), so `toAnalysisListItem`'s general-purpose `status`/`summary` are always the
 *  narrow 'complete'-with-summary case here — this asserts that invariant once, at the one call
 *  site that actually guarantees it, rather than widening `HomepageArticleItem` back to
 *  `AnalysisListItem` just to satisfy the type checker. Throws instead of silently degrading if
 *  the invariant is ever violated: a homepage Article row with no summary is a bug to surface
 *  loudly, not a row to render half-empty. */
export function toHomepageArticleItem(row: AnalysisListRow): HomepageArticleItem {
  const item = toAnalysisListItem(row)
  if (item.status !== 'complete' || !item.summary) {
    throw new Error(
      `Homepage Articles read model: Analysis ${item.id} was expected to be a COMPLETE Article with a summary`
    )
  }
  return { ...item, status: item.status, summary: item.summary }
}
