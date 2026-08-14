import type { FastifyInstance } from 'fastify'
import {
  PostAnalysisBodySchema,
  PostDiscoverBodySchema,
  PatchCoveragesBodySchema,
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

    const response = await analysisService.createAnalysis(parsed.data.seedUrl)
    return reply.code(201).send(response)
  })

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

      const response = await analysisService.confirmCoverages(request.params.id, parsed.data)
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
        log: request.log,
      })

      if (!reply.raw.writableEnded) reply.raw.end()
    }
  )

  // GET /api/analyses — return all analyses, newest first; Admins see every status,
  // everyone else (including unauthenticated readers) only sees completed ones
  fastify.get('/api/analyses', async (request, reply) => {
    const isAdmin = verifyAuthCookie(request)?.role === 'ADMIN'
    const response = await analysisService.listAnalyses(isAdmin)
    return reply.code(200).send(response)
  })

  // GET /api/analyses/:id — return analysis with its coverages
  fastify.get<{ Params: { id: string } }>('/api/analyses/:id', async (request, reply) => {
    const response = await analysisService.getAnalysisDetail(request.params.id, request.log)
    return reply.code(200).send(response)
  })
}
