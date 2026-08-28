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
  /** Raw RSS `<category>` value(s), in feed order, straight from rss-parser — only rss.ts's RSS
   *  candidates populate this (ticket 78); GDELT and human-seeded candidates never have RSS
   *  category signal, so it stays undefined for those. Resolved against the source's own mapping
   *  table (articleCategoryMapping.ts) into a canonical ArticleCategory at Coverage-creation
   *  time — never persisted as-is. */
  rawCategories?: string[]
  /** The category this candidate's own SourceFeed is scoped to (ticket 79, e.g. iRozhlas's
   *  `/section/ekonomika`, iDnes's `?c=domaci`) — only rss.ts populates this, and only for a feed
   *  whose SourceFeed.category is set. Takes priority over rawCategories when resolving
   *  primaryCategory (resolveCategoryForCandidate, articleCategoryMapping.ts): the feed URL itself
   *  is already the category signal, so no per-item raw-tag lookup is needed. */
  feedCategory?: ArticleCategory | null
}

/// Matches the backend's ArticleCategory Prisma enum exactly — see CONTEXT.md's Category entry
/// (ticket 78, ticket 77's grilling).
export type ArticleCategory =
  | 'DOMESTIC'
  | 'WORLD'
  | 'ECONOMY'
  | 'POLITICS'
  | 'SPORT'
  | 'CULTURE'
  | 'SCIENCE_TECH'
  | 'CRIME'
  | 'LIFESTYLE'
  | 'COMMENTARY'
  | 'HEALTH'
  | 'REGIONAL'
  | 'OTHER'

/** Czech display label for each ArticleCategory value — declared alongside the type it labels
 *  (ticket 78) so the wording can't drift between ticket 80's nav rubric links and its
 *  `/category/:slug` browse page. */
export const ARTICLE_CATEGORY_LABELS: Record<ArticleCategory, string> = {
  DOMESTIC: 'Domácí',
  WORLD: 'Svět',
  ECONOMY: 'Ekonomika',
  POLITICS: 'Politika',
  SPORT: 'Sport',
  CULTURE: 'Kultura',
  SCIENCE_TECH: 'Věda a technika',
  CRIME: 'Krimi',
  LIFESTYLE: 'Životní styl',
  COMMENTARY: 'Komentáře',
  HEALTH: 'Zdraví',
  REGIONAL: 'Regiony',
  OTHER: 'Ostatní',
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

// The browser's own `PushSubscription.toJSON()` shape (ticket 82) — `endpoint`/`keys.p256dh`/
// `keys.auth` are exactly what `pushManager.subscribe()` returns and what `web-push` (backend)
// needs to send to it later. Used by both POST /api/thread/:slug/follow and .../unfollow: a
// follow needs the full subscription to store, an unfollow only strictly needs `endpoint` to
// delete by, but sending the same shape for both keeps the frontend's one subscribe/unsubscribe
// call site simple rather than building two different bodies for the same object.
export const PushSubscriptionBodySchema = z.object({
  endpoint: z.string(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
})
export type PushSubscriptionBody = z.infer<typeof PushSubscriptionBodySchema>

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

// ── Admin queue pagination (ticket 88) ───────────────────────────────────────
// Offset-based with a real total, deliberately separate from the public keyset `Page<T>` above.
// The admin Ingestion queues are bounded (a human works them down) and need jump-to-page + a
// total count, which keyset pagination can't give; OFFSET's cost is irrelevant at this scale.
export const ADMIN_PAGE_SIZE = 20
export const ADMIN_MAX_PAGE_SIZE = 50

export interface PagedResult<T> {
  items: T[]
  /** Total rows matching the active filter, across every page. */
  total: number
  /** 1-based. */
  page: number
  pageSize: number
  /** `max(1, ceil(total / pageSize))` — always ≥ 1 so the UI can render "1 / 1" for an empty queue. */
  pageCount: number
}

export const SortDirectionSchema = z.enum(['asc', 'desc'])
export type SortDirection = z.infer<typeof SortDirectionSchema>

// Page/size/direction/created-at-range params every admin queue query accepts. Spread into each
// queue's own schema, which adds its `sort` enum (only where more than one column is orderable)
// and any queue-specific filters. `z.coerce` because these arrive as querystring strings.
const adminQueryBase = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(ADMIN_MAX_PAGE_SIZE).optional(),
  dir: SortDirectionSchema.optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
}

const OUTLET_FILTER_MAX = 120

export const DraftQuerySchema = z.object({
  ...adminQueryBase,
  sort: z.enum(['createdAt', 'coverageCount']).optional(),
  outlet: z.string().trim().min(1).max(OUTLET_FILTER_MAX).optional(),
})
export type DraftQuery = z.infer<typeof DraftQuerySchema>

export const PendingAdditionQuerySchema = z.object({
  ...adminQueryBase,
  outlet: z.string().trim().min(1).max(OUTLET_FILTER_MAX).optional(),
})
export type PendingAdditionQuery = z.infer<typeof PendingAdditionQuerySchema>

export const StoryRelationQuerySchema = z.object({ ...adminQueryBase })
export type StoryRelationQuery = z.infer<typeof StoryRelationQuerySchema>

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
  /** Ticket 58 — homepage/listing surface for COMPLETE Articles. Absent on thinner list rows
   *  (e.g. DRAFT/PENDING history/admin queue items) whose consumers don't need reader-facing
   *  teaser/image/entity/source detail. */
  summary?: AnalysisListSummary
}

