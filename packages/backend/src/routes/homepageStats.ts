import type { FastifyInstance } from 'fastify'
import * as homepageStatsService from '../services/homepageStatsService.js'
import * as homepageArticlesService from '../services/homepageArticlesService.js'

export function registerHomepageStatsRoutes(fastify: FastifyInstance): void {
  // Public, no Admin/auth middleware (ticket 62) — same posture every other /api/homepage/*
  // route already takes.
  fastify.get('/api/homepage/articles', async (_request, reply) => {
    const articles = await homepageArticlesService.getHomepageArticles()
    return reply.code(200).send(articles)
  })

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

  fastify.get('/api/homepage/most-read', async (_request, reply) => {
    const items = await homepageStatsService.getHomepageMostRead()
    return reply.code(200).send(items)
  })
}
