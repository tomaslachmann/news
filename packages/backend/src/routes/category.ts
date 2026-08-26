import type { FastifyInstance } from 'fastify'
import { ListQuerySchema } from '@news-triangulator/shared'
import { ValidationError } from '../errors.js'
import * as categoryBrowseService from '../services/categoryBrowseService.js'

/** GET /api/category/:category (ticket 80) — public, no auth, same posture as GET /api/articles
 *  and GET /api/threads: real, findable content, not a monitoring view. */
export function registerCategoryRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { category: string } }>('/api/category/:category', async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné parametry dotazu')
    }

    const response = await categoryBrowseService.listAnalysesByCategory(
      request.params.category,
      parsed.data.cursor,
      parsed.data.limit
    )
    return reply.code(200).send(response)
  })
}
