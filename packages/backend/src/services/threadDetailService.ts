import type { ThreadDetail } from '@news-triangulator/shared'
import { NotFoundError } from '../errors.js'
import * as threadDetailRepo from '../repositories/threadDetail.js'
import * as entityRepo from '../repositories/entity.js'
import { toThreadDetail } from '../mappers/threadDetail.js'
import { toEntityMentionItem } from '../mappers/analysis.js'

/** Minimum visible (COMPLETE) member count for a Thread page to be worth showing — same gate
 *  `getAnalysisDetail`/`toThreadSummary` already apply to the inline ArticlePage surface (ticket
 *  17's Answer, Q3). Never-leak-existence: an unknown slug and a Thread that's dropped below this
 *  threshold both 404 identically. */
const MIN_VISIBLE_MEMBERS = 2

export async function getThreadDetail(slug: string): Promise<ThreadDetail> {
  const thread = await threadDetailRepo.findThreadDetailBySlug(slug)
  if (!thread || thread.members.length < MIN_VISIBLE_MEMBERS) {
    throw new NotFoundError('Vlákno nenalezeno')
  }

  const entityMentions = await entityRepo.findEntityMentionsForStories(thread.members.map((m) => m.storyId))
  const entities = dedupeEntities(entityMentions.map(toEntityMentionItem))

  return toThreadDetail(thread, entities)
}

function dedupeEntities<T extends { key: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}
