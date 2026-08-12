import type { CreateAnalysisResponse, CandidateArticle, AnalysisDetail, CoverageInfo, PatchCoveragesBody } from '@news-triangulator/shared'

export type { CreateAnalysisResponse, CandidateArticle, AnalysisDetail, CoverageInfo, PatchCoveragesBody }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({})) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function createAnalysis(seedUrl: string): Promise<CreateAnalysisResponse> {
  const res = await fetch('/api/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ seedUrl }),
  })

  if (!res.ok) return throwApiError(res, 'Failed to create analysis')

  return res.json() as Promise<CreateAnalysisResponse>
}

export async function discoverSources(analysisId: string, keywords: string[]): Promise<CandidateArticle[]> {
  const res = await fetch(`/api/analyses/${analysisId}/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ keywords }),
  })

  if (!res.ok) return throwApiError(res, 'Failed to start discovery')

  return res.json() as Promise<CandidateArticle[]>
}

export async function patchCoverages(analysisId: string, body: PatchCoveragesBody): Promise<CoverageInfo[]> {
  const res = await fetch(`/api/analyses/${analysisId}/coverages`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (!res.ok) return throwApiError(res, 'Failed to confirm sources')

  return res.json() as Promise<CoverageInfo[]>
}

export async function fetchAnalysis(analysisId: string): Promise<AnalysisDetail> {
  const res = await fetch(`/api/analyses/${analysisId}`, { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Failed to load analysis')

  return res.json() as Promise<AnalysisDetail>
}
