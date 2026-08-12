import Fastify from 'fastify'
import type { SseEvent, AnalysisDimensions } from '@news-triangulator/shared'
import { registerCookiePlugin } from './plugins/cookie.js'
import { registerAuthRoutes } from './routes/auth.js'
import { seedAdminUser } from './seed.js'

// Type alias to ensure shared types resolve correctly
type _SseEvent = SseEvent
type _AnalysisDimensions = AnalysisDimensions

// Fail fast if JWT_SECRET is absent
if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET environment variable is required but not set.')
  process.exit(1)
}

const server = Fastify({
  logger: true,
})

// Health check route
server.get('/api/health', async (_request, _reply) => {
  return { ok: true }
})

// Start server
const start = async () => {
  try {
    // Register plugins
    await registerCookiePlugin(server)

    // Register routes
    await registerAuthRoutes(server)

    // Seed admin user if needed
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

start()
