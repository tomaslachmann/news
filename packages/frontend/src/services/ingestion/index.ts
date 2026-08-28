import type {
  PendingAdditionItem,
  AnalysisListItem,
  PendingStoryRelationItem,
  Page,
  DraftApprovalResult,
  DraftExclusion,
} from '@news-triangulator/shared'
import { cursorQueryParam } from '../pagination'

export type {
  PendingAdditionItem,
  AnalysisListItem,
  PendingStoryRelationItem,
  Page,
  DraftApprovalResult,
  DraftExclusion,
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchPendingAdditions(cursor?: string): Promise<Page<PendingAdditionItem>> {
  const res = await fetch(`/api/admin/ingestion/pending-additions${cursorQueryParam(cursor)}`, {
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst čekající doplnění')

  return res.json() as Promise<Page<PendingAdditionItem>>
}

export async function fetchVisibleDrafts(cursor?: string): Promise<Page<AnalysisListItem>> {
  const res = await fetch(`/api/admin/ingestion/drafts${cursorQueryParam(cursor)}`, {
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst koncepty')

  return res.json() as Promise<Page<AnalysisListItem>>
}

export async function approveDraft(analysisId: string): Promise<DraftApprovalResult> {
  const res = await fetch(`/api/admin/ingestion/drafts/${analysisId}/approve`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se schválit koncept')

  return res.json() as Promise<DraftApprovalResult>
}

export async function rejectDraft(analysisId: string): Promise<void> {
  const res = await fetch(`/api/admin/ingestion/drafts/${analysisId}/reject`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se zamítnout koncept')
}

export async function approvePendingAddition(id: string): Promise<void> {
  const res = await fetch(`/api/admin/ingestion/pending-additions/${id}/approve`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se schválit doplnění')
}

export async function rejectPendingAddition(id: string): Promise<void> {
  const res = await fetch(`/api/admin/ingestion/pending-additions/${id}/reject`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se zamítnout doplnění')
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
