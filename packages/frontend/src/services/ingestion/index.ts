import type {
  PendingAdditionItem,
  AnalysisListItem,
  PendingStoryRelationItem,
  Page,
  PagedResult,
  DraftApprovalResult,
  DraftExclusion,
} from '@news-triangulator/shared'
import { adminQueryString } from '../pagination'

export type {
  PendingAdditionItem,
  AnalysisListItem,
  PendingStoryRelationItem,
  Page,
  PagedResult,
  DraftApprovalResult,
  DraftExclusion,
}

/** Shared page/direction/date-range an admin queue filter carries. Dates are `yyyy-mm-dd`
 *  straight off `<input type="date">`; the backend coerces them. */
export interface AdminQueueParams {
  page?: number
  dir?: 'asc' | 'desc'
  createdAfter?: string
  createdBefore?: string
}

export type DraftQueueParams = AdminQueueParams & {
  sort?: 'createdAt' | 'coverageCount'
  outlet?: string
}

export type PendingAdditionQueueParams = AdminQueueParams & { outlet?: string }

export type StoryRelationQueueParams = AdminQueueParams

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchPendingAdditions(
  params: PendingAdditionQueueParams = {}
): Promise<PagedResult<PendingAdditionItem>> {
  const res = await fetch(`/api/admin/ingestion/pending-additions${adminQueryString({ ...params })}`, {
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst čekající doplnění')

  return res.json() as Promise<PagedResult<PendingAdditionItem>>
}

export async function fetchVisibleDrafts(
  params: DraftQueueParams = {}
): Promise<PagedResult<AnalysisListItem>> {
  const res = await fetch(`/api/admin/ingestion/drafts${adminQueryString({ ...params })}`, {
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst koncepty')

  return res.json() as Promise<PagedResult<AnalysisListItem>>
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

export async function fetchPendingStoryRelations(
  params: StoryRelationQueueParams = {}
): Promise<PagedResult<PendingStoryRelationItem>> {
  const res = await fetch(`/api/admin/ingestion/story-relations${adminQueryString({ ...params })}`, {
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst čekající vztahy')

  return res.json() as Promise<PagedResult<PendingStoryRelationItem>>
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
