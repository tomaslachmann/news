import { prisma } from '../db.js'
import { ANALYSIS_LIST_ROW_INCLUDE, toAnalysisListRow } from './analysis.js'
import type { AnalysisListRow } from './analysis.js'

/** The homepage Article read model (ticket 62 / ADR 0037) — a fixed top-N slate, not a paginated
 *  feed, so unlike `findAnalysesPage` this takes no cursor and never over-fetches by one row to
 *  detect a next page. Shares `findAnalysesPage`'s exact row shape and query
 *  (`ANALYSIS_LIST_ROW_INCLUDE`/`toAnalysisListRow`, `repositories/analysis.ts`) so the two
 *  features can't silently drift apart on what a "list row" selects — see ADR 0037 on reusing
 *  existing per-model mapping rather than inventing a homepage-specific one.
 *
 *  `synthesisResult: { isNot: null }` is the "has a SynthesisResult" bound the ticket asks for —
 *  redundant with `status: 'COMPLETE'` in practice (an Analysis reaches COMPLETE only inside the
 *  same transaction that creates its SynthesisResult, `completeAnalysisWithSynthesis`), but kept
 *  explicit rather than assumed, since this read model is exactly the kind of place a reader
 *  should never see a COMPLETE-but-synthesis-less row even if that invariant were ever loosened. */
export async function findHomepageArticleRows(limit: number): Promise<AnalysisListRow[]> {
  const rows = await prisma.analysis.findMany({
    where: { status: 'COMPLETE', synthesisResult: { isNot: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    include: ANALYSIS_LIST_ROW_INCLUDE,
  })

  return rows.map(toAnalysisListRow)
}
