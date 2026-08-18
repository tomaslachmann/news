import { timingSafeEqual } from 'node:crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'

export const INGESTION_SECRET_HEADER = 'x-ingestion-secret'

/** Constant-time secret comparison — a plain `===` leaks how many leading bytes matched via
 *  response timing. `timingSafeEqual` throws on mismatched buffer lengths, so that case is
 *  rejected explicitly rather than passed through to it. */
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf)
}

/** Guards the Ingestion trigger endpoint. No human/browser session is involved — a small
 *  docker-compose sidecar calls this on a timer — so it's a shared secret, not the JWT cookie. */
export async function requireIngestionSecret(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expected = process.env.INGESTION_SECRET
  const provided = request.headers[INGESTION_SECRET_HEADER]

  if (!expected || typeof provided !== 'string' || !secretsMatch(provided, expected)) {
    return reply.code(401).send({ error: 'Unauthenticated' })
  }
}
