import { Prisma } from '@prisma/client'
import type { Cursor } from '../pagination.js'

/** Row-tuple comparison for a raw-SQL keyset page ordered by `(createdAt, id) DESC` over a table
 *  aliased `a` — the literal fragment `findDraftsPage` (analysis.ts) and `findEventsForEntity`
 *  (entity.ts) each need identically, extracted here (code review, ticket 42) so a future fix to
 *  the boundary comparison can't land at one call site and not the other. Lives in repositories/
 *  rather than ../pagination.ts because it needs `Prisma.sql`, and only repositories/ may import
 *  `@prisma/client` (ADR 0010). */
export function keysetSqlWhere(cursor: Cursor | undefined): Prisma.Sql {
  return cursor
    ? Prisma.sql`AND (a."createdAt" < ${cursor.createdAt} OR (a."createdAt" = ${cursor.createdAt} AND a.id < ${cursor.id}))`
    : Prisma.empty
}
