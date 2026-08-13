import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../plugins/auth.js'
import { requireIngestionSecret } from '../plugins/ingestionAuth.js'
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
    async (_request, reply) => {
      const items = await ingestionService.listPendingAdditions()
      return reply.code(200).send(items)
    }
  )

  // PATCH /api/admin/ingestion/drafts/:id/approve — DRAFT → PENDING, proceeds through the existing Review Step
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/ingestion/drafts/:id/approve',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await ingestionService.approveDraft(request.params.id)
      return reply.code(200).send({ ok: true })
    }
  )

  // PATCH /api/admin/ingestion/drafts/:id/reject — DRAFT → FAILED, marked (not deleted) so it isn't re-ingested
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/ingestion/drafts/:id/reject',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await ingestionService.rejectDraft(request.params.id)
      return reply.code(200).send({ ok: true })
    }
  )
}
