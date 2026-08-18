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
  /** Resolved via resolveSource() — the same identity every other path (human-seeded, GDELT)
   *  resolves to for this real outlet (fixes P0-6, docs/audit.md). What Coverage.sourceId is set
   *  to if this candidate becomes Coverage. */
  sourceId: string
  /** Display name only (Source.name) — never used as an identity key. */
  outlet: string
  title: string
  url: string
  publishedAt: string
  /** Short excerpt/summary where the source provides one (e.g. RSS description) — used as
   *  cheap embedding input for Ingestion's candidate matching, not populated by every source. */
  excerpt?: string
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
  // Ticket 27 — skips the dedup-against-open-Stories check, creating a new Analysis even if one
  // looks like a match. The override for a false-positive same-event confirmation.
  force: z.boolean().optional(),
})
export type PostAnalysisBody = z.infer<typeof PostAnalysisBodySchema>

export const PostAttachSeedBodySchema = z.object({
  seedUrl: z.url(),
})
export type PostAttachSeedBody = z.infer<typeof PostAttachSeedBodySchema>

export const PostDiscoverBodySchema = z.object({
  keywords: z.array(z.string()).min(1),
})
export type PostDiscoverBody = z.infer<typeof PostDiscoverBodySchema>

// Bounds how many custom URLs one confirm-coverages request can add — each one triggers a scrape
// and, downstream, real LLM spend (extraction/synthesis). See docs/audit.md P0-7, ticket 03.
export const MAX_CUSTOM_URLS = 10

export const PatchCoveragesBodySchema = z.object({
  confirmedIds: z.array(z.string()),
  customUrls: z.array(z.string()).max(MAX_CUSTOM_URLS).optional(),
  manualTexts: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
})
export type PatchCoveragesBody = z.infer<typeof PatchCoveragesBodySchema>

// Shared shape for GET /api/analyses and the Admin draft queue — keyset (cursor) pagination, not
// offset, so results stay stable across inserts (docs/audit.md P0-7, ticket 03).
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50

export const ListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
})
export type ListQuery = z.infer<typeof ListQuerySchema>

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

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
    message: 'Zadejte roli nebo heslo ke změně',
  })
export type PatchAdminUserBody = z.infer<typeof PatchAdminUserBodySchema>

// API response types

export type AnalysisStatusLabel = 'draft' | 'pending' | 'complete' | 'failed'

// Ticket 27 — submitting a seed URL either creates a new Analysis, or finds it already matches
// an open Story within the dedup window (confirmed via the same-event LLM check) and returns
// that match instead of creating a duplicate. 'failed' never appears here — a FAILED match is
// treated as no match at all, per ADR 0019.
export interface CreateAnalysisCreated {
  outcome: 'created'
  id: string
  seedHeadline: string
  keywords: string[]
}

export interface CreateAnalysisMatched {
  outcome: 'matched'
  id: string
  /** The matched Analysis's display title — the generated headline if it's already COMPLETE,
   *  otherwise its working title. Same fallback rule as AnalysisDetail/AnalysisListItem's
   *  `title` — see ticket 33. */
  title: string
  matchedStatus: Exclude<AnalysisStatusLabel, 'failed'>
}

export type CreateAnalysisResponse = CreateAnalysisCreated | CreateAnalysisMatched

export interface AnalysisListItem {
  id: string
  seedHeadline: string
  /** The display title: the generated headline once COMPLETE, otherwise `seedHeadline` — see
   *  ticket 33. */
  title: string
  createdAt: string
  /** For a non-draft status: successfully-extracted (OK) Coverage only. For a draft, every
   *  attached (non-excluded) Coverage regardless of status, since a Draft's Coverage is always
   *  PENDING until after Review Step confirmation — an OK-only count would always read zero. */
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

/** RELATED/FOLLOW_UP only — never a causal type, see ADR 0012/0022. */
export type StoryRelationTypeLabel = 'RELATED' | 'FOLLOW_UP'

/** A `PENDING_REVIEW` StoryRelation (ticket 35) awaiting Admin confirm/reject (ticket 36) — the
 *  same display-title fallback (`resolveDisplayTitle`) used everywhere else applies to both
 *  sides, so a since-changed Analysis status on either end degrades gracefully rather than
 *  erroring. */
export interface PendingStoryRelationItem {
  id: string
  fromAnalysisId: string
  fromTitle: string
  toAnalysisId: string
  toTitle: string
  type: StoryRelationTypeLabel
  reasoning: string
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

/** A PUBLISHED StoryRelation (ticket 35), from the current Analysis's point of view — the
 *  *other* Story's own display title/id/source count, already resolved server-side. Only ever
 *  present when the other side's Analysis is COMPLETE (see ticket 37) — nothing here ever links
 *  to a Draft/PENDING page that isn't a stable Article yet. */
export interface RelatedEventItem {
  analysisId: string
  title: string
  type: StoryRelationTypeLabel
  coverageCount: number
}

export interface AnalysisDetail {
  id: string
  seedUrl: string
  seedHeadline: string
  /** The display title: the generated headline once COMPLETE, otherwise `seedHeadline` — see
   *  ticket 33. */
  title: string
  createdAt: string
  status: AnalysisStatusLabel
  coverages: CoverageInfo[]
  synthesisResult?: AnalysisDimensions
  /** Cross-Source Narrative segments — generated lazily on first view, undefined until then. */
  narrative?: DimensionItem[]
  /** Other Events (Stories) this one has been linked to — see ticket 37. Empty, not undefined,
   *  when there are none, so callers never need an extra existence check. */
  relatedEvents: RelatedEventItem[]
}
