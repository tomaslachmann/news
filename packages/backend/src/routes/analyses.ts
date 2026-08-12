import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../plugins/auth.js'
import { prisma } from '../db.js'
import { scrapeArticle, ScrapeError, type ScrapedArticle } from '../services/articleScraper.js'
import { extractKeywords } from '../services/keywordExtractor.js'
import { discoverCoverage } from '../services/discovery.js'
import type { CreateAnalysisResponse, CandidateArticle, AnalysisDetail, CoverageInfo } from '@news-triangulator/shared'

interface PostAnalysisBody {
  seedUrl: string
}

interface PostDiscoverBody {
  keywords: string[]
}

function coverageStatusToApi(s: string): CoverageInfo['status'] {
  if (s === 'OK') return 'ok'
  if (s === 'EXTRACTION_FAILED') return 'extraction-failed'
  return 'pending'
}

export async function registerAnalysesRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/analyses — create analysis from seed URL
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
      data: { seedUrl, seedHeadline: scraped.title, status: 'PENDING' },
    })

    const response: CreateAnalysisResponse = {
      id: analysis.id,
      seedHeadline: analysis.seedHeadline,
      keywords,
    }

    return reply.code(201).send(response)
  })

  // POST /api/analyses/:id/discover — run discovery and create Coverage rows
  fastify.post<{ Params: { id: string }; Body: PostDiscoverBody }>('/api/analyses/:id/discover', {
    preHandler: requireAdmin,
  }, async (request, reply) => {
    const { id } = request.params
    const { keywords } = request.body ?? {}

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return reply.code(400).send({ error: 'keywords array is required' })
    }

    const analysis = await prisma.analysis.findUnique({ where: { id } })
    if (!analysis) {
      return reply.code(404).send({ error: 'Analysis not found' })
    }

    const candidates = await discoverCoverage(keywords, fastify.log)

    if (candidates.length > 0) {
      await prisma.coverage.createMany({
        data: candidates.map((c: CandidateArticle) => ({
          analysisId: id,
          outlet: c.outlet,
          title: c.title,
          articleUrl: c.url,
          publishedAt: c.publishedAt,
          status: 'PENDING',
        })),
      })
    }

    return reply.code(200).send(candidates)
  })

  // GET /api/analyses/:id — return analysis with its coverages
  fastify.get<{ Params: { id: string } }>('/api/analyses/:id', async (request, reply) => {
    const { id } = request.params

    const analysis = await prisma.analysis.findUnique({
      where: { id },
      include: {
        coverages: { orderBy: { id: 'asc' } },
        synthesisResult: true,
      },
    })

    if (!analysis) {
      return reply.code(404).send({ error: 'Analysis not found' })
    }

    const response: AnalysisDetail = {
      id: analysis.id,
      seedUrl: analysis.seedUrl,
      seedHeadline: analysis.seedHeadline,
      createdAt: analysis.createdAt.toISOString(),
      status: analysis.status.toLowerCase() as AnalysisDetail['status'],
      coverages: analysis.coverages.map((c) => ({
        id: c.id,
        outlet: c.outlet,
        title: c.title ?? undefined,
        articleUrl: c.articleUrl,
        publishedAt: c.publishedAt ?? undefined,
        status: coverageStatusToApi(c.status),
      })),
      synthesisResult: analysis.synthesisResult
        ? (analysis.synthesisResult.dimensions as unknown as AnalysisDetail['synthesisResult'])
        : undefined,
    }

    return reply.code(200).send(response)
  })
}
