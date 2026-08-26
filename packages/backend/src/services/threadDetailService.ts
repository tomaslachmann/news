import type { HomepageThreadItem, Page, ThreadDetail } from '@news-triangulator/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@news-triangulator/shared'
import { NotFoundError, ValidationError } from '../errors.js'
import * as threadDetailRepo from '../repositories/threadDetail.js'
import * as threadRepo from '../repositories/thread.js'
import * as entityRepo from '../repositories/entity.js'
import * as claimSeriesRepo from '../repositories/claimSeries.js'
import { toThreadDetail } from '../mappers/threadDetail.js'
import { toHomepageThreadItem } from '../mappers/homepageStats.js'
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

  const [entityMentions, claimSeries] = await Promise.all([
    entityRepo.findEntityMentionsForStories(thread.members.map((m) => m.storyId)),
    claimSeriesRepo.findClaimSeriesForThread(thread.id),
  ])
  const entities = dedupeEntities(entityMentions.map(toEntityMentionItem))

  return toThreadDetail(thread, entities, claimSeries)
}

function dedupeEntities<T extends { key: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}

/** Ticket 71's `/api/threads` browse-all listing cursor — a plain offset into
 *  `findVisibleThreadsRanked`'s already-fully-fetched, in-memory-sorted array, not this
 *  codebase's usual keyset `(createdAt, id)` cursor (`pagination.ts`'s `encodeCursor`/`Cursor`):
 *  `Thread` has no `createdAt` column, and the visibility gate that decides ranking in the first
 *  place can't be expressed as a SQL `where` anyway (ticket 70). Keyset pagination's real
 *  advantage — staying stable as new rows are inserted between page fetches — matters far less for
 *  a table this rare (only actual FOLLOW_UP chains materialize a Thread) than the complexity of
 *  forcing a fake `createdAt` onto a model that doesn't have one. Opaque to the client regardless,
 *  same as the keyset cursor's own base64url encoding. */
function encodeOffsetCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64url')
}

function decodeOffsetCursor(raw: string): number {
  const offset = Number.parseInt(Buffer.from(raw, 'base64url').toString(), 10)
  if (!Number.isInteger(offset) || offset < 0) throw new ValidationError('Neplatný cursor')
  return offset
}

/** `/api/threads` — every currently-visible Thread (>= 2 COMPLETE members), most recently updated
 *  first, `ACTIVE`/`DORMANT`/`CLOSED` all included (a closed arc is still worth reading). Reuses
 *  `HomepageThreadItem`'s row shape (ticket 70) — the browse-all list and the homepage teaser show
 *  the same fields, so a second, near-identical type would only invite drift. */
export async function getThreadsPage(
  cursor: string | undefined,
  limit = DEFAULT_PAGE_SIZE
): Promise<Page<HomepageThreadItem>> {
  const offset = cursor ? decodeOffsetCursor(cursor) : 0
  const boundedLimit = Math.min(limit, MAX_PAGE_SIZE)

  const ranked = await threadRepo.findVisibleThreadsRanked()
  const page = ranked.slice(offset, offset + boundedLimit)
  const hasMore = offset + boundedLimit < ranked.length

  return {
    items: page.map(toHomepageThreadItem),
    nextCursor: hasMore ? encodeOffsetCursor(offset + boundedLimit) : null,
  }
}
