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
  /** Stable id, generated once at Synthesis time (ticket 47 / ADR 0034) — never an array index,
   *  which wouldn't survive `verifyAndRepair` reshuffling arrays on retry. This is what a
   *  `NarrativeAssertion.dimensionItemId` cites. */
  id: string
  prose: string
  attributions: Attribution[]
}

export interface ContradictionItem {
  /** See DimensionItem.id. */
  id: string
  prose: string
  attributions: Attribution[]
}

/** Ticket 38 / ADR 0030 — the model's own story-level read of how much the sources overlap in
 *  what they report. Categorical, for the same reason StoryRelationTypeLabel-adjacent confidence
 *  is (ADR 0022): a raw float invites being read as credibility. Distinct from, and not derived
 *  from, the counted `sourceOverlapPercentage` a completed Analysis also carries. */
export type AgreementCategory = 'CONFIRMED' | 'PARTIAL' | 'DISPUTED'

export interface AnalysisDimensions {
  agreement: DimensionItem[]
  contradiction: ContradictionItem[]
  uniqueReporting: DimensionItem[]
  framing: DimensionItem[]
  agreementCategory: AgreementCategory
}

export type SourceOverlapTier = 'ok' | 'mid' | 'bad'

/** Ticket 38 / ADR 0030 — the counted (never model-generated) share of the agreed-upon core of a
 *  story carried by how many outlets. `tier` is already interpreted against DESIGN-SYSTEM.md
 *  §3.3's boundaries by the backend (the only place those thresholds are allowed to live, per the
 *  ADR) — a frontend consumer switches on `tier` and never re-derives it from `percentage`. */
export interface SourceOverlapInfo {
  percentage: number
  /** The actual denominator `percentage` was computed against — successfully-extracted sources,
   *  not `AnalysisDetail.coverages.length` (which includes attached Coverage whose scrape
   *  succeeded but extraction failed schema validation, or hasn't been extracted at all). A
   *  display layer gating a gauge on MIN_SOURCES_FOR_GAUGE must compare against this field, not
   *  `coverages.length` — the two can differ. */
  sourceCount: number
  tier: SourceOverlapTier
}

/** Below this many sources, a ten-segment gauge implies more precision than the data has (ADR
 *  0030). `sourceOverlap` on `AnalysisDetail` is still populated below this threshold — deciding
 *  whether to render the gauge at all is this constant's one job, for whichever display layer
 *  consumes it (currently AnalysisPage's byline). */
export const MIN_SOURCES_FOR_GAUGE = 5

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

// Ticket 40 — the pair's two entities disambiguate by id, but the confirming Admin decides which
// canonical name survives; the body carries that choice rather than the endpoint picking one side
// arbitrarily.
export const ConfirmEntityAliasMergeBodySchema = z.object({
  survivingEntityId: z.string().min(1),
})
export type ConfirmEntityAliasMergeBody = z.infer<typeof ConfirmEntityAliasMergeBodySchema>

// Ticket 41 — the Admin picks a confirmed Q-id from the search results returned by
// GET .../wikidata-candidates; the entity itself is identified by the route's :key param.
export const LinkEntityWikidataBodySchema = z.object({
  wikidataId: z.string().regex(/^Q[1-9]\d*$/, 'Neplatné Wikidata Q-id'),
})
export type LinkEntityWikidataBody = z.infer<typeof LinkEntityWikidataBodySchema>

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

/// Matches the backend's EntityType Prisma enum exactly — see CONTEXT.md's Entity entry.
export type EntityTypeLabel = 'PERSON' | 'ORGANIZATION' | 'PLACE' | 'COUNTRY'

export interface EntityAliasCandidateEntity {
  id: string
  canonicalName: string
  type: EntityTypeLabel
  storyCount: number
}

/** A same-entity candidate pair ranked by name similarity (ticket 40 / ADR 0033) — `pairId`
 *  encodes the two entity ids (no persisted row exists for a not-yet-decided candidate), passed
 *  back verbatim to the confirm/reject endpoints. */
export interface EntityAliasCandidateItem {
  pairId: string
  entityA: EntityAliasCandidateEntity
  entityB: EntityAliasCandidateEntity
  similarity: number
}

/** One Wikidata search result (ticket 41) — label/description/Q-id, exactly what an Admin needs
 *  to visually disambiguate candidates before confirming a link. `description` is omitted when
 *  Wikidata has none for that item, not sent as an empty string. */
export interface WikidataCandidateItem {
  qid: string
  label: string
  description?: string
}

// Ticket 42 — reader-facing entity browse/search (public, no auth)

/// Matches the backend's EntityRelationType Prisma enum exactly — see entityTypes.ts.
export type EntityRelationTypeLabel =
  | 'REPRESENTS'
  | 'HOLDS_POSITION_IN'
  | 'WORKS_FOR'
  | 'MEMBER_OF'
  | 'LOCATED_IN'
  | 'BASED_IN'
  | 'PART_OF'
  | 'INVOLVES'
  | 'MEETS'
  | 'ATTACKS'
  | 'ACCUSES'
  | 'ANNOUNCES'

