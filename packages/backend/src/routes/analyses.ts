import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../plugins/auth.js'
import { prisma } from '../db.js'
import { scrapeArticle, ScrapeError, type ScrapedArticle } from '../services/articleScraper.js'
import { extractKeywords } from '../services/keywordExtractor.js'
import { discoverCoverage } from '../services/discovery.js'
import type {
  CreateAnalysisResponse,
  CandidateArticle,
  AnalysisDetail,
  CoverageInfo,
  PatchCoveragesBody,
} from '@news-triangulator/shared'

const MIN_TEXT_LENGTH = 150

interface PostAnalysisBody { seedUrl: string }
interface PostDiscoverBody { keywords: string[] }

function coverageStatusToApi(s: string): CoverageInfo['status'] {
  if (s === 'OK') return 'ok'
  if (s === 'EXTRACTION_FAILED') return 'extraction-failed'
  return 'pending'
}

function toCoverageInfo(c: {
  id: string; outlet: string; title: string | null; articleUrl: string;
  publishedAt: string | null; status: string
}): CoverageInfo {
  return {
    id: c.id,
    outlet: c.outlet,
    title: c.title ?? undefined,
    articleUrl: c.articleUrl,
    publishedAt: c.publishedAt ?? undefined,
    status: coverageStatusToApi(c.status),
  }
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

    try { new URL(seedUrl) } catch {
      return reply.code(400).send({ error: 'seedUrl must be a valid URL' })
    }

    let scraped: ScrapedArticle
    try {
      scraped = await scrapeArticle(seedUrl)
    } catch (err) {
      return reply.code(422).send({
        error: err instanceof ScrapeError ? err.message : 'Failed to fetch the seed article',
      })
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
    if (!analysis) return reply.code(404).send({ error: 'Analysis not found' })

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

  // PATCH /api/analyses/:id/coverages — confirm selection, extract text, apply manual pastes
  fastify.patch<{ Params: { id: string }; Body: PatchCoveragesBody }>('/api/analyses/:id/coverages', {
    preHandler: requireAdmin,
  }, async (request, reply) => {
    const { id } = request.params
    const { confirmedIds, customUrls = [], manualTexts = [] } = request.body ?? {}

    if (!Array.isArray(confirmedIds)) {
      return reply.code(400).send({ error: 'confirmedIds array is required' })
    }

    const analysis = await prisma.analysis.findUnique({ where: { id } })
    if (!analysis) return reply.code(404).send({ error: 'Analysis not found' })

    // Apply manual texts immediately
    const manualMap = new Map(manualTexts.map((m) => [m.id, m.text]))
    if (manualMap.size > 0) {
      await Promise.all(
        [...manualMap.entries()].map(([covId, text]) =>
          prisma.coverage.update({
            where: { id: covId },
            data: { extractedText: text, status: 'OK' },
          })
        )
      )
    }

    // Delete coverages that were unchecked
    await prisma.coverage.deleteMany({
      where: { analysisId: id, id: { notIn: confirmedIds } },
    })

    // Create Coverage rows for custom URLs (skip if already present)
    const existing = await prisma.coverage.findMany({
      where: { analysisId: id },
      select: { articleUrl: true },
    })
    const existingUrls = new Set(existing.map((c) => c.articleUrl))

    const newUrls = customUrls.filter((u) => {
      try { new URL(u); return !existingUrls.has(u) } catch { return false }
    })

    if (newUrls.length > 0) {
      await prisma.coverage.createMany({
        data: newUrls.map((u) => ({
          analysisId: id,
          outlet: new URL(u).hostname.replace(/^www\./, ''),
          articleUrl: u,
          status: 'PENDING',
        })),
      })
    }

    // Fetch + parse all still-PENDING coverages in parallel
    const pending = await prisma.coverage.findMany({
      where: { analysisId: id, status: 'PENDING' },
    })

    await Promise.allSettled(
      pending.map(async (coverage) => {
        try {
          const scraped = await scrapeArticle(coverage.articleUrl)
          const isPaywalled = scraped.fullText.length < MIN_TEXT_LENGTH
          if (isPaywalled) {
            await prisma.coverage.update({
              where: { id: coverage.id },
              data: { status: 'EXTRACTION_FAILED' },
            })
          } else {
            await prisma.coverage.update({
              where: { id: coverage.id },
              data: { extractedText: scraped.fullText, status: 'OK' },
            })
          }
        } catch {
          await prisma.coverage.update({
            where: { id: coverage.id },
            data: { status: 'EXTRACTION_FAILED' },
          })
        }
      })
    )

    const updated = await prisma.coverage.findMany({
      where: { analysisId: id },
      orderBy: { id: 'asc' },
    })

    const response: CoverageInfo[] = updated.map(toCoverageInfo)
    return reply.code(200).send(response)
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

    if (!analysis) return reply.code(404).send({ error: 'Analysis not found' })

    const response: AnalysisDetail = {
      id: analysis.id,
      seedUrl: analysis.seedUrl,
      seedHeadline: analysis.seedHeadline,
      createdAt: analysis.createdAt.toISOString(),
      status: analysis.status.toLowerCase() as AnalysisDetail['status'],
      coverages: analysis.coverages.map(toCoverageInfo),
      synthesisResult: analysis.synthesisResult
        ? (analysis.synthesisResult.dimensions as unknown as AnalysisDetail['synthesisResult'])
        : undefined,
    }

    return reply.code(200).send(response)
  })
}
