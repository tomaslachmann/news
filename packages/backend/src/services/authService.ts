import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { UserRole } from '@news-triangulator/shared'
import * as userRepo from '../repositories/user.js'

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
}

export interface AuthenticatedSession {
  user: AuthenticatedUser
  token: string
}

/** Returns null on invalid credentials — not a typed error, since "wrong password" is an expected outcome, not a failure. */
export async function authenticate(email: string, password: string): Promise<AuthenticatedSession | null> {
  const user = await userRepo.findUserByEmail(email)
  if (!user) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET!, {
    algorithm: 'HS256',
    expiresIn: SESSION_MAX_AGE_SECONDS,
  })

  return { user: { id: user.id, email: user.email, role: user.role }, token }
}

export async function getCurrentUser(userId: string): Promise<AuthenticatedUser | null> {
  const user = await userRepo.findUserById(userId)
  if (!user) return null
  return { id: user.id, email: user.email, role: user.role }
}
