import type { ThreadSummaryItem } from '@news-triangulator/shared'
import type { ThreadForReader } from '../repositories/thread.js'
import { resolveDisplayTitle } from './analysis.js'

/** ticket 17's reader surface — `COMPLETE`-only members (same convention `toRelatedEvents`
 *  already applies), each side's title resolved the same way every other Analysis title is
 *  (`resolveDisplayTitle`). Deliberately drops `role` — see ticket 17's Answer, Q2.
 *  `memberCount` is the *visible* (COMPLETE) count, not the Thread's raw total — reporting a
 *  bigger number than the list actually shows would be a confusing mismatch a reader can't
 *  resolve. */
export function toThreadSummary(currentAnalysisId: string, thread: ThreadForReader): ThreadSummaryItem {
  const members = thread.members
    .filter((m) => m.status === 'COMPLETE')
    .map((m) => ({
      analysisId: m.analysisId,
      title: resolveDisplayTitle(m.headline, m.seedHeadline),
      isCurrent: m.analysisId === currentAnalysisId,
    }))

  return { title: thread.title, slug: thread.slug, memberCount: members.length, members }
}
