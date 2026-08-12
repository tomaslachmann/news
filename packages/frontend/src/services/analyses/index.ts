import type { CreateAnalysisResponse, CandidateArticle, AnalysisDetail, CoverageInfo, PatchCoveragesBody, SseEvent } from '@news-triangulator/shared'

export type { CreateAnalysisResponse, CandidateArticle, AnalysisDetail, CoverageInfo, PatchCoveragesBody, SseEvent }

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

function on<T extends SseEvent['type']>(
  es: EventSource,
  type: T,
  handler: (e: Extract<SseEvent, { type: T }>) => void
): void {
  es.addEventListener(type, (raw) => handler(JSON.parse((raw as MessageEvent).data) as Extract<SseEvent, { type: T }>))
}

export function openAnalysisStream(
  analysisId: string,
  handlers: {
    onSourcesConfirmed: (e: Extract<SseEvent, { type: 'sources-confirmed' }>) => void
    onExtractionComplete: (e: Extract<SseEvent, { type: 'extraction-complete' }>) => void
    onExtractionError: (e: Extract<SseEvent, { type: 'extraction-error' }>) => void
    onExtractionSettled: () => void
  }
): EventSource {
  const es = new EventSource(`/api/analyses/${analysisId}/stream`, { withCredentials: true })

  on(es, 'sources-confirmed', handlers.onSourcesConfirmed)
  on(es, 'extraction-complete', handlers.onExtractionComplete)
  on(es, 'extraction-error', handlers.onExtractionError)
  on(es, 'extraction-settled', () => handlers.onExtractionSettled())

  return es
}
