import type { FastifyInstance } from 'fastify'
import * as homepageStatsService from '../services/homepageStatsService.js'

export function registerHomepageStatsRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/homepage/entities', async (_request, reply) => {
    const items = await homepageStatsService.getHomepageEntityStats()
    return reply.code(200).send(items)
  })
}
