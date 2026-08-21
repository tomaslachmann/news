import type { FastifyInstance } from 'fastify'
import { ListQuerySchema } from '@news-triangulator/shared'
import { requireAdmin, verifyAuthCookie } from '../plugins/auth.js'
import { requireIngestionSecret } from '../plugins/ingestionAuth.js'
import { ValidationError } from '../errors.js'
import * as ingestionService from '../services/ingestionService.js'

export function registerIngestionRoutes(fastify: FastifyInstance): void {
  // POST /api/ingestion/run — triggers one Ingestion pass; called by an external scheduler, not a browser
  fastify.post('/api/ingestion/run', { preHandler: requireIngestionSecret }, async (request, reply) => {
    const summary = await ingestionService.runIngestionPass(request.log)
    return reply.code(200).send(summary)
  })

  // GET /api/admin/ingestion/pending-additions — candidate Coverages found for already-COMPLETE Analyses
  fastify.get(
    '/api/admin/ingestion/pending-additions',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = ListQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné parametry dotazu')
      }

      const page = await ingestionService.listPendingAdditions(parsed.data.cursor, parsed.data.limit)
      return reply.code(200).send(page)
    }
  )

  // GET /api/admin/ingestion/drafts — Drafts that have crossed the visibility threshold (ADR 0018)
  fastify.get('/api/admin/ingestion/drafts', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné parametry dotazu')
    }

    const page = await ingestionService.listVisibleDrafts(parsed.data.cursor, parsed.data.limit)
    return reply.code(200).send(page)
  })

  // PATCH /api/admin/ingestion/drafts/:id/approve — DRAFT → PENDING, proceeds through the existing Review Step
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/ingestion/drafts/:id/approve',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await ingestionService.approveDraft(request.params.id, verifyAuthCookie(request)!.userId, request.log)
      return reply.code(200).send({ ok: true })
    }
  )

  // PATCH /api/admin/ingestion/drafts/:id/reject — DRAFT → FAILED, marked (not deleted) so it isn't re-ingested
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/ingestion/drafts/:id/reject',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await ingestionService.rejectDraft(request.params.id, verifyAuthCookie(request)!.userId)
      return reply.code(200).send({ ok: true })
    }
  )

  // PATCH /api/admin/ingestion/pending-additions/:id/approve — attaches the Coverage and
  // re-triangulates the Analysis (COMPLETE → PENDING, driven through the existing SSE stream)
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/ingestion/pending-additions/:id/approve',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await ingestionService.approvePendingAddition(
        request.params.id,
        verifyAuthCookie(request)!.userId,
        request.log
      )
      return reply.code(200).send({ ok: true })
    }
  )

  // PATCH /api/admin/ingestion/pending-additions/:id/reject — PENDING_REVIEW → REJECTED, permanent
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/ingestion/pending-additions/:id/reject',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await ingestionService.rejectPendingAddition(request.params.id, verifyAuthCookie(request)!.userId)
      return reply.code(200).send({ ok: true })
    }
  )

  // GET /api/admin/ingestion/story-relations — LOW-confidence StoryRelations awaiting review
  fastify.get(
    '/api/admin/ingestion/story-relations',
    { preHandler: requireAdmin },
    async (_request, reply) => {
      const items = await ingestionService.listPendingStoryRelations()
      return reply.code(200).send(items)
    }
  )

  // PATCH /api/admin/ingestion/story-relations/:id/approve — PENDING_REVIEW → PUBLISHED
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/ingestion/story-relations/:id/approve',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await ingestionService.approveStoryRelation(
        request.params.id,
        verifyAuthCookie(request)!.userId,
        request.log
      )
      return reply.code(200).send({ ok: true })
    }
  )

  // PATCH /api/admin/ingestion/story-relations/:id/reject — PENDING_REVIEW → REJECTED, permanent
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/ingestion/story-relations/:id/reject',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await ingestionService.rejectStoryRelation(request.params.id, verifyAuthCookie(request)!.userId)
      return reply.code(200).send({ ok: true })
    }
  )
}
