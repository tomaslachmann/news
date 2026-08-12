export type UserRole = 'ADMIN' | 'READONLY'

// SSE Event types

export interface CoverageInfo {
  id: string
  outlet: string
  title?: string
  articleUrl: string
  publishedAt?: string
  status: 'ok' | 'extraction-failed' | 'pending'
}

export interface CandidateArticle {
  outlet: string
  title: string
  url: string
  publishedAt: string
}

// Synthesis pass output types
export interface Attribution {
  outlet: string
  czechQuote: string
  articleUrl: string
}

export interface DimensionItem {
  prose: string
  attributions: Attribution[]
}

export interface ContradictionItem {
  prose: string
  sides: Attribution[]
}

export interface AnalysisDimensions {
  agreement: DimensionItem[]
  contradiction: ContradictionItem[]
  uniqueReporting: DimensionItem[]
  framing: DimensionItem[]
}

export type SseEvent =
  | { type: 'sources-confirmed'; coverages: CoverageInfo[] }
  | { type: 'extraction-complete'; coverageId: string; outlet: string; claimCount: number; attributedClaimCount: number; framingSignalCount: number }
  | { type: 'extraction-error'; coverageId: string; outlet: string; error: string }
  | { type: 'extraction-settled' }
  | { type: 'synthesis-complete'; dimensions: AnalysisDimensions }
  | { type: 'synthesis-error'; error: string }
  | { type: 'warning'; message: string }

// API response types

export interface PatchCoveragesBody {
  confirmedIds: string[]
  customUrls?: string[]
  manualTexts?: Array<{ id: string; text: string }>
}

export interface CreateAnalysisResponse {
  id: string
  seedHeadline: string
  keywords: string[]
}

export interface AnalysisListItem {
  id: string
  seedHeadline: string
  createdAt: string
  coverageCount: number
  status: 'pending' | 'complete' | 'failed'
}

export interface AnalysisDetail {
  id: string
  seedUrl: string
  seedHeadline: string
  createdAt: string
  status: 'pending' | 'complete' | 'failed'
  coverages: CoverageInfo[]
  synthesisResult?: AnalysisDimensions
}
