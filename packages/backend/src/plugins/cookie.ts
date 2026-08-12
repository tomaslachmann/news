import cookie from '@fastify/cookie'
import type { FastifyInstance } from 'fastify'

export async function registerCookiePlugin(fastify: FastifyInstance) {
  await fastify.register(cookie)
}
