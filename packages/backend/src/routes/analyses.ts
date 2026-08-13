import type { FastifyInstance } from 'fastify'
import type { Coverage, CoverageStatus } from '@prisma/client'
import { requireAdmin } from '../plugins/auth.js'
import { prisma } from '../db.js'
import {
  scrapeArticle,
  ScrapeError,
  MIN_TEXT_LENGTH,
  type ScrapedArticle,
} from '../services/articleScraper.js'
import { extractKeywords } from '../services/keywordExtractor.js'
import { discoverCoverage } from '../services/discovery.js'
import { runExtractionPass, ExtractionResultSchema } from '../services/extractionPass.js'
import { runSynthesisPass, type SourceExtraction } from '../services/synthesisPass.js'
import type {
  CreateAnalysisResponse,
  CandidateArticle,
  AnalysisDetail,
  AnalysisDimensions,
  CoverageInfo,
  PatchCoveragesBody,
  SseEvent,
} from '@news-triangulator/shared'

interface PostAnalysisBody {
  seedUrl: string
}
interface PostDiscoverBody {
  keywords: string[]
}

const COVERAGE_STATUS_MAP: Record<CoverageStatus, CoverageInfo['status']> = {
  OK: 'ok',
  EXTRACTION_FAILED: 'extraction-failed',
  PENDING: 'pending',
}

function coverageStatusToApi(s: CoverageStatus): CoverageInfo['status'] {
  return COVERAGE_STATUS_MAP[s]
}

function toCoverageInfo(c: Coverage): CoverageInfo {
  return {
    id: c.id,
    outlet: c.outlet,
    title: c.title ?? undefined,
    articleUrl: c.articleUrl,
    publishedAt: c.publishedAt ?? undefined,
    status: coverageStatusToApi(c.status),
  }
}

