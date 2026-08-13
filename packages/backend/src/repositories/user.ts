import type { User } from '@prisma/client'
import { prisma } from '../db.js'

export type { User }

export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } })
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } })
}

export async function findAnyUser(): Promise<User | null> {
  return prisma.user.findFirst()
}

export async function createUser(data: {
  email: string
  passwordHash: string
  role: User['role']
}): Promise<User> {
  return prisma.user.create({ data })
}
