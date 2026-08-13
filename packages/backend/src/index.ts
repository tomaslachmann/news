import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { registerAuthRoutes } from './routes/auth.js'
import { registerAnalysesRoutes } from './routes/analyses.js'
import { seedAdminUser } from './seed.js'

if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET environment variable is required but not set.')
  process.exit(1)
}

const server = Fastify({
  logger: true,
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
