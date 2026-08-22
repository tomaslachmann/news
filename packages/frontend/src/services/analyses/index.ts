import type {
  CreateAnalysisResponse,
  CandidateArticle,
  AnalysisDetail,
  AnalysisListItem,
  AnalysisListSummary,
  AnalysisDimensions,
  DimensionItem,
  Attribution,
  CoverageInfo,
  PatchCoveragesBody,
  SseEvent,
  RelatedEventItem,
  ThreadSummaryItem,
  ThreadMemberItem,
  Page,
  SourceOverlapInfo,
  EntityMentionItem,
  AnalysisEntityRelationItem,
  NarrativeDocument,
  NarrativeBlock,
  NarrativeInline,
  NarrativeEntityRef,
  NarrativeSourceRef,
  NarrativeValueRef,
  NarrativeLeadImage,
} from '@news-triangulator/shared'
import { MIN_SOURCES_FOR_GAUGE } from '@news-triangulator/shared'

export type {
  CreateAnalysisResponse,
  CandidateArticle,
  AnalysisDetail,
  AnalysisListItem,
  AnalysisListSummary,
  AnalysisDimensions,
  DimensionItem,
  Attribution,
  CoverageInfo,
  PatchCoveragesBody,
  SseEvent,
  RelatedEventItem,
  ThreadSummaryItem,
  ThreadMemberItem,
  Page,
  SourceOverlapInfo,
  EntityMentionItem,
  AnalysisEntityRelationItem,
  NarrativeDocument,
  NarrativeBlock,
  NarrativeInline,
  NarrativeEntityRef,
  NarrativeSourceRef,
  NarrativeValueRef,
  NarrativeLeadImage,
}
export { MIN_SOURCES_FOR_GAUGE }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function createAnalysis(
  seedUrl: string,
  opts: { force?: boolean } = {}
): Promise<CreateAnalysisResponse> {
  const res = await fetch('/api/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ seedUrl, force: opts.force }),
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se vytvořit analýzu')

  return res.json() as Promise<CreateAnalysisResponse>
}

/** The "continue with this match" action (ticket 27) — attaches the seed as Coverage to an
 *  already-open Analysis instead of creating a duplicate. */
export async function attachSeedToMatch(analysisId: string, seedUrl: string): Promise<void> {
  const res = await fetch(`/api/analyses/${analysisId}/attach-seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ seedUrl }),
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se připojit zdroj k analýze')
}

export async function discoverSources(analysisId: string, keywords: string[]): Promise<CandidateArticle[]> {
  const res = await fetch(`/api/analyses/${analysisId}/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ keywords }),
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se spustit vyhledávání zdrojů')

  return res.json() as Promise<CandidateArticle[]>
}

export async function patchCoverages(analysisId: string, body: PatchCoveragesBody): Promise<CoverageInfo[]> {
  const res = await fetch(`/api/analyses/${analysisId}/coverages`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se potvrdit zdroje')

  return res.json() as Promise<CoverageInfo[]>
}

export async function fetchAnalysis(analysisId: string): Promise<AnalysisDetail> {
  const res = await fetch(`/api/analyses/${analysisId}`, { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst analýzu')

  return res.json() as Promise<AnalysisDetail>
}

/** Fires the homepage "Nejčtenější" readership beacon (ticket 61) — best-effort, fire-and-forget:
 *  a failed/blocked request must never disrupt reading the Article, so this never throws. Called
 *  once per `ArticlePage` mount of a real, COMPLETE Article — see its own effect for the guard
 *  against double-firing. */
export async function recordAnalysisView(analysisId: string): Promise<void> {
  try {
    await fetch(`/api/analyses/${analysisId}/view`, { method: 'POST', credentials: 'include' })
  } catch {
    // Best-effort only — see docstring above.
  }
}

export async function fetchAnalyses(cursor?: string): Promise<Page<AnalysisListItem>> {
  const params = new URLSearchParams(cursor ? { cursor } : undefined)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const res = await fetch(`/api/analyses${suffix}`, { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst analýzy')

  return res.json() as Promise<Page<AnalysisListItem>>
}

export async function fetchArticles(cursor?: string): Promise<Page<AnalysisListItem>> {
  const params = new URLSearchParams(cursor ? { cursor } : undefined)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const res = await fetch(`/api/articles${suffix}`, { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst analýzy')

  return res.json() as Promise<Page<AnalysisListItem>>
}

function on<T extends SseEvent['type']>(
  es: EventSource,
  type: T,
  handler: (e: Extract<SseEvent, { type: T }>) => void
): void {
  es.addEventListener(type, (raw: MessageEvent) =>
    handler(JSON.parse(raw.data as string) as Extract<SseEvent, { type: T }>)
  )
}

export function openAnalysisStream(
  analysisId: string,
  handlers: {
    onSourcesConfirmed: (e: Extract<SseEvent, { type: 'sources-confirmed' }>) => void
    onExtractionComplete: (e: Extract<SseEvent, { type: 'extraction-complete' }>) => void
    onExtractionError: (e: Extract<SseEvent, { type: 'extraction-error' }>) => void
    onExtractionSettled: () => void
    onSynthesisComplete: (e: Extract<SseEvent, { type: 'synthesis-complete' }>) => void
    onSynthesisError: (e: Extract<SseEvent, { type: 'synthesis-error' }>) => void
  }
): EventSource {
  const es = new EventSource(`/api/analyses/${analysisId}/stream`, { withCredentials: true })

  on(es, 'sources-confirmed', handlers.onSourcesConfirmed)
  on(es, 'extraction-complete', handlers.onExtractionComplete)
  on(es, 'extraction-error', handlers.onExtractionError)
  on(es, 'extraction-settled', () => handlers.onExtractionSettled())
  on(es, 'synthesis-complete', handlers.onSynthesisComplete)
  on(es, 'synthesis-error', handlers.onSynthesisError)

  return es
}
