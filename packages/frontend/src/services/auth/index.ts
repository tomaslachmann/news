import type { UserRole } from '@news-triangulator/shared'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

export interface LoginBody {
  email: string
  password: string
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/me', { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error('Failed to fetch /api/me')
  return res.json() as Promise<AuthUser>
}

export async function login(body: LoginBody): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Neplatné přihlašovací údaje')
  return res.json() as Promise<AuthUser>
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
}
