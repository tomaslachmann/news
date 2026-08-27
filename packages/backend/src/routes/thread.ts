import type { FastifyInstance } from 'fastify'
import { ListQuerySchema, PushSubscriptionBodySchema } from '@news-triangulator/shared'
import { ValidationError } from '../errors.js'
import * as threadDetailService from '../services/threadDetailService.js'
import * as threadFollowService from '../services/threadFollowService.js'

/** GET /api/thread/:slug (ticket 68), GET /api/threads (ticket 71), and the
 *  follow/unfollow-a-Thread pair (ticket 82) — all public, no auth, same posture as GET
 *  /api/analyses/:id's public/COMPLETE-only branch. This app has no reader login to scope a
 *  "follow" against, so it's per-browser (per Web Push subscription), not per-account. */
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

  fastify.post<{ Params: { slug: string } }>('/api/thread/:slug/follow', async (request, reply) => {
    const parsed = PushSubscriptionBodySchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatná push subscription')
    }

    await threadFollowService.followThread(request.params.slug, parsed.data)
    return reply.code(204).send()
  })

  fastify.post<{ Params: { slug: string } }>('/api/thread/:slug/unfollow', async (request, reply) => {
    const parsed = PushSubscriptionBodySchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatná push subscription')
    }

    await threadFollowService.unfollowThread(request.params.slug, parsed.data)
    return reply.code(204).send()
  })
}
