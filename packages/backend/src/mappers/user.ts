import type { AdminUserListItem } from '@news-triangulator/shared'
import type { User } from '../repositories/user.js'

export function toAdminUserListItem(user: User): AdminUserListItem {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}
