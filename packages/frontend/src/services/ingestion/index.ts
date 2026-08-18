import type {
  PendingAdditionItem,
  AnalysisListItem,
  PendingStoryRelationItem,
} from '@news-triangulator/shared'

export type { PendingAdditionItem, AnalysisListItem, PendingStoryRelationItem }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchPendingAdditions(): Promise<PendingAdditionItem[]> {
  const res = await fetch('/api/admin/ingestion/pending-additions', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst čekající doplnění')

  return res.json() as Promise<PendingAdditionItem[]>
}

export async function fetchVisibleDrafts(): Promise<AnalysisListItem[]> {
  const res = await fetch('/api/admin/ingestion/drafts', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst koncepty')

  return res.json() as Promise<AnalysisListItem[]>
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

export async function fetchPendingStoryRelations(): Promise<PendingStoryRelationItem[]> {
  const res = await fetch('/api/admin/ingestion/story-relations', { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst čekající vztahy')

  return res.json() as Promise<PendingStoryRelationItem[]>
}

export async function approveStoryRelation(id: string): Promise<void> {
  const res = await fetch(`/api/admin/ingestion/story-relations/${id}/approve`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se schválit vztah')
}

export async function rejectStoryRelation(id: string): Promise<void> {
  const res = await fetch(`/api/admin/ingestion/story-relations/${id}/reject`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se zamítnout vztah')
}
