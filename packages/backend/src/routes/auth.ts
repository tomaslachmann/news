import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { verifyAuthCookie } from '../plugins/auth.js'

const prisma = new PrismaClient()

const COOKIE_NAME = 'auth_token'
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60

interface LoginBody {
  email: string
  password: string
}

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/auth/login
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
    })

    return reply.code(200).send({ id: user.id, email: user.email, role: user.role })
  })

  // POST /api/auth/logout
  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' })
    return reply.code(200).send({ ok: true })
  })

  // GET /api/me
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