export interface AnalysisListSummary {
  teaser: string
  hasConflict: boolean
  sourceOverlap?: SourceOverlapInfo
  outlets: string[]
  entities: string[]
  leadImage?: NarrativeLeadImage
}

/** An `AnalysisListItem` narrowed to the invariant the homepage Article read model guarantees
 *  (ticket 62 / ADR 0037): only ever a COMPLETE Analysis with a SynthesisResult, so `status` and
 *  `summary` are never the wider/absent cases `AnalysisListItem` allows for other, mixed-status
 *  list surfaces (HistoryPage, the Ingestion queue). */
export type HomepageArticleItem = AnalysisListItem & { status: 'complete'; summary: AnalysisListSummary }

/** `GET /api/homepage/articles` (ticket 62) — the backend-owned slotting for the homepage's main
 *  Article column, so the frontend never has to decide "index 0 is the lead" itself. `lead` is
 *  `null`, and `spotlight`/`latest` are empty, exactly when there are no COMPLETE Articles yet —
 *  never a partially-filled shape a consumer has to guess about. */
export interface HomepageArticles {
  lead: HomepageArticleItem | null
  spotlight: HomepageArticleItem[]
  latest: HomepageArticleItem[]
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

/** Why a Coverage was dropped from a Draft by `approveDraft`'s Pre-Extraction quality gate
 *  (ticket 24): `failed-verification` — the same-story LLM check rejected or errored on its title;
 *  `no-title` — it had no scraped title, so it was never sent to verification at all (not evidence
 *  the LLM rejected it — see docs audit P1-12). */
export type DraftExclusionReason = 'failed-verification' | 'no-title'

export interface DraftExclusion {
  coverageId: string
  outlet: string
  reason: DraftExclusionReason
}

/** `PATCH /api/admin/ingestion/drafts/:id/approve` response (ticket 87). `excluded` names every
 *  Coverage the quality gate dropped between the `/admin/ingestion` list count and the source list
 *  on `/review/:id`, so the Admin isn't left reading a shrinking source count as data loss. Empty
 *  when nothing was excluded. */
export interface DraftApprovalResult {
  excluded: DraftExclusion[]
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

/// Content search (ticket 83) — GET /api/search. Same shape/bound as EntitySearchQuerySchema, a
/// separate schema rather than a shared alias: these validate two structurally-identical but
/// conceptually distinct query params (an entity name vs. a full-text search phrase), matching
/// this file's own convention of one small schema per endpoint (PostAnalysisBodySchema/
/// PostAttachSeedBodySchema/PostDiscoverBodySchema are similarly near-identical but separate).
export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
})
export type SearchQuery = z.infer<typeof SearchQuerySchema>

/** One name-search match — keyed by `Entity.key` (the stable, publicly-referenceable identifier,
 *  ADR 0034), never the internal id. */
