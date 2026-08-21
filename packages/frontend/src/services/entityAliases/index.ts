import type { EntityAliasCandidateItem } from '@news-triangulator/shared'

export type { EntityAliasCandidateItem }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchEntityAliasCandidates(): Promise<EntityAliasCandidateItem[]> {
  const res = await fetch('/api/admin/entity-aliases/candidates', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst kandidáty na sloučení')

  return res.json() as Promise<EntityAliasCandidateItem[]>
}

export async function confirmEntityAliasMerge(pairId: string, survivingEntityId: string): Promise<void> {
  const res = await fetch(`/api/admin/entity-aliases/${encodeURIComponent(pairId)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ survivingEntityId }),
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se sloučit entity')
}

export async function rejectEntityAliasMerge(pairId: string): Promise<void> {
  const res = await fetch(`/api/admin/entity-aliases/${encodeURIComponent(pairId)}/reject`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se zamítnout návrh')
}
