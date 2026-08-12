import type { CreateAnalysisResponse } from '@news-triangulator/shared'

export type { CreateAnalysisResponse }

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

export async function discoverSources(analysisId: string, keywords: string[]): Promise<void> {
  const res = await fetch(`/api/analyses/${analysisId}/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ keywords }),
  })

  if (!res.ok) return throwApiError(res, 'Failed to start discovery')
}
