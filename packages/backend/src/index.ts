import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { registerAuthRoutes } from './routes/auth.js'
import { registerAnalysesRoutes } from './routes/analyses.js'
import { seedAdminUser } from './seed.js'
import { NotFoundError, ValidationError, ExternalServiceError } from './errors.js'

if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET environment variable is required but not set.')
  process.exit(1)
}

const server = Fastify({
  logger: true,
})

server.setErrorHandler((err, request, reply) => {
  if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message })
  if (err instanceof ValidationError) return reply.code(400).send({ error: err.message })
  if (err instanceof ExternalServiceError) return reply.code(422).send({ error: err.message })

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

    await seedAdminUser()

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
