import jwt from 'jsonwebtoken'
import type { UserRole } from '@news-triangulator/shared'
import type { FastifyRequest, FastifyReply } from 'fastify'

export interface JwtPayload {
  userId: string
  role: UserRole
}

export const COOKIE_NAME = 'auth_token'

export function verifyAuthCookie(request: FastifyRequest): JwtPayload | null {
  const token = request.cookies?.[COOKIE_NAME]
  if (!token) return null

  try {
    const secret = process.env.JWT_SECRET!
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload
    return payload
  } catch {
    return null
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const payload = verifyAuthCookie(request)

  if (!payload) {
    return reply.code(401).send({ error: 'Unauthenticated' })
  }

  if (payload.role !== 'ADMIN') {
    return reply.code(403).send({ error: 'Forbidden: Admin role required' })
  }
}
