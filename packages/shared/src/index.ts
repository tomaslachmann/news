import { z } from 'zod'

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
  attributions: Attribution[]
}

export interface AnalysisDimensions {
  agreement: DimensionItem[]
  contradiction: ContradictionItem[]
  uniqueReporting: DimensionItem[]
  framing: DimensionItem[]
}

export type SseEvent =
  | { type: 'sources-confirmed'; coverages: CoverageInfo[] }
  | {
      type: 'extraction-complete'
      coverageId: string
      outlet: string
      claimCount: number
      attributedClaimCount: number
      framingSignalCount: number
    }
  | { type: 'extraction-error'; coverageId: string; outlet: string; error: string }
  | { type: 'extraction-settled' }
  | { type: 'synthesis-complete'; dimensions: AnalysisDimensions }
  | { type: 'synthesis-error'; error: string }
  | { type: 'warning'; message: string }

// Request body schemas

export const PostAnalysisBodySchema = z.object({
  seedUrl: z.url(),
})
export type PostAnalysisBody = z.infer<typeof PostAnalysisBodySchema>

export const PostDiscoverBodySchema = z.object({
  keywords: z.array(z.string()).min(1),
})
export type PostDiscoverBody = z.infer<typeof PostDiscoverBodySchema>

export const PatchCoveragesBodySchema = z.object({
  confirmedIds: z.array(z.string()),
  customUrls: z.array(z.string()).optional(),
  manualTexts: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
})
export type PatchCoveragesBody = z.infer<typeof PatchCoveragesBodySchema>

export const LoginBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
})
export type LoginBody = z.infer<typeof LoginBodySchema>

export const UserRoleSchema = z.enum(['ADMIN', 'READONLY'])

export const CreateAdminUserBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  role: UserRoleSchema,
})
export type CreateAdminUserBody = z.infer<typeof CreateAdminUserBodySchema>

export const PatchAdminUserBodySchema = z
  .object({
    role: UserRoleSchema.optional(),
    password: z.string().min(1).optional(),
  })
  .refine((data) => data.role !== undefined || data.password !== undefined, {
    message: 'Provide a role or password to update',
  })
export type PatchAdminUserBody = z.infer<typeof PatchAdminUserBodySchema>

// API response types

export interface CreateAnalysisResponse {
  id: string
  seedHeadline: string
  keywords: string[]
}

export type AnalysisStatusLabel = 'draft' | 'pending' | 'complete' | 'failed'

export interface AnalysisListItem {
  id: string
  seedHeadline: string
  createdAt: string
  coverageCount: number
  status: AnalysisStatusLabel
}

export interface PendingAdditionItem {
  id: string
  analysisId: string
  analysisSeedHeadline: string
  outlet: string
  title?: string
  articleUrl: string
  publishedAt?: string
  createdAt: string
}

export interface IngestionRunSummary {
  checked: number
  created: number
  attached: number
  flagged: number
  skipped: number
}

export interface AdminUserListItem {
  id: string
  email: string
  role: UserRole
  createdAt: string
}

export interface AnalysisDetail {
  id: string
  seedUrl: string
  seedHeadline: string
  createdAt: string
  status: AnalysisStatusLabel
  coverages: CoverageInfo[]
  synthesisResult?: AnalysisDimensions
  /** Cross-Source Narrative segments — generated lazily on first view, undefined until then. */
  narrative?: DimensionItem[]
}
