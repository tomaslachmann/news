import type { Source, SourceFeed } from '@prisma/client'
import { prisma } from '../db.js'

export type { Source }

/** Every known Source, for in-memory suffix matching in resolveSource() — small (curated outlet
 *  count), so one query beats a per-lookup SQL domain match. */
export async function findAllSources(): Promise<Source[]> {
  return prisma.source.findMany()
}

/** Not-yet-configured domain (e.g. GDELT surfacing an outlet outside the curated RSS list) —
 *  upsert, not create, so two concurrent callers resolving the same brand-new domain can't race
 *  into a duplicate Source (name is unique). Named for the raw domain until an admin renames it. */
export async function findOrCreateUnverifiedSource(domain: string): Promise<Source> {
  return prisma.source.upsert({
    where: { name: domain },
    update: {},
    create: { name: domain, domains: [domain] },
  })
}

export interface SourceFeedWithSource extends SourceFeed {
  source: Source
}

export async function findAllSourceFeeds(): Promise<SourceFeedWithSource[]> {
  return prisma.sourceFeed.findMany({ include: { source: true } })
}
