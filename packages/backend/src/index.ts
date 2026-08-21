import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { registerAuthRoutes } from './routes/auth.js'
import { registerAnalysesRoutes } from './routes/analyses.js'
import { registerAdminUsersRoutes } from './routes/adminUsers.js'
import { registerIngestionRoutes } from './routes/ingestion.js'
import { registerEntityAliasRoutes } from './routes/entityAlias.js'
import { seedAdminUser } from './seed.js'
import { getQueueClient } from './jobs/queueClient.js'
import { NotFoundError, ValidationError, ExternalServiceError, ConflictError } from './errors.js'

if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET environment variable is required but not set.')
  process.exit(1)
}

if (!process.env.INGESTION_SECRET) {
  console.warn('Warning: INGESTION_SECRET is not set — POST /api/ingestion/run will always reject.')
}

const server = Fastify({
  logger: true,
})

server.setErrorHandler((err, request, reply) => {
  if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message })
  if (err instanceof ValidationError) return reply.code(400).send({ error: err.message })
  if (err instanceof ExternalServiceError) return reply.code(422).send({ error: err.message })
  if (err instanceof ConflictError) return reply.code(409).send({ error: err.message })

  request.log.error(err)
  return reply.code(500).send({ error: 'Internal server error' })
})

server.get('/api/health', async (_request, _reply) => {
  return { ok: true }
})

const start = async () => {
  try {
    await server.register(cookie)

    registerAuthRoutes(server)
    registerAnalysesRoutes(server)
    registerAdminUsersRoutes(server)
    registerIngestionRoutes(server)
    registerEntityAliasRoutes(server)

    await seedAdminUser()

    // Pre-warms the shared pg-boss client (schema setup + declaring every queue) outside of any
    // request or transaction — approveDraft (ticket 14) enqueues entity.extract, and
    // runAnalysisStream (ticket 15) enqueues narrative.generate, both inside a Prisma transaction,
    // and paying pg-boss's one-time cold-start cost there risks the interactive-transaction
    // timeout on the very first one after a (re)deploy. Not fatal if it fails here:
    // getQueueClient() retries lazily on the next call that needs it.
    try {
      await getQueueClient()
    } catch (err) {
      server.log.warn({ err }, 'Failed to pre-warm the job queue client at startup; will retry on first use')
    }

    const port = parseInt(process.env.PORT ?? '3001', 10)
    const host = process.env.HOST ?? '0.0.0.0'

    await server.listen({ port, host })
    server.log.info(`Server listening on port ${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

void start()
