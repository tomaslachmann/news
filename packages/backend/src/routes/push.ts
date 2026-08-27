import type { FastifyInstance } from 'fastify'
import { isPushConfigured, getVapidPublicKey } from '../services/webPush.js'

/** GET /api/push/public-key (ticket 82) — public, no auth. Not secret itself (only
 *  VAPID_PRIVATE_KEY is); the frontend needs it for `pushManager.subscribe({
 *  applicationServerKey })`. 503 when VAPID isn't configured (index.ts already warns about this
 *  at startup) rather than serving an undefined key a subscribe attempt would only fail on
 *  anyway. */
export function registerPushRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/push/public-key', async (_request, reply) => {
    if (!isPushConfigured()) {
      return reply.code(503).send({ error: 'Web Push není na tomto serveru nakonfigurován' })
    }
    return reply.code(200).send({ publicKey: getVapidPublicKey() })
  })
}
