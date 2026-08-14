import type { PendingAdditionItem } from '@news-triangulator/shared'

export type { PendingAdditionItem }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchPendingAdditions(): Promise<PendingAdditionItem[]> {
  const res = await fetch('/api/admin/ingestion/pending-additions', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst čekající doplnění')

  return res.json() as Promise<PendingAdditionItem[]>
}

export async function approveDraft(analysisId: string): Promise<void> {
  const res = await fetch(`/api/admin/ingestion/drafts/${analysisId}/approve`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se schválit koncept')
}

export async function rejectDraft(analysisId: string): Promise<void> {
  const res = await fetch(`/api/admin/ingestion/drafts/${analysisId}/reject`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se zamítnout koncept')
}
