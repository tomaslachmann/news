import type { CoverageStatus, SynthesisAgreementCategory, ThreadStatus } from '@prisma/client'
import { prisma } from '../db.js'

export type { ThreadStatus }

export interface ThreadDetailCoverageRow {
  articleUrl: string
  title: string | null
  createdAt: Date
  sourceName: string
  /** `status`/`extractionResult` are never surfaced directly on the Thread page — they only feed
   *  `countValidExtractions` (mappers/threadDetail.ts), the same "was this Coverage's extraction
   *  schema-valid" check every other `sourceOverlap.sourceCount` in this codebase uses. */
  status: CoverageStatus
  extractionResult: unknown
}

/** One Thread member, raw — the mapper (mappers/threadDetail.ts) resolves the display title
 *  (`resolveDisplayTitle`) and merges `agreementCategory` into `dimensions`
 *  (`mergeAgreementCategory`), same as every other Analysis-derived read model in this codebase.
 *  Only COMPLETE members with a SynthesisResult are included — the same "nothing for a reader to
 *  navigate to otherwise" gate `toThreadSummary` already applies to the inline ArticlePage
 *  surface (ticket 17's Answer, Q3). */
export interface ThreadDetailMemberRow {
  analysisId: string
  storyId: string
  seedHeadline: string
  headline: string | null
  eventTime: Date
  dimensions: unknown
  agreementCategory: SynthesisAgreementCategory
  sourceOverlapPercentage: number | null
  coverages: ThreadDetailCoverageRow[]
}

export interface ThreadDetailRow {
  id: string
  title: string
  slug: string
  status: ThreadStatus
  firstEventAt: Date
  lastEventAt: Date
  /** Ticket 67/74's open-questions synthesis, raw — see `mappers/threadDetail.ts` for the cast
   *  into `ThreadOpenQuestionItem[]`. `[]` (never null) until `thread.synthesizeOpenQuestions` has
   *  run at least once for this Thread — see `Thread.openQuestions`'s own schema default. */
  openQuestions: unknown
  members: ThreadDetailMemberRow[]
}

/** The dedicated Thread page's full read model (ticket 68 / ADR 0037). `null` for an unknown slug
 *  — the service layer additionally 404s when fewer than 2 members survive the COMPLETE filter,
 *  matching `findThreadForStory`/`toThreadSummary`'s existing never-leak-existence posture for
 *  the inline ArticlePage surface. Coverage is scoped to `status: 'OK', excluded: false` per
 *  member, same predicate `ANALYSIS_LIST_ROW_INCLUDE` uses — a Coverage that never made it into
 *  the published Article has nothing to show on this page either. */
export async function findThreadDetailBySlug(slug: string): Promise<ThreadDetailRow | null> {
  const thread = await prisma.thread.findUnique({
    where: { slug },
    include: {
      members: {
        orderBy: { position: 'asc' },
        include: {
          story: {
            include: {
              analysis: {
                include: {
                  synthesisResult: {
                    select: {
                      headline: true,
                      dimensions: true,
                      agreementCategory: true,
                      sourceOverlapPercentage: true,
                    },
                  },
                  coverages: {
                    where: { status: 'OK', excluded: false },
                    orderBy: { id: 'asc' },
                    select: {
                      articleUrl: true,
                      title: true,
                      createdAt: true,
                      status: true,
                      extractionResult: true,
                      source: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!thread) return null

  const members: ThreadDetailMemberRow[] = []
  for (const m of thread.members) {
    const analysis = m.story.analysis
    if (!analysis || analysis.status !== 'COMPLETE' || !analysis.synthesisResult) continue
    members.push({
      analysisId: analysis.id,
      storyId: m.storyId,
      seedHeadline: analysis.seedHeadline,
      headline: analysis.synthesisResult.headline,
      eventTime: m.story.eventTime ?? m.story.createdAt,
      dimensions: analysis.synthesisResult.dimensions,
      agreementCategory: analysis.synthesisResult.agreementCategory,
      sourceOverlapPercentage: analysis.synthesisResult.sourceOverlapPercentage,
      coverages: analysis.coverages.map((c) => ({
        articleUrl: c.articleUrl,
        title: c.title,
        createdAt: c.createdAt,
        sourceName: c.source.name,
        status: c.status,
        extractionResult: c.extractionResult,
      })),
    })
  }

  return {
    id: thread.id,
    title: thread.title,
    slug: thread.slug,
    status: thread.status,
    firstEventAt: thread.firstEventAt,
    lastEventAt: thread.lastEventAt,
    openQuestions: thread.openQuestions,
    members,
  }
}
