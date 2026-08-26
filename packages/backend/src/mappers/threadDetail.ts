import type {
  AnalysisDimensions,
  EntityMentionItem,
  ThreadArticleRow,
  ThreadArticleTag,
  ThreadDetail,
  ThreadSourceRow,
  ThreadStatusLabel,
  ThreadTimelineItem,
} from '@news-triangulator/shared'
import type { ThreadDetailRow, ThreadStatus } from '../repositories/threadDetail.js'
import { resolveDisplayTitle } from './analysis.js'
import { mergeAgreementCategory } from '../services/synthesisPass.js'
import { interpretSourceOverlap } from '../services/sourceOverlap.js'
import { countValidExtractions } from '../services/extractionPass.js'

const THREAD_STATUS_MAP: Record<ThreadStatus, ThreadStatusLabel> = {
  ACTIVE: 'active',
  DORMANT: 'dormant',
  CLOSED: 'closed',
}

/** Every dimension `articleUrl` was cited under, across `agreement`/`contradiction`/
 *  `uniqueReporting` — never a fabricated percentage (ticket 65's grilling session), and never
 *  more than one tag per dimension even if a Coverage happens to be cited by more than one item
 *  within it. `framing` deliberately has no tag of its own — the design settled on these three. */
function tagsForArticleUrl(articleUrl: string, dimensions: AnalysisDimensions): ThreadArticleTag[] {
  const tags: ThreadArticleTag[] = []
  const cited = (items: { attributions: { articleUrl: string }[] }[]) =>
    items.some((item) => item.attributions.some((a) => a.articleUrl === articleUrl))

  if (cited(dimensions.agreement)) tags.push('agrees')
  if (cited(dimensions.contradiction)) tags.push('contradicts')
  if (cited(dimensions.uniqueReporting)) tags.push('unique')
  return tags
}

/** The dedicated Thread page's read model (ticket 68 / ADR 0037). `entities` is passed in
 *  separately (not part of `ThreadDetailRow`) — it's a union across every member's own Story,
 *  fetched via the existing `findEntityMentionsForStory` per-Story call, not a new query this
 *  mapper owns. */
export function toThreadDetail(thread: ThreadDetailRow, entities: EntityMentionItem[]): ThreadDetail {
  const timeline: ThreadTimelineItem[] = []
  // Keyed by articleUrl, not pushed straight to an array: the same real article can legitimately
  // be attached as Coverage to two different Thread members (Coverage uniqueness is only
  // per-Analysis, and Ingestion's URL dedup is a recency window, not permanent) — deduping here
  // merges any tags found under either member's dimensions rather than showing the same article
  // twice with a duplicate `articleUrl` key.
  const articlesByUrl = new Map<string, ThreadArticleRow>()
  const sourceCoverageCounts = new Map<string, number>()
  let agreementPercentageSum = 0
  let agreementPercentageCount = 0
  let contradictionCount = 0

  for (const member of thread.members) {
    const dimensions = mergeAgreementCategory(member.dimensions, member.agreementCategory)
    const validExtractionCount = countValidExtractions(member.coverages)
    contradictionCount += dimensions.contradiction.length
    if (member.sourceOverlapPercentage != null) {
      agreementPercentageSum += member.sourceOverlapPercentage
      agreementPercentageCount++
    }

    timeline.push({
      analysisId: member.analysisId,
      title: resolveDisplayTitle(member.headline, member.seedHeadline),
      eventTime: member.eventTime.toISOString(),
      sourceCount: validExtractionCount,
      sourceOverlap:
        member.sourceOverlapPercentage != null
          ? {
              percentage: member.sourceOverlapPercentage,
              sourceCount: validExtractionCount,
              tier: interpretSourceOverlap(member.sourceOverlapPercentage),
            }
          : undefined,
      agreementCategory: dimensions.agreementCategory,
    })

    for (const coverage of member.coverages) {
      const newTags = tagsForArticleUrl(coverage.articleUrl, dimensions)
      const existing = articlesByUrl.get(coverage.articleUrl)
      if (existing) {
        existing.tags = Array.from(new Set([...existing.tags, ...newTags]))
        continue
      }
      articlesByUrl.set(coverage.articleUrl, {
        outlet: coverage.sourceName,
        publishedAt: coverage.createdAt.toISOString(),
        title: coverage.title ?? undefined,
        articleUrl: coverage.articleUrl,
        tags: newTags,
      })
      sourceCoverageCounts.set(coverage.sourceName, (sourceCoverageCounts.get(coverage.sourceName) ?? 0) + 1)
    }
  }

  const sources: ThreadSourceRow[] = Array.from(sourceCoverageCounts.entries())
    .map(([outlet, coverageCount]) => ({ outlet, coverageCount }))
    .sort((a, b) => b.coverageCount - a.coverageCount)

  // The visible (COMPLETE) members' own span, not the raw Thread row's `firstEventAt`/
  // `lastEventAt` — those cover every graph member including any still-DRAFT/PENDING one that
  // never made it into `members` below, which would leak that a newer, unpublished development
  // exists (exactly what MIN_VISIBLE_MEMBERS/the COMPLETE filter is careful never to do). Safe to
  // index into `thread.members[0]`/`[length - 1]` for the span: it's already ordered oldest-first
  // (`position asc`, ticket 16/17's eventTime-derived ordering) by the repository query.
  const firstMember = thread.members[0]
  const lastMember = thread.members[thread.members.length - 1]

  return {
    title: thread.title,
    slug: thread.slug,
    status: THREAD_STATUS_MAP[thread.status],
    firstEventAt: (firstMember?.eventTime ?? thread.firstEventAt).toISOString(),
    lastEventAt: (lastMember?.eventTime ?? thread.lastEventAt).toISOString(),
    memberCount: thread.members.length,
    sourceCount: sourceCoverageCounts.size,
    averageAgreementPercentage:
      agreementPercentageCount > 0 ? Math.round(agreementPercentageSum / agreementPercentageCount) : null,
    contradictionCount,
    timeline,
    articles: Array.from(articlesByUrl.values()),
    sources,
    entities,
  }
}