export interface EntitySearchResultItem {
  key: string
  canonicalName: string
  type: EntityTypeLabel
  storyCount: number
  /** Ticket 50 — the `/admin/entities` type-ahead shows a "propojeno" marker for already-linked
   *  entities; null when unlinked. The reader-facing `/search` page ignores this. */
  wikidataId: string | null
}

/** Precomputed homepage "Entity dne" row (ticket 59). Counts are for the latest stored 24h
 *  window, not corpus-wide Entity.storyCount. */
export interface HomepageEntityStatItem {
  key: string
  canonicalName: string
  type: EntityTypeLabel
  recentEventCount: number
  recentSourceCount: number
  trendPercent?: number
}

export interface HomepageSummaryStats {
  processedArticleCount: number
  activeSourceCount: number
  contradictionCount: number
  averageSourceOverlapPercentage?: number
}

export interface HomepageMinuteItem {
  analysisId: string
  title: string
  createdAt: string
  sourceCount: number
  hasConflict: boolean
}

export interface HomepageContradictionItem {
  analysisId: string
  title: string
  createdAt: string
  prose: string
  sourceCount: number
  sourceOverlapPercentage?: number
}

/** Homepage "Nejčtenější" row (ticket 61) — ranked by `AnalysisView` count in the last 24h.
 *  `viewCount` is a raw page-load count, not a distinct-reader count: recording a view carries no
 *  reader identity at all (no session/cookie/IP), so there is nothing to dedupe against — the same
 *  visitor reloading the same Article twice counts as two views, by design. */
export interface HomepageMostReadItem {
  analysisId: string
  title: string
  viewCount: number
}

/** Homepage "recently updated Threads" row (ticket 70) — real data only (ticket 65's grilling
 *  session): the most recently-updated Threads with at least 2 currently-visible (COMPLETE)
 *  members, same visibility gate `ThreadDetail`/`ThreadSummaryItem` already apply elsewhere.
 *  `memberCount` is that visible count, not the Thread's raw total, same "never report a bigger
 *  number than what's actually reachable" convention `toThreadSummary` established. */
