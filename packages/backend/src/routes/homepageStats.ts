import type { FastifyInstance } from 'fastify'
import * as homepageStatsService from '../services/homepageStatsService.js'

export function registerHomepageStatsRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/homepage/summary', async (_request, reply) => {
    const summary = await homepageStatsService.getHomepageSummaryStats()
    return reply.code(200).send(summary)
  })

  fastify.get('/api/homepage/minute', async (_request, reply) => {
    const items = await homepageStatsService.getHomepageMinuteFeed()
    return reply.code(200).send(items)
  })

  fastify.get('/api/homepage/contradictions', async (_request, reply) => {
    const items = await homepageStatsService.getHomepageContradictions()
    return reply.code(200).send(items)
  })

  fastify.get('/api/homepage/entities', async (_request, reply) => {
    const items = await homepageStatsService.getHomepageEntityStats()
    return reply.code(200).send(items)
  })
}