export const EntitySearchQuerySchema = z.object({
  // Same bound as ListQuerySchema.cursor above — a query this long can't be a genuine entity
  // name search and shouldn't reach searchEntitiesByName's similarity()/% Postgres computation.
  q: z.string().min(1).max(200),
})
export type EntitySearchQuery = z.infer<typeof EntitySearchQuerySchema>

/** One name-search match — keyed by `Entity.key` (the stable, publicly-referenceable identifier,
 *  ADR 0034), never the internal id. */
export interface EntitySearchResultItem {
  key: string
  canonicalName: string
  type: EntityTypeLabel
  storyCount: number
}

/** One Event (Story) that mentions this entity — `analysisId` is what an entity page links to
 *  (ticket 43), same id every other reader-facing surface navigates Articles by. */
export interface EntityEventItem {
  analysisId: string
  title: string
  createdAt: string
}

/** One entity this Analysis's own Story mentions (ticket 43) — AnalysisPage links each to its own
 *  `/entity/:key` page, `key` being the same stable identifier searchEntitiesByName/
 *  findEntityByKey use. */
export interface EntityMentionItem {
  key: string
  canonicalName: string
  type: EntityTypeLabel
}

/** One `StoryEntityRelation` this entity participates in, attributed to the Event whose coverage
 *  asserted it — never a bare fact list (ADR 0022's "Story-scoped assertion, not a global fact",
 *  CLAUDE.md's attribution principle). `direction` says which side of `type` this entity was on
 *  (e.g. `type: REPRESENTS, direction: 'from'` reads "this entity REPRESENTS otherEntity"). */
export interface EntityRelationItem {
  id: string
  type: EntityRelationTypeLabel
  direction: 'from' | 'to'
  otherEntity: { key: string; canonicalName: string; type: EntityTypeLabel }
  assertedBy: { analysisId: string; title: string }
}

