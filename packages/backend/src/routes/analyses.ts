import type { FastifyInstance } from 'fastify'
import {
  PostAnalysisBodySchema,
  PostAttachSeedBodySchema,
  PostDiscoverBodySchema,
  PatchCoveragesBodySchema,
  ListQuerySchema,
} from '@news-triangulator/shared'
import { requireAdmin, verifyAuthCookie } from '../plugins/auth.js'
import { ValidationError } from '../errors.js'
import * as analysisService from '../services/analysisService.js'
import { runAnalysisStream } from '../services/analysisStream.js'

export function registerAnalysesRoutes(fastify: FastifyInstance): void {
  // POST /api/analyses — create analysis from seed URL
  fastify.post('/api/analyses', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = PostAnalysisBodySchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné tělo požadavku')
    }

    const response = await analysisService.createAnalysis(
      parsed.data.seedUrl,
      verifyAuthCookie(request)!.userId,
      { force: parsed.data.force },
      fastify.log
    )
    // 'matched' creates nothing — 200, not 201, since no new resource exists.
    return reply.code(response.outcome === 'created' ? 201 : 200).send(response)
  })

  // POST /api/analyses/:id/attach-seed — "continue with this match" from a dedup match on
  // submission (ticket 27): attaches the seed as Coverage instead of creating a duplicate
  fastify.post<{ Params: { id: string } }>(
    '/api/analyses/:id/attach-seed',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = PostAttachSeedBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné tělo požadavku')
      }

      await analysisService.attachSeedToMatch(
        request.params.id,
        parsed.data.seedUrl,
        verifyAuthCookie(request)!.userId,
        fastify.log
      )
      return reply.code(204).send()
    }
  )

  // POST /api/analyses/:id/discover — run discovery and create Coverage rows
  fastify.post<{ Params: { id: string } }>(
    '/api/analyses/:id/discover',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = PostDiscoverBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné tělo požadavku')
      }

      const candidates = await analysisService.discoverSources(
        request.params.id,
        parsed.data.keywords,
        verifyAuthCookie(request)!.userId,
        fastify.log
      )
      return reply.code(200).send(candidates)
    }
  )

  // PATCH /api/analyses/:id/coverages — confirm selection, extract text, apply manual pastes
  fastify.patch<{ Params: { id: string } }>(
    '/api/analyses/:id/coverages',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = PatchCoveragesBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné tělo požadavku')
      }

      const response = await analysisService.confirmCoverages(
        request.params.id,
        parsed.data,
        verifyAuthCookie(request)!.userId,
        fastify.log
      )
      return reply.code(200).send(response)
    }
  )

  // GET /api/analyses/:id/stream — SSE stream for extraction + synthesis progress
  fastify.get<{ Params: { id: string } }>(
    '/api/analyses/:id/stream',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await runAnalysisStream(request.params.id, {
        onReady: () => {
          reply.raw.setHeader('Content-Type', 'text/event-stream')
          reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
          reply.raw.setHeader('Connection', 'keep-alive')
          reply.raw.setHeader('X-Accel-Buffering', 'no')
          reply.raw.flushHeaders()
        },
        send: (event) => {
          if (!reply.raw.writableEnded) {
            reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
          }
        },
        onClientClose: (handler) => request.raw.on('close', handler),
        actorId: verifyAuthCookie(request)!.userId,
        log: request.log,
      })

      if (!reply.raw.writableEnded) reply.raw.end()
    }
  )

  // GET /api/articles — public, COMPLETE-only article listing for reader-facing surfaces
  fastify.get('/api/articles', async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné parametry dotazu')
    }

    const response = await analysisService.listAnalyses(false, parsed.data.cursor, parsed.data.limit)
    return reply.code(200).send(response)
  })

  // GET /api/analyses — keyset-paginated admin/internal analysis listing, newest first
  fastify.get('/api/analyses', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné parametry dotazu')
    }

    const response = await analysisService.listAnalyses(true, parsed.data.cursor, parsed.data.limit)
    return reply.code(200).send(response)
  })

  // GET /api/analyses/:id — return analysis with its coverages. Non-Admin (including
  // unauthenticated) callers only ever see a COMPLETE Analysis — see getAnalysisDetail's own
  // docstring (ticket 52).
  fastify.get<{ Params: { id: string } }>('/api/analyses/:id', async (request, reply) => {
    const isAdmin = verifyAuthCookie(request)?.role === 'ADMIN'
    const response = await analysisService.getAnalysisDetail(request.params.id, isAdmin)
    return reply.code(200).send(response)
  })

  // POST /api/analyses/:id/view — records one anonymous "read" event (ticket 61), public, no
  // auth, no body. A no-op for a missing/non-complete id, same "never leak existence via this
  // response" posture as GET /api/analyses/:id — see recordAnalysisView's own docstring.
  fastify.post<{ Params: { id: string } }>('/api/analyses/:id/view', async (request, reply) => {
    await analysisService.recordAnalysisView(request.params.id)
    return reply.code(204).send()
  })
}
