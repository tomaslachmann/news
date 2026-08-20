import bcrypt from 'bcryptjs'
import type { AdminUserListItem, CreateAdminUserBody, PatchAdminUserBody } from '@news-triangulator/shared'
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
import * as userRepo from '../repositories/user.js'
import { recordAdminActionSafe } from '../repositories/adminActionLog.js'
import { toAdminUserListItem } from '../mappers/user.js'

const PASSWORD_HASH_ROUNDS = 12

export async function listUsers(): Promise<AdminUserListItem[]> {
  const users = await userRepo.findAllUsers()
  return users.map(toAdminUserListItem)
}

export async function createUser(
  requestingUserId: string,
  data: CreateAdminUserBody
): Promise<AdminUserListItem> {
  const existing = await userRepo.findUserByEmail(data.email)
  if (existing) throw new ConflictError('Uživatel s tímto e-mailem už existuje')

  const passwordHash = await bcrypt.hash(data.password, PASSWORD_HASH_ROUNDS)
  const user = await userRepo.createUser({ email: data.email, passwordHash, role: data.role })
  await recordAdminActionSafe({
    actorId: requestingUserId,
    action: 'user.created',
    targetType: 'user',
    targetId: user.id,
  })
  return toAdminUserListItem(user)
}

export async function updateUser(
  requestingUserId: string,
  targetUserId: string,
  data: PatchAdminUserBody
): Promise<AdminUserListItem> {
  if (data.role !== undefined && targetUserId === requestingUserId) {
    throw new ValidationError('Svou vlastní roli nemůžete změnit')
  }

  const existing = await userRepo.findUserById(targetUserId)
  if (!existing) throw new NotFoundError('Uživatel nenalezen')

  const passwordHash = data.password ? await bcrypt.hash(data.password, PASSWORD_HASH_ROUNDS) : undefined
  const updated = await userRepo.updateUser(targetUserId, { role: data.role, passwordHash })
  await recordAdminActionSafe({
    actorId: requestingUserId,
    action: 'user.updated',
    targetType: 'user',
    targetId: targetUserId,
  })
  return toAdminUserListItem(updated)
}

export async function deleteUser(requestingUserId: string, targetUserId: string): Promise<void> {
  if (targetUserId === requestingUserId) {
    throw new ValidationError('Svůj vlastní účet nemůžete smazat')
  }

  const existing = await userRepo.findUserById(targetUserId)
  if (!existing) throw new NotFoundError('Uživatel nenalezen')

  await userRepo.deleteUser(targetUserId)
  await recordAdminActionSafe({
    actorId: requestingUserId,
    action: 'user.deleted',
    targetType: 'user',
    targetId: targetUserId,
  })
}