export function registerAnalysesRoutes(fastify: FastifyInstance): void {
  // POST /api/analyses — create analysis from seed URL
  fastify.post<{ Body: PostAnalysisBody }>(
    '/api/analyses',
    {
      preHandler: requireAdmin,
    },
    async (request, reply) => {
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
    }
  )

  // POST /api/analyses/:id/discover — run discovery and create Coverage rows
  fastify.post<{ Params: { id: string }; Body: PostDiscoverBody }>(
    '/api/analyses/:id/discover',
    {
      preHandler: requireAdmin,
    },
    async (request, reply) => {
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
    }
  )

  // PATCH /api/analyses/:id/coverages — confirm selection, extract text, apply manual pastes
  fastify.patch<{ Params: { id: string }; Body: PatchCoveragesBody }>(
    '/api/analyses/:id/coverages',
    {
      preHandler: requireAdmin,
    },
    async (request, reply) => {
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

      // Soft-exclude coverages that were unchecked
      await prisma.coverage.updateMany({
        where: { analysisId: id, id: { notIn: confirmedIds } },
        data: { excluded: true },
      })
      // Re-include any that are now confirmed (handles re-confirm flows)
      await prisma.coverage.updateMany({
        where: { analysisId: id, id: { in: confirmedIds } },
        data: { excluded: false },
      })

      // Create Coverage rows for custom URLs (skip if already present)
      const existing = await prisma.coverage.findMany({
        where: { analysisId: id },
        select: { articleUrl: true },
      })
      const existingUrls = new Set(existing.map((c) => c.articleUrl))

      const newUrls = customUrls.filter((u) => {
        try {
          new URL(u)
          return !existingUrls.has(u)
        } catch {
          return false
        }
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

      // Fetch + parse all still-PENDING non-excluded coverages in parallel
      const pending = await prisma.coverage.findMany({
        where: { analysisId: id, status: 'PENDING', excluded: false },
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
        where: { analysisId: id, excluded: false },
        orderBy: { id: 'asc' },
      })

      const response: CoverageInfo[] = updated.map(toCoverageInfo)
      return reply.code(200).send(response)
    }
  )

  // GET /api/analyses/:id/stream — SSE stream for extraction + synthesis progress
  fastify.get<{ Params: { id: string } }>(
    '/api/analyses/:id/stream',
    {
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const { id } = request.params

      const analysis = await prisma.analysis.findUnique({ where: { id } })
      if (!analysis) return reply.code(404).send({ error: 'Analysis not found' })

      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.setHeader('X-Accel-Buffering', 'no')
      reply.raw.flushHeaders()

      const send = (event: SseEvent) => {
        if (reply.raw.writableEnded) return
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      }

      const coverages = await prisma.coverage.findMany({
        where: { analysisId: id, excluded: false },
        orderBy: { id: 'asc' },
      })

      send({ type: 'sources-confirmed', coverages: coverages.map(toCoverageInfo) })

      const extractable = coverages.filter((c) => c.status === 'OK')
      const unavailable = coverages.filter((c) => c.status !== 'OK')
      for (const c of unavailable) {
        send({
          type: 'extraction-error',
          coverageId: c.id,
          outlet: c.outlet,
          error: 'No article text available',
        })
      }

      // Keep stream alive until client disconnects; synthesis appends to it in ticket 07
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve)

        void Promise.allSettled(
          extractable.map(async (coverage) => {
            // Already extracted in a previous stream session — re-emit the complete event
            if (coverage.extractionResult) {
              const result = ExtractionResultSchema.safeParse(coverage.extractionResult)
              if (result.success) {
                send({
                  type: 'extraction-complete',
                  coverageId: coverage.id,
                  outlet: coverage.outlet,
                  claimCount: result.data.factualClaims.length,
                  attributedClaimCount: result.data.attributedClaims.length,
                  framingSignalCount: result.data.framingSignals.length,
                })
                return
              }
            }

            try {
              const extraction = await runExtractionPass(coverage.extractedText!)
              await prisma.coverage.update({
                where: { id: coverage.id },
                data: { extractionResult: extraction },
              })
              send({
                type: 'extraction-complete',
                coverageId: coverage.id,
                outlet: coverage.outlet,
                claimCount: extraction.factualClaims.length,
                attributedClaimCount: extraction.attributedClaims.length,
                framingSignalCount: extraction.framingSignals.length,
              })
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Extraction failed'
              send({
                type: 'extraction-error',
                coverageId: coverage.id,
                outlet: coverage.outlet,
                error: message,
              })
            }
          })
        ).then(async () => {
          send({ type: 'extraction-settled' })

          // Re-use cached synthesis result if the stream is reconnected
          const cached = await prisma.synthesisResult.findUnique({ where: { analysisId: id } })
          if (cached) {
            send({
              type: 'synthesis-complete',
              dimensions: cached.dimensions as unknown as AnalysisDimensions,
            })
            resolve()
            return
          }

          // Build source list from coverages that have a validated extraction result
          const extracted = await prisma.coverage.findMany({
            where: { analysisId: id, excluded: false, status: 'OK' },
            orderBy: { id: 'asc' },
          })

          let droppedCount = 0
          const sources: SourceExtraction[] = []
          for (const c of extracted) {
            const parsed = ExtractionResultSchema.safeParse(c.extractionResult)
            if (parsed.success) {
              sources.push({ outlet: c.outlet, articleUrl: c.articleUrl, extraction: parsed.data })
            } else {
              droppedCount++
              request.log.warn(
                { coverageId: c.id },
                'Coverage extractionResult failed schema validation; excluding from synthesis'
              )
            }
          }

          const excludedCount = coverages.filter((c) => c.status !== 'OK').length + droppedCount

          if (sources.length === 0) {
            send({ type: 'synthesis-error', error: 'No successful extractions to synthesise' })
            await prisma.analysis.update({ where: { id }, data: { status: 'FAILED' } })
            if (!reply.raw.writableEnded) reply.raw.end()
            resolve()
            return
          }

          try {
            const synthesis = await runSynthesisPass(sources, excludedCount)

            await prisma.$transaction([
              prisma.synthesisResult.upsert({
                where: { analysisId: id },
                create: { analysisId: id, dimensions: synthesis },
                update: { dimensions: synthesis },
              }),
              prisma.analysis.update({ where: { id }, data: { status: 'COMPLETE' } }),
            ])

            send({ type: 'synthesis-complete', dimensions: synthesis })
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Synthesis failed'
            send({ type: 'synthesis-error', error: message })
            await prisma.analysis.update({ where: { id }, data: { status: 'FAILED' } }).catch(() => {})
          } finally {
            if (!reply.raw.writableEnded) reply.raw.end()
            resolve()
          }
        })
      })
    }
  )

  // GET /api/analyses/:id — return analysis with its coverages
  fastify.get<{ Params: { id: string } }>('/api/analyses/:id', async (request, reply) => {
    const { id } = request.params

    const analysis = await prisma.analysis.findUnique({
      where: { id },
      include: {
        coverages: { where: { excluded: false }, orderBy: { id: 'asc' } },
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
