import type { FastifyInstance } from 'fastify'
import { LoginBodySchema } from '@news-triangulator/shared'
import { verifyAuthCookie, COOKIE_NAME } from '../plugins/auth.js'
import { ValidationError } from '../errors.js'
import * as authService from '../services/authService.js'

export function registerAuthRoutes(fastify: FastifyInstance): void {
  fastify.post('/api/auth/login', async (request, reply) => {
    const parsed = LoginBodySchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Email and password are required')
    }

    const session = await authService.authenticate(parsed.data.email, parsed.data.password)
    if (!session) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    reply.setCookie(COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: authService.SESSION_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === 'production',
    })

    return reply.code(200).send(session.user)
  })

  // Pure transport action — clears a cookie, no domain logic — exempt from the one-service-call rule (ADR 0010)
  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' })
    return reply.code(200).send({ ok: true })
  })

  fastify.get('/api/me', async (request, reply) => {
    const payload = verifyAuthCookie(request)
    if (!payload) {
      return reply.code(401).send({ error: 'Unauthenticated' })
    }

    const user = await authService.getCurrentUser(payload.userId)
    if (!user) {
      return reply.code(401).send({ error: 'Unauthenticated' })
    }

    return reply.code(200).send(user)
  })
}
