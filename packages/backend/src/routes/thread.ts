import type { FastifyInstance } from 'fastify'
import { ListQuerySchema } from '@news-triangulator/shared'
import { ValidationError } from '../errors.js'
import * as threadDetailService from '../services/threadDetailService.js'

/** GET /api/thread/:slug (ticket 68) and GET /api/threads (ticket 71) — both public, no auth,
 *  same posture as GET /api/analyses/:id's public/COMPLETE-only branch. */
export function registerThreadRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { slug: string } }>('/api/thread/:slug', async (request, reply) => {
    const thread = await threadDetailService.getThreadDetail(request.params.slug)
    return reply.code(200).send(thread)
  })

  fastify.get('/api/threads', async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné parametry dotazu')
    }

    const response = await threadDetailService.getThreadsPage(parsed.data.cursor, parsed.data.limit)
    return reply.code(200).send(response)
  })
}