export interface HomepageThreadItem {
  slug: string
  title: string
  memberCount: number
  lastEventAt: string
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

/** The entity's Wikimedia photo for the infobox (ticket 90) — same attribution shape as
 *  `NarrativeLeadImage`, always credited, since Wikimedia licensing requires it. */
export interface EntityWikiImage {
  url: string
  author: string | null
  license: string | null
  sourceUrl: string
}

/** One entity that co-occurs with the subject across the corpus (ticket 90) — how many COMPLETE
 *  Stories mention both. Powers the "často zmiňováno spolu s" rail. */
export interface EntityCoMentionItem {
  key: string
  canonicalName: string
  type: EntityTypeLabel
  sharedStoryCount: number
}

/** One month of mention activity (ticket 90) — COMPLETE Events mentioning this entity, bucketed
 *  by `Analysis.createdAt` month. `month` is `YYYY-MM`. Gaps between months are not filled — the
 *  frontend chart decides how to render a sparse series. */
export interface EntityMentionMonth {
  month: string
  count: number
}

export interface EntityDetail {
  key: string
  canonicalName: string
  type: EntityTypeLabel
  /** Confirmed Wikidata link (ticket 41), if any — null when unlinked, whether because ticket 41
   *  hasn't shipped or this particular entity just hasn't been linked yet. Never a broken/missing
   *  section either way (docs/spec-entity-wiki.md). */
  wikidataId: string | null
  /** External descriptive context (ticket 90), all keyed off `wikidataId` — null until an Admin
   *  links Wikidata and the enrich job runs. `wikidataDescription` renders as the hero dek;
   *  `wikipediaExtract`/`wikipediaUrl` render in a fenced "Kontext z Wikipedie" block labelled
   *  "ne zpravodajství tohoto nástroje", never as this tool's own reporting (ADR 0012 / 0041,
   *  spec User Story 4). */
  wikidataDescription: string | null
  wikipediaExtract: string | null
  wikipediaUrl: string | null
  /** The entity's Wikimedia photo (ticket 41), if fetched — null otherwise. Carries the
   *  attribution the infobox credits, same as `NarrativeLeadImage`. */
  image: EntityWikiImage | null
  /** Canonical names of every entity confirmed (ticket 40) to be the same real-world entity as
   *  this one, merged away into it — empty, not undefined, when none, whether because ticket 40
   *  hasn't shipped or no merge has touched this entity yet. Never a missing section either way
   *  (docs/spec-entity-wiki.md). */
  aliases: string[]
  /** COMPLETE-Event mention stats (ticket 90). `firstMentionAt`/`lastMentionAt` are null when no
   *  COMPLETE Event mentions the entity yet. `eventCount` is COMPLETE-only, so it can be lower
   *  than the internal cross-status `Entity.storyCount`. `relationCount` is the total asserted
   *  entity-relations (may exceed `relations.length`, which is capped). */
  eventCount: number
  firstMentionAt: string | null
  lastMentionAt: string | null
  relationCount: number
  coMentions: EntityCoMentionItem[]
  mentionTimeline: EntityMentionMonth[]
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
 *  not a live query — see `thread.recompute`. `slug` (ticket 68) links to the dedicated
 *  `/thread/:slug` page — this inline surface stays as-is otherwise. */
export interface ThreadSummaryItem {
  title: string
  slug: string
  memberCount: number
  members: ThreadMemberItem[]
}

export type ThreadStatusLabel = 'active' | 'dormant' | 'closed'

/** Chronology entry on the dedicated Thread page (ticket 68/69) — Thread-member (Story/Analysis)
 *  granularity, real fields only. No "what changed" narrative and no breakthrough/correction
 *  marks (ticket 65's grilling session — nothing in this codebase classifies a member that way).
 *  `agreementCategory` and `sourceOverlap` are the same real, already-computed per-Analysis
 *  fields `AnalysisDetail` exposes elsewhere, not new numbers invented for this page. */
export interface ThreadTimelineItem {
  analysisId: string
  title: string
  eventTime: string
  sourceCount: number
  sourceOverlap?: SourceOverlapInfo
  agreementCategory: AgreementCategory
}

/** What a single Coverage row was actually cited for, derived by matching its `articleUrl`
 *  against every dimension item's `Attribution.articleUrl` on its own Analysis — never a
 *  fabricated percentage (ticket 65's grilling session rejected the reference design's per-row
 *  "Shoda %", which has no real per-outlet backing). A Coverage can carry more than one tag (cited
 *  under both `agreement` and `framing`, say) or none at all — "not singled out in any dimension
 *  item" is a real, honest state, not an error. */
export type ThreadArticleTag = 'agrees' | 'contradicts' | 'unique'

/** One row of the "all articles in this thread" table (ticket 68/69) — individual-outlet-article
 *  granularity, unlike `ThreadTimelineItem`'s per-member granularity above. */
export interface ThreadArticleRow {
  outlet: string
  publishedAt: string
  /** Absent, never fabricated from the outlet name, when this Coverage's own title extraction
   *  failed or wasn't attempted — same convention `CoverageInfo.title` already follows. */
  title?: string
  articleUrl: string
  tags: ThreadArticleTag[]
}

export interface ThreadSourceRow {
  outlet: string
  coverageCount: number
}

/** One entry in the Thread page's open-questions rail (ticket 67/74) — a tension still genuinely
 *  unresolved across the Thread's members, per the LLM synthesis in `threadOpenQuestionsPass.ts`.
 *  Backend-verified traceability (which specific dimension items each question is about) isn't
 *  surfaced here, only the prose — see `Thread.openQuestions`'s persisted shape for the full
 *  `relatedItems` citation. `[]` both before `thread.synthesizeOpenQuestions` has ever run and
 *  when it ran and found nothing genuinely open — both render identically (an empty rail). */
export interface ThreadOpenQuestionItem {
  question: string
  detail: string
}

/** One point of a `ClaimSeries` (ticket 72/75) — a single member Analysis's own reported figure
 *  for a numeric claim tracked across the Thread's days. `value`/`unit`/`sourceIds` are the same
 *  deterministically-parsed fields `NarrativeValueRef` already carries (never LLM-computed); `date`
 *  is that member's own `eventTime`, what a trend chart plots against. */
export interface ClaimSeriesPoint {
  date: string
  value: number
  unit: string | null
  sourceIds: string[]
}

/** One numeric claim tracked across two or more of a Thread's member Analyses over time (ticket
 *  72/75) — membership decided by an LLM judging entity-co-occurrence candidates, never
 *  mechanically (ticket 72's Answer). `points` is ordered oldest-first, ready for ticket 76's
 *  `kind: 'line'` chart to plot directly. A series with only one point is a normal, expected state
 *  (most tracked values never recur in a later member) — not filtered out here; deciding what
 *  counts as "worth showing as a trend" is ticket 76's frontend's call, not this type's. */
export interface ClaimSeriesItem {
  id: string
  points: ClaimSeriesPoint[]
}

/** The dedicated Thread page's full read model (ticket 68 / ADR 0037) — `GET /api/thread/:slug`.
 *  `averageAgreementPercentage`/`contradictionCount` are real aggregates over every visible
 *  member's own already-computed `sourceOverlap`/`contradiction` dimension, not new synthesis.
 *  Has no chart *block* field — ticket 66 (chart `NarrativeBlock`) never gained a Thread-side
 *  `NarrativeDocument` to embed one in (ticket 73's Implementation notes); `claimSeries` is the
 *  raw tracked data a future ticket would need to actually render one here. */
export interface ThreadDetail {
  title: string
  slug: string
  status: ThreadStatusLabel
  firstEventAt: string
  lastEventAt: string
  memberCount: number
  sourceCount: number
  averageAgreementPercentage: number | null
  contradictionCount: number
  timeline: ThreadTimelineItem[]
  articles: ThreadArticleRow[]
  sources: ThreadSourceRow[]
  claimSeries: ClaimSeriesItem[]
  entities: EntityMentionItem[]
  openQuestions: ThreadOpenQuestionItem[]
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
  /** An illustrative lead image for the Narrative (ticket 51), if one was found by the same
   *  `narrative.generate` job — sourced from a free image bank by topic relevance, never the
   *  source outlets' own article images (licensing). Undefined both when the Narrative itself
   *  hasn't generated yet and when it has but no image was found/fetched — `NarrativeArticle`
   *  renders identically (no lead image, no broken-image state) either way. */
  leadImage?: NarrativeLeadImage
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
  | NarrativeChartBlock

/** A chart comparing multiple already-declared `NarrativeValueRef`s (ticket 66/73's hybrid
 *  mechanism) — the LLM decides whether/where to place one and authors `caption`, but never
 *  invents the numbers: `valueIds` are references into this document's own `valueRefs`, each with
 *  its own `normalizedValue` already computed deterministically (ADR 0014). A single
 *  `NarrativeValueRef` only ever carries one canonical figure (its `sourceIds` are corroborating
 *  sources for that *same* number, not differing reports), so a chart worth showing needs two or
 *  more distinct `valueIds` — e.g. the two conflicting figures of a `contradiction` assertion —
 *  never just one ref's own source list. Only `kind: 'bar'` has a real producer as of ticket 73;
 *  `'line'`/`'scatter'`/`'pie'` exist so ticket 72's claim-tracking-over-time consumer (and any
 *  later chart consumer) doesn't require another union change. */
export type NarrativeChartBlock = {
  type: 'chart'
  kind: 'bar' | 'line' | 'scatter' | 'pie'
  valueIds: string[]
  caption: NarrativeInline[]
}

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
  /** This Entity's `EntityImage` (ticket 41 / ADR 0034), if one has been fetched — resolved
   *  server-side from the Story's known-entity list at Narrative generation time, same "never
   *  asked of the LLM" treatment as `canonicalName`. Null both when the Entity has no linked
   *  Wikidata id and when it does but no image was ever fetched/enriched — ticket 48's frontend
   *  degrades identically either way, never a broken-image state. */
  imageUrl: string | null
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

/** A Narrative's illustrative lead image (ticket 51) — deliberately not part of
 *  `NarrativeDocument` itself: unlike every field above, it's never LLM-emitted content, just a
 *  deterministic search-API pick, so it stays a sibling field on `AnalysisDetail` instead of
 *  living inside the document ADR 0034 defines. `imageUrl` is always a display-ready size (the
 *  provider's own resized thumbnail when one was fetched, its full original otherwise) — never
 *  the multi-megabyte original a naive hero rendering would otherwise load. */
export interface NarrativeLeadImage {
  imageUrl: string
  author: string | null
  license: string | null
  sourceUrl: string
}
