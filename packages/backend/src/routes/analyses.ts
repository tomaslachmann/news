import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../plugins/auth.js'
import { prisma } from '../db.js'
import { scrapeArticle, ScrapeError, type ScrapedArticle } from '../services/articleScraper.js'
import { extractKeywords } from '../services/keywordExtractor.js'
import type { CreateAnalysisResponse } from '@news-triangulator/shared'

interface PostAnalysisBody {
  seedUrl: string
}

export async function registerAnalysesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: PostAnalysisBody }>('/api/analyses', {
    preHandler: requireAdmin,
  }, async (request, reply) => {
    const { seedUrl } = request.body ?? {}

    if (!seedUrl || typeof seedUrl !== 'string') {
      return reply.code(400).send({ error: 'seedUrl is required' })
    }

    try {
      new URL(seedUrl)
    } catch {
      return reply.code(400).send({ error: 'seedUrl must be a valid URL' })
    }

    let scraped: ScrapedArticle
    try {
      scraped = await scrapeArticle(seedUrl)
    } catch (err) {
      const message = err instanceof ScrapeError
        ? err.message
        : 'Failed to fetch the seed article'
      return reply.code(422).send({ error: message })
    }

    let keywords: string[]
    try {
      keywords = await extractKeywords(scraped.title, scraped.excerpt)
    } catch {
      return reply.code(422).send({ error: 'Failed to extract keywords from the article' })
    }

    const analysis = await prisma.analysis.create({
      data: {
        seedUrl,
        seedHeadline: scraped.title,
        status: 'PENDING',
      },
    })

    const response: CreateAnalysisResponse = {
      id: analysis.id,
      seedHeadline: analysis.seedHeadline,
      keywords,
    }

    return reply.code(201).send(response)
  })
}
