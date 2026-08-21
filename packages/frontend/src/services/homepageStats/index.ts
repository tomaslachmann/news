import type {
  HomepageContradictionItem,
  HomepageEntityStatItem,
  HomepageMinuteItem,
  HomepageSummaryStats,
} from '@news-triangulator/shared'

export type { HomepageContradictionItem, HomepageEntityStatItem, HomepageMinuteItem, HomepageSummaryStats }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchHomepageEntityStats(): Promise<HomepageEntityStatItem[]> {
  const res = await fetch('/api/homepage/entities', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst entity dne')

  return res.json() as Promise<HomepageEntityStatItem[]>
}

export async function fetchHomepageSummaryStats(): Promise<HomepageSummaryStats> {
  const res = await fetch('/api/homepage/summary', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst statistiky dne')

  return res.json() as Promise<HomepageSummaryStats>
}

export async function fetchHomepageMinuteFeed(): Promise<HomepageMinuteItem[]> {
  const res = await fetch('/api/homepage/minute', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst minutu')

  return res.json() as Promise<HomepageMinuteItem[]>
}

export async function fetchHomepageContradictions(): Promise<HomepageContradictionItem[]> {
  const res = await fetch('/api/homepage/contradictions', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst rozpory')

  return res.json() as Promise<HomepageContradictionItem[]>
}
