import type { FastifyInstance } from 'fastify'
import { ConfirmEntityAliasMergeBodySchema } from '@news-triangulator/shared'
import { requireAdmin, verifyAuthCookie } from '../plugins/auth.js'
import { ValidationError } from '../errors.js'
import * as entityAliasService from '../services/entityAliasService.js'

export function registerEntityAliasRoutes(fastify: FastifyInstance): void {
  // GET /api/admin/entity-aliases/candidates — same-entity pairs ranked by name similarity
  fastify.get(
    '/api/admin/entity-aliases/candidates',
    { preHandler: requireAdmin },
    async (_request, reply) => {
      const candidates = await entityAliasService.getEntityAliasCandidates()
      return reply.code(200).send(candidates)
    }
  )

  // POST /api/admin/entity-aliases/:pairId/confirm — merges the pair, body picks the survivor
  fastify.post<{ Params: { pairId: string } }>(
    '/api/admin/entity-aliases/:pairId/confirm',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = ConfirmEntityAliasMergeBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné tělo požadavku')
      }

      await entityAliasService.confirmEntityAliasMerge(
        request.params.pairId,
        parsed.data.survivingEntityId,
        verifyAuthCookie(request)!.userId
      )
      return reply.code(200).send({ ok: true })
    }
  )

  // POST /api/admin/entity-aliases/:pairId/reject — permanent, never re-suggested
  fastify.post<{ Params: { pairId: string } }>(
    '/api/admin/entity-aliases/:pairId/reject',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await entityAliasService.rejectEntityAliasMerge(
        request.params.pairId,
        verifyAuthCookie(request)!.userId
      )
      return reply.code(200).send({ ok: true })
    }
  )
}
