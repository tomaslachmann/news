import type { AnalysisListItem } from '@news-triangulator/shared'
import * as analysisRepo from '../repositories/analysis.js'
import { toAnalysisListItem } from '../mappers/analysis.js'

// Same value entityService.ts's own ENTITY_SEARCH_RESULT_LIMIT uses, and DEFAULT_PAGE_SIZE — a
// bounded top-N, not paginated (a relevance ranking doesn't compose with "load more" the way a
// newest-first feed does; see the ticket's own Answer).
const SEARCH_RESULT_LIMIT = 20

/** Public content search (ticket 83) — ranked (Postgres `ts_rank`) COMPLETE Analyses whose
 *  synthesized content (headline + every Dimension's `prose`, `buildSearchText`/
 *  `SynthesisResult.searchText`) matches `query`. Same `AnalysisListItem` row shape as
 *  `/articles`/`/category/:slug`, so a search result row looks and behaves identically. */
export async function searchArticles(query: string): Promise<AnalysisListItem[]> {
  const rows = await analysisRepo.findAnalysesBySearch(query, SEARCH_RESULT_LIMIT)
  return rows.map(toAnalysisListItem)
}