export interface EntityDetail {
  key: string
  canonicalName: string
  type: EntityTypeLabel
  /** Confirmed Wikidata link (ticket 41), if any — null when unlinked, whether because ticket 41
   *  hasn't shipped or this particular entity just hasn't been linked yet. Never a broken/missing
   *  section either way (docs/spec-entity-wiki.md). */
  wikidataId: string | null
  /** Canonical names of every entity confirmed (ticket 40) to be the same real-world entity as
   *  this one, merged away into it — empty, not undefined, when none, whether because ticket 40
   *  hasn't shipped or no merge has touched this entity yet. Never a missing section either way
   *  (docs/spec-entity-wiki.md). */
  aliases: string[]
  events: Page<EntityEventItem>
  relations: EntityRelationItem[]
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

/** One member of the Thread this Analysis's Story belongs to (ticket 17) — chronological order,
 *  `isCurrent` marks which member is the Analysis actually being viewed. Deliberately carries no
 *  role (`ORIGIN`/`DEVELOPMENT`/`REACTION`/`RESOLUTION`) — see ticket 17's Answer, Q2: a role
 *  label risks reading as the tool asserting narrative closure/causation about a real event, the
 *  same overclaim ADR 0012 already guards against elsewhere. */
export interface ThreadMemberItem {
  analysisId: string
  title: string
  isCurrent: boolean
}

/** The multi-stage arc (`Thread`) this Analysis's Story belongs to, if any — most Analyses never
 *  accumulate a FOLLOW_UP chain, so this is absent far more often than present. A materialized,
 *  periodically-recomputed view over `StoryRelation`'s `FOLLOW_UP` edges (ADR 0029, ticket 17),
 *  not a live query — see `thread.recompute`. */
export interface ThreadSummaryItem {
  title: string
  memberCount: number
  members: ThreadMemberItem[]
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
  /** Ticket 38 / ADR 0030 — undefined exactly when `synthesisResult.agreement` was empty (nothing
   *  to measure), never a pending/not-computed-yet state for an Analysis reaching this mapper. */
  sourceOverlap?: SourceOverlapInfo
  /** The structured Cross-Source Narrative document (ticket 47 / ADR 0034) — generated once by the
   *  `narrative.generate` job, cached, undefined until that job completes. */
  narrative?: NarrativeDocument
  /** Other Events (Stories) this one has been linked to — see ticket 37. Empty, not undefined,
   *  when there are none, so callers never need an extra existence check. */
  relatedEvents: RelatedEventItem[]
  /** The longer-running storyline this one is part of, if any — see ticket 17. */
  thread?: ThreadSummaryItem
  /** Entities this Analysis's Story mentions (ticket 43), most salient first — empty, not
   *  undefined, when extraction hasn't attached any, same "never a missing section" convention as
   *  `relatedEvents`. Already the *full* Story-level set (ADR 0034's "AnalysisContext" — not
   *  filtered down to only what the Narrative inline-tagged), unchanged by ticket 47. */
  entities: EntityMentionItem[]
  /** Every `StoryEntityRelation` this Analysis's Story asserts (ticket 47 / ADR 0034) — the
   *  companion to `entities` that lets a reader see the relationships between them, not just the
   *  entities themselves. Empty, not undefined, when there are none, same convention as
   *  `relatedEvents`/`entities`. */
  entityRelations: AnalysisEntityRelationItem[]
}

/** One `StoryEntityRelation` belonging to this Analysis's own Story (ticket 47 / ADR 0034) —
 *  unlike `EntityRelationItem` (an Entity page's cross-Story view, which needs `assertedBy` since
 *  it aggregates relations from many Stories), every relation here is already scoped to this one
 *  Story, so no separate attribution is needed. */
export interface AnalysisEntityRelationItem {
  id: string
  type: EntityRelationTypeLabel
  fromEntity: { key: string; canonicalName: string; type: EntityTypeLabel }
  toEntity: { key: string; canonicalName: string; type: EntityTypeLabel }
}

// Cross-Source Narrative: structured NarrativeDocument (ticket 47 / ADR 0034)

/** A run of inline content inside a NarrativeBlock's `children`. `text` is always the run's
 *  literal display text — for `entity`/`source`/`value`, the ref id(s) point back to this
 *  document's own top-level `entityRefs`/`sourceRefs`/`valueRefs` declarations. */
export type NarrativeInline =
  | { type: 'text'; text: string }
  | { type: 'entity'; entityId: string; text: string }
  | { type: 'source'; sourceIds: string[]; text: string }
  | { type: 'value'; valueId: string; text: string }

/** One structural unit of the Narrative. A `quote` block always names exactly one `sourceId` — a
 *  verbatim quotation has one origin; two Sources independently reporting the same fact in their
 *  own words is an `agreement` NarrativeAssertion over a `paragraph`, never a shared `quote`. */
export type NarrativeBlock =
  | { type: 'heading'; level: 2 | 3; children: NarrativeInline[] }
  | { type: 'paragraph'; children: NarrativeInline[] }
  | { type: 'quote'; sourceId: string; children: NarrativeInline[] }
  | { type: 'list'; style: 'ordered' | 'bullet'; items: { children: NarrativeInline[] }[] }

/** A link from one passage of the Narrative back to a single, specific item of the
 *  already-computed Analysis Dimensions — `dimensionItemId` is a DimensionItem/ContradictionItem
 *  `id` (never an array index). Named `NarrativeAssertion`, not `NarrativeClaim` — this codebase's
 *  `Claim` already means the Factual/Attributed/Interpretive statements Extraction produces per
 *  Coverage (see CONTEXT.md). */
// `type`, not `interface`, for these four — same reason as `NarrativeDocument` below: they nest
// inside it, and TS's implicit index-signature inference (what assigning the whole document to
// Prisma's `InputJsonValue` needs) only applies to `type` aliases, recursively through nested
// members, never through a nested `interface`.
export type NarrativeAssertion = {
  id: string
  dimension: 'agreement' | 'contradiction' | 'unique_reporting' | 'framing'
  dimensionItemId: string
  entityRefs: string[]
  sourceRefs: string[]
  valueRefs: string[]
}

export type NarrativeEntityRef = {
  id: string
  entityKey: string
  canonicalName: string
}

export type NarrativeSourceRef = {
  id: string
  outlet: string
  articleUrl: string
}

/** `normalizedValue`/`unit` are derived server-side by a deterministic Czech-numeral parser from
 *  `text` — the LLM never computes them itself (ADR 0014's "never trust an LLM with a computation
 *  a deterministic check can verify instead", extended here). `null`/`null` when `text` can't be
 *  safely parsed, rather than guessed. */
export type NarrativeValueRef = {
  id: string
  text: string
  sourceIds: string[]
  normalizedValue: number | null
  unit: string | null
}

/** A `type` alias, not an `interface` — the persisted top-level shape Prisma's `InputJsonValue`
 *  is assigned from (`repositories/synthesisResult.ts`'s `updateSynthesisResultNarrative`).
 *  TypeScript only infers an implicit string index signature (what `InputJsonValue`'s own index
 *  signature needs to structurally match against) for a `type` alias's object shape, never for an
 *  `interface` — an `interface` here would force every persist call site to `as unknown as`
 *  around the whole value instead. */
export type NarrativeDocument = {
  version: 1
  blocks: NarrativeBlock[]
  assertions: NarrativeAssertion[]
  entityRefs: NarrativeEntityRef[]
  sourceRefs: NarrativeSourceRef[]
  valueRefs: NarrativeValueRef[]
}
