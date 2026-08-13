import type { FastifyRequest, FastifyReply } from 'fastify'

export const INGESTION_SECRET_HEADER = 'x-ingestion-secret'

/** Guards the Ingestion trigger endpoint. No human/browser session is involved — a small
 *  docker-compose sidecar calls this on a timer — so it's a shared secret, not the JWT cookie. */
export async function requireIngestionSecret(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expected = process.env.INGESTION_SECRET
  const provided = request.headers[INGESTION_SECRET_HEADER]

  if (!expected || provided !== expected) {
    return reply.code(401).send({ error: 'Unauthenticated' })
  }
}
