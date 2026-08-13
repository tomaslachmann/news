import bcrypt from 'bcryptjs'
import type { AdminUserListItem, CreateAdminUserBody, PatchAdminUserBody } from '@news-triangulator/shared'
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
import * as userRepo from '../repositories/user.js'
import { toAdminUserListItem } from '../mappers/user.js'

const PASSWORD_HASH_ROUNDS = 12

export async function listUsers(): Promise<AdminUserListItem[]> {
  const users = await userRepo.findAllUsers()
  return users.map(toAdminUserListItem)
}

export async function createUser(data: CreateAdminUserBody): Promise<AdminUserListItem> {
  const existing = await userRepo.findUserByEmail(data.email)
  if (existing) throw new ConflictError('A user with this email already exists')

  const passwordHash = await bcrypt.hash(data.password, PASSWORD_HASH_ROUNDS)
  const user = await userRepo.createUser({ email: data.email, passwordHash, role: data.role })
  return toAdminUserListItem(user)
}

export async function updateUser(
  requestingUserId: string,
  targetUserId: string,
  data: PatchAdminUserBody
): Promise<AdminUserListItem> {
  if (data.role !== undefined && targetUserId === requestingUserId) {
    throw new ValidationError('Cannot change your own role')
  }

  const existing = await userRepo.findUserById(targetUserId)
  if (!existing) throw new NotFoundError('User not found')

  const passwordHash = data.password ? await bcrypt.hash(data.password, PASSWORD_HASH_ROUNDS) : undefined
  const updated = await userRepo.updateUser(targetUserId, { role: data.role, passwordHash })
  return toAdminUserListItem(updated)
}

export async function deleteUser(requestingUserId: string, targetUserId: string): Promise<void> {
  if (targetUserId === requestingUserId) {
    throw new ValidationError('Cannot delete your own account')
  }

  const existing = await userRepo.findUserById(targetUserId)
  if (!existing) throw new NotFoundError('User not found')

  await userRepo.deleteUser(targetUserId)
}
