import Fastify from 'fastify'
import type { SseEvent, AnalysisDimensions } from '@news-triangulator/shared'

// Type alias to ensure shared types resolve correctly
type _SseEvent = SseEvent
type _AnalysisDimensions = AnalysisDimensions

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
