import type { HomepageEntityStatItem } from '@news-triangulator/shared'

export type { HomepageEntityStatItem }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchHomepageEntityStats(): Promise<HomepageEntityStatItem[]> {
  const res = await fetch('/api/homepage/entities', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst entity dne')

  return res.json() as Promise<HomepageEntityStatItem[]>
}
