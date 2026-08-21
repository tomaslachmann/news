import type { FastifyInstance } from 'fastify'
import { EntitySearchQuerySchema, ListQuerySchema } from '@news-triangulator/shared'
import { ValidationError } from '../errors.js'
import * as entityService from '../services/entityService.js'

/** Reader-facing entity browse/search (ticket 42) — public, no `requireAdmin` gate: unlike ticket
 *  12's Admin-only fuzzy-search index it reuses, entity pages are a reader-facing navigation
 *  surface per docs/spec-entity-wiki.md. */
export function registerEntitiesRoutes(fastify: FastifyInstance): void {
  // GET /api/entities?q=... — search entities by name
  fastify.get('/api/entities', async (request, reply) => {
    const parsed = EntitySearchQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné parametry dotazu')
    }

    const results = await entityService.searchEntities(parsed.data.q)
    return reply.code(200).send(results)
  })

  // GET /api/entities/:key — entity detail: fields, paginated mentioning Events, aggregated
  // relations
  fastify.get<{ Params: { key: string } }>('/api/entities/:key', async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné parametry dotazu')
    }

    const detail = await entityService.getEntityDetail(
      request.params.key,
      parsed.data.cursor,
      parsed.data.limit
    )
    return reply.code(200).send(detail)
  })
}
