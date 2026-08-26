import type { FastifyInstance } from 'fastify'
import * as threadDetailService from '../services/threadDetailService.js'

/** GET /api/thread/:slug — the dedicated Thread page's read model (ticket 68), public, no auth,
 *  same posture as GET /api/analyses/:id's public/COMPLETE-only branch. */
export function registerThreadRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { slug: string } }>('/api/thread/:slug', async (request, reply) => {
    const thread = await threadDetailService.getThreadDetail(request.params.slug)
    return reply.code(200).send(thread)
  })
}
