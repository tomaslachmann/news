import type { FastifyInstance } from 'fastify'
import {
  LinkEntityWikidataBodySchema,
  ResolveEntityWikidataSuggestionBodySchema,
} from '@news-triangulator/shared'
import { requireAdmin, verifyAuthCookie } from '../plugins/auth.js'
import { ValidationError } from '../errors.js'
import * as entityWikidataService from '../services/entityWikidataService.js'

export function registerEntityWikidataRoutes(fastify: FastifyInstance): void {
  // GET /api/admin/entities/:key/wikidata-candidates?q=... — proxies Wikidata search, scoped to
  // one Entity's context.
  fastify.get<{ Params: { key: string }; Querystring: { q?: string | string[] } }>(
    '/api/admin/entities/:key/wikidata-candidates',
    { preHandler: requireAdmin },
    async (request, reply) => {
      // Fastify performs no schema validation on this querystring, so a repeated `?q=a&q=b` can
      // arrive as an array rather than a string — take the first value rather than letting
      // `.trim()` downstream throw on a non-string.
      const rawQ = request.query.q
      const q = Array.isArray(rawQ) ? rawQ[0] : rawQ
      const candidates = await entityWikidataService.getWikidataCandidates(request.params.key, q ?? '')
      return reply.code(200).send(candidates)
    }
  )

  // POST /api/admin/entities/:key/wikidata-link — sets wikidataId to a confirmed Q-id.
  fastify.post<{ Params: { key: string } }>(
    '/api/admin/entities/:key/wikidata-link',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = LinkEntityWikidataBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné tělo požadavku')
      }

      await entityWikidataService.linkEntityWikidata(
        request.params.key,
        parsed.data.wikidataId,
        verifyAuthCookie(request)!.userId
      )
      return reply.code(200).send({ ok: true })
    }
  )

  // DELETE /api/admin/entities/:key/wikidata-link — clears a previously-confirmed link.
  fastify.delete<{ Params: { key: string } }>(
    '/api/admin/entities/:key/wikidata-link',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await entityWikidataService.unlinkEntityWikidata(request.params.key, verifyAuthCookie(request)!.userId)
      return reply.code(200).send({ ok: true })
    }
  )

  // --- Ticket 93 / ADR 0042: the scheduled scan's admin suggestion queue ----------------------

  // GET /api/admin/entity-wikidata-suggestions — every pending link suggestion for the queue.
  fastify.get(
    '/api/admin/entity-wikidata-suggestions',
    { preHandler: requireAdmin },
    async (_request, reply) => {
      return reply.code(200).send(await entityWikidataService.getWikidataSuggestions())
    }
  )

  // POST .../:key/confirm — links one of the suggested Q-ids (must be one the scan offered).
  fastify.post<{ Params: { key: string } }>(
    '/api/admin/entity-wikidata-suggestions/:key/confirm',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const wikidataId = parseSuggestionBody(request.body)
      await entityWikidataService.confirmWikidataSuggestion(
        request.params.key,
        wikidataId,
        verifyAuthCookie(request)!.userId
      )
      return reply.code(200).send({ ok: true })
    }
  )

  // POST .../:key/dismiss — "none of these": records every shown candidate as rejected, clears it.
  fastify.post<{ Params: { key: string } }>(
    '/api/admin/entity-wikidata-suggestions/:key/dismiss',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await entityWikidataService.dismissWikidataSuggestion(
        request.params.key,
        verifyAuthCookie(request)!.userId
      )
      return reply.code(200).send({ ok: true })
    }
  )

  // POST .../:key/reject-candidate — rejects one Q-id permanently, keeps the rest of the suggestion.
  fastify.post<{ Params: { key: string } }>(
    '/api/admin/entity-wikidata-suggestions/:key/reject-candidate',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const wikidataId = parseSuggestionBody(request.body)
      await entityWikidataService.rejectWikidataSuggestionCandidate(
        request.params.key,
        wikidataId,
        verifyAuthCookie(request)!.userId
      )
      return reply.code(200).send({ ok: true })
    }
  )
}

function parseSuggestionBody(body: unknown): string {
  const parsed = ResolveEntityWikidataSuggestionBodySchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné tělo požadavku')
  }
  return parsed.data.wikidataId
}
