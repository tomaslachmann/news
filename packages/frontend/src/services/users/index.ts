import type { AdminUserListItem, CreateAdminUserBody, PatchAdminUserBody } from '@news-triangulator/shared'

export type { AdminUserListItem, CreateAdminUserBody, PatchAdminUserBody }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchUsers(): Promise<AdminUserListItem[]> {
  const res = await fetch('/api/admin/users', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst uživatele')

  return res.json() as Promise<AdminUserListItem[]>
}

export async function createUser(body: CreateAdminUserBody): Promise<AdminUserListItem> {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se vytvořit uživatele')

  return res.json() as Promise<AdminUserListItem>
}

export async function updateUser(userId: string, body: PatchAdminUserBody): Promise<AdminUserListItem> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se aktualizovat uživatele')

  return res.json() as Promise<AdminUserListItem>
}

export async function deleteUser(userId: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se smazat uživatele')
}
