import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { verifyAuthCookie, COOKIE_NAME } from '../plugins/auth.js'

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60

interface LoginBody {
  email: string
  password: string
}

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', expiresIn: THIRTY_DAYS_SECONDS }
    )

    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: THIRTY_DAYS_SECONDS,
      secure: process.env.NODE_ENV === 'production',
    })

    return reply.code(200).send({ id: user.id, email: user.email, role: user.role })
  })

  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' })
    return reply.code(200).send({ ok: true })
  })

  fastify.get('/api/me', async (request, reply) => {
    const payload = verifyAuthCookie(request)
    if (!payload) {
      return reply.code(401).send({ error: 'Unauthenticated' })
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) {
      return reply.code(401).send({ error: 'Unauthenticated' })
    }

    return reply.code(200).send({ id: user.id, email: user.email, role: user.role })
  })
}
