export type UserRole = 'ADMIN' | 'READONLY'

// SSE Event types

export interface CoverageInfo {
  id: string
  outlet: string
  articleUrl: string
  status: 'ok' | 'extraction-failed' | 'pending'
}

export interface Attribution {
  outlet: string
  czechQuote: string
  articleUrl: string
}

export interface DimensionItem {
  prose: string // English summary
  attributions: Attribution[]
}

export interface ContradictionItem {
  sides: Attribution[] // exactly two, one per outlet in conflict
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
  | { type: 'synthesis-complete'; dimensions: AnalysisDimensions }
  | { type: 'synthesis-error'; error: string }
  | { type: 'warning'; message: string }

// API response types

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
