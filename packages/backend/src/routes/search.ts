import type { FastifyInstance } from 'fastify'
import { SearchQuerySchema } from '@news-triangulator/shared'
import { ValidationError } from '../errors.js'
import * as searchService from '../services/searchService.js'

/** GET /api/search?q=... (ticket 83) — public, no auth, same posture as /api/articles and
 *  /api/entities. Content search alongside SearchPage.tsx's existing entity search, not a
 *  replacement for it — the two are independent result sets for the same query. */
export function registerSearchRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/search', async (request, reply) => {
    const parsed = SearchQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné parametry dotazu')
    }

    const results = await searchService.searchArticles(parsed.data.q)
    return reply.code(200).send(results)
  })
}
