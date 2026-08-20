import type { FastifyInstance } from 'fastify'
import { CreateAdminUserBodySchema, PatchAdminUserBodySchema } from '@news-triangulator/shared'
import { requireAdmin, verifyAuthCookie } from '../plugins/auth.js'
import { ValidationError } from '../errors.js'
import * as userService from '../services/userService.js'

export function registerAdminUsersRoutes(fastify: FastifyInstance): void {
  // GET /api/admin/users — list all Users
  fastify.get('/api/admin/users', { preHandler: requireAdmin }, async (_request, reply) => {
    const users = await userService.listUsers()
    return reply.code(200).send(users)
  })

  // POST /api/admin/users — create a new User
  fastify.post('/api/admin/users', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = CreateAdminUserBodySchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné tělo požadavku')
    }

    const user = await userService.createUser(verifyAuthCookie(request)!.userId, parsed.data)
    return reply.code(201).send(user)
  })

  // PATCH /api/admin/users/:id — update a User's role and/or password
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = PatchAdminUserBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatné tělo požadavku')
      }

      const requestingUserId = verifyAuthCookie(request)!.userId
      const user = await userService.updateUser(requestingUserId, request.params.id, parsed.data)
      return reply.code(200).send(user)
    }
  )

  // DELETE /api/admin/users/:id — delete a User
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const requestingUserId = verifyAuthCookie(request)!.userId
      await userService.deleteUser(requestingUserId, request.params.id)
      return reply.code(200).send({ ok: true })
    }
  )
}
