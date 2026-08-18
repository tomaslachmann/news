import type { FastifyBaseLogger } from 'fastify'
import type {
  CandidateArticle,
  CreateAnalysisResponse,
  CreateAnalysisMatched,
  AnalysisDetail,
  AnalysisListItem,
  CoverageInfo,
  PatchCoveragesBody,
  Page,
} from '@news-triangulator/shared'
import { DEFAULT_PAGE_SIZE } from '@news-triangulator/shared'
import { fetchPage } from '../pagination.js'
import { scrapeArticle, ScrapeError, MIN_TEXT_LENGTH, type ScrapedArticle } from './articleScraper.js'
import { extractKeywords } from './keywordExtractor.js'
import { discoverCoverage } from './discovery.js'
import { resolveSourceByUrl } from './sourceResolver.js'
import { isBlockedContent } from './blockedContent.js'
import { verifyCandidatesAgainstAnchor, verifySameStoryLogged } from './storyVerification.js'
import { generateEmbedding } from './embeddingClient.js'
import { findBestMatch, buildEmbeddingInput, DEDUP_WINDOW_HOURS } from './storyMatching.js'
import { approveDraft } from './ingestionService.js'
import { MAX_COVERAGES_PER_ANALYSIS } from './coverageLimits.js'
import { extractEntitiesAndLinkStoryRelations } from './storyRelationPass.js'
import { runNarrativePass, type NarrativeSource, type NarrativeResult } from './narrativePass.js'
import type { SynthesisResult as SynthesisDimensions } from './synthesisPass.js'
import { NotFoundError, ValidationError, ExternalServiceError } from '../errors.js'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as synthesisResultRepo from '../repositories/synthesisResult.js'
import * as storyRelationRepo from '../repositories/storyRelation.js'
import { toCoverageInfo } from '../mappers/coverage.js'
import { toAnalysisDetail, toAnalysisListItem, resolveDisplayTitle, STATUS_MAP } from '../mappers/analysis.js'
import { toRelatedEvents } from '../mappers/storyRelation.js'

/** Submits a seed URL. Ticket 27/ADR 0019: before creating a new Analysis, checks whether the
 *  seed already matches an open Story within the dedup window — the same embedding-match +
 *  LLM-confirmation pipeline Ingestion's own attach decision now shares (unlike Ingestion's
 *  hot path, a one-off human submission can afford the LLM confirmation step). `force` skips
 *  the check entirely — the override for a confirmed-but-wrong match. */
export async function createAnalysis(
  seedUrl: string,
  opts: { force?: boolean } = {},
  log?: FastifyBaseLogger
): Promise<CreateAnalysisResponse> {
  let scraped: ScrapedArticle
  try {
    scraped = await scrapeArticle(seedUrl)
  } catch (err) {
    throw new ExternalServiceError(
      err instanceof ScrapeError ? err.message : 'Nepodařilo se načíst zdrojový článek'
    )
  }

  // Every human-seeded Story gets an embedding, so it can join the same matching pool
  // Ingestion's own Stories already do — before this, Ingestion could never recognize a human
  // had already started investigating an event. A failure here degrades gracefully (no
  // embedding, dedup check skipped) rather than blocking submission: unlike Ingestion's
  // per-item retry-next-poll safety net, there's no "next poll" for a one-off human action to
  // fall back on, and a Story without an embedding is no worse off than every human-seeded
  // Story was before this ticket.
  let embedding: number[] = []
  try {
    embedding = await generateEmbedding(
      buildEmbeddingInput({ title: scraped.title, excerpt: scraped.excerpt }),
      'submissionDedup'
    )
  } catch (err) {
    log?.warn({ seedUrl, err }, 'Could not generate embedding for seed article; skipping dedup check')
  }

  if (!opts.force && embedding.length > 0) {
    const candidates = await analysisRepo.findRecentStoriesForMatching(DEDUP_WINDOW_HOURS)
    const match = findBestMatch(embedding, candidates, new Date())
    // A FAILED match is treated as no match at all — unlike Ingestion's own "already seen,
    // don't recreate" handling of a FAILED match, a human explicitly submitting a URL deserves
    // a fresh attempt, not a silent no-op.
    if (match && match.analysisStatus !== 'FAILED') {
      const verdict = await verifySameStoryLogged(scraped.title, match.anchorHeadline, log)
      if (verdict.sameEvent) {
        // findRecentStoriesForMatching only ever produces Prisma's AnalysisStatus enum values;
        // findBestMatch's StoryCandidate type widens analysisStatus to `string` since it's
        // shared with Ingestion's use, which doesn't need the narrower type. The `!== 'FAILED'`
        // guard above already rules out STATUS_MAP ever producing 'failed' here.
        const status = match.analysisStatus as analysisRepo.AnalysisStatus
        return {
          outcome: 'matched',
          id: match.analysisId,
          title: resolveDisplayTitle(match.headline, match.anchorHeadline),
          matchedStatus: STATUS_MAP[status] as CreateAnalysisMatched['matchedStatus'],
        }
      }
    }
  }

  let keywords: string[]
  try {
    keywords = await extractKeywords(scraped.title, scraped.excerpt)
  } catch {
    throw new ExternalServiceError('Nepodařilo se extrahovat klíčová slova z článku')
  }

  const analysis = await analysisRepo.createAnalysis({ seedUrl, seedHeadline: scraped.title, embedding })

  return { outcome: 'created', id: analysis.id, seedHeadline: analysis.seedHeadline, keywords }
}

/** The "continue with this match" action from HomePage's dedup-match screen (ticket 27):
 *  attaches the seed as Coverage on the already-open Analysis instead of creating a duplicate.
 *  A DRAFT match also runs through the normal approve flow inline — an Admin explicitly seeking
 *  this story out is a stronger, more deliberate signal than Ingestion finding it passively, so
 *  it shouldn't then sit in the Ingestion queue waiting for a second approval action from the
 *  same person. */
export async function attachSeedToMatch(
  analysisId: string,
  seedUrl: string,
  log?: FastifyBaseLogger
): Promise<void> {
  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')
  if (analysis.status !== 'DRAFT' && analysis.status !== 'PENDING') {
    throw new ValidationError('Lze připojit pouze ke konceptu nebo probíhající analýze')
  }

  let scraped: ScrapedArticle
  try {
    scraped = await scrapeArticle(seedUrl)
  } catch (err) {
    throw new ExternalServiceError(
      err instanceof ScrapeError ? err.message : 'Nepodařilo se načíst zdrojový článek'
    )
  }

  // Re-check status right before writing, not the check from before the scrape above — scraping
  // is a network call that can take a while, long enough for a concurrent approve/reject via the
  // Ingestion review queue to have changed the status underneath this request.
  const fresh = await analysisRepo.findAnalysisById(analysisId)
  if (!fresh || (fresh.status !== 'DRAFT' && fresh.status !== 'PENDING')) {
    throw new ValidationError('Analýza mezitím změnila stav; zkuste to prosím znovu')
  }

  // Each Source contributes at most one Coverage per Analysis (CONTEXT.md) — skip rather than
  // duplicate if this outlet is already attached (e.g. Ingestion attached it between the seed's
  // dedup match and this confirm click). Also enforced at the DB level (see docs/adr — Coverage's
  // partial unique index), this check just avoids relying on that constraint throwing.
  const source = await resolveSourceByUrl(seedUrl)
  const existingCoverages = await coverageRepo.findCoveragesForAnalysis(analysisId)
  if (!existingCoverages.some((c) => c.sourceId === source.id)) {
    // Best-effort, not a hard reject — unlike confirmCoverages, failing to attach here would
    // block the "continue with this match"/approve flow over a cap that has nothing to do with
    // what the admin is actually trying to do (code review, ticket 03).
    const result = await coverageRepo.addCoveragesIfWithinLimit(
      analysisId,
      [{ analysisId, sourceId: source.id, title: scraped.title, articleUrl: seedUrl, status: 'PENDING' }],
      MAX_COVERAGES_PER_ANALYSIS
    )
    if (!result.ok) {
      log?.warn(
        { analysisId, activeCount: result.activeCount },
        'Skipped attaching seed as Coverage: at MAX_COVERAGES_PER_ANALYSIS, or a concurrent write already attached this Source'
      )
    }
  }

  if (fresh.status === 'DRAFT') {
    await approveDraft(analysisId, log)
  }
}

export async function discoverSources(
  analysisId: string,
  keywords: string[],
  log?: FastifyBaseLogger
): Promise<CandidateArticle[]> {
  const analysis = await analysisRepo.findAnalysisWithStory(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')

  const { candidates } = await discoverCoverage(keywords, log)

  // Every Discovery candidate is verified against the seed's Story before it's ever offered
  // at the Review Step — closes the gap where a human was the only defense against a bad
  // keyword/GDELT match (ADR 0017). A verification failure excludes the candidate rather than
  // aborting the whole request — see verifyCandidatesAgainstAnchor.
  const verified = await verifyCandidatesAgainstAnchor(candidates, analysis.story.anchorHeadline, log)

  // Bounded by the same MAX_COVERAGES_PER_ANALYSIS cap confirmCoverages enforces — otherwise
  // repeated discovery calls could accumulate past it without ever going through a check (code
  // review, ticket 03). Truncates rather than rejecting the whole batch (see
  // addCoveragesUpToLimit); the returned candidates are filtered down to what was actually
  // created so the Review Step never offers a candidate that isn't really persisted.
  const { inserted, droppedCount } = await coverageRepo.addCoveragesUpToLimit(
    analysisId,
    verified.map((c) => ({
      analysisId,
      sourceId: c.sourceId,
      title: c.title,
      articleUrl: c.url,
      publishedAt: c.publishedAt,
      status: 'PENDING' as const,
    })),
    MAX_COVERAGES_PER_ANALYSIS
  )
  if (droppedCount > 0) {
    log?.warn(
      { analysisId, droppedCount },
      'Discovery found more candidates than the remaining Coverage cap allowed; dropping the rest'
    )
  }

  const insertedUrls = new Set(inserted.map((c) => c.articleUrl))
  return verified.filter((c) => insertedUrls.has(c.url))
}

export async function confirmCoverages(
  analysisId: string,
  body: PatchCoveragesBody,
  log?: FastifyBaseLogger
): Promise<CoverageInfo[]> {
  const { confirmedIds, customUrls = [], manualTexts = [] } = body

  const analysis = await analysisRepo.findAnalysisWithStory(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')

  const manualMap = new Map(manualTexts.map((m) => [m.id, m.text]))
  if (manualMap.size > 0) {
    await Promise.all(
      [...manualMap.entries()].map(([covId, text]) =>
        coverageRepo.updateCoverage(covId, { extractedText: text, status: 'OK' })
      )
    )
  }

  const existingUrls = new Set(await coverageRepo.findCoverageUrlsForAnalysis(analysisId))
  const newUrls = customUrls.filter((u) => {
    try {
      new URL(u)
      return !existingUrls.has(u)
    } catch {
      return false
    }
  })

  const newCoverages = await Promise.all(
    newUrls.map(async (u) => ({
      analysisId,
      sourceId: (await resolveSourceByUrl(u)).id,
      articleUrl: u,
      status: 'PENDING' as const,
    }))
  )

  // Exclude-not-confirmed, include-confirmed, the active-Coverage cap check, and the new-Coverage
  // insert all happen atomically in one transaction (see reconcileCoverages) — otherwise a
  // request the cap rejects could still have already committed the exclude/include writes,
  // silently reactivating previously-excluded Coverage even though the request failed.
  const result = await coverageRepo.reconcileCoverages(
    analysisId,
    confirmedIds,
    newCoverages,
    MAX_COVERAGES_PER_ANALYSIS
  )
  if (!result.ok) {
    throw new ValidationError(`Analýza může mít nejvýše ${MAX_COVERAGES_PER_ANALYSIS} zdrojů`)
  }

  const pending = await coverageRepo.findCoveragesForAnalysis(analysisId, { onlyStatus: 'PENDING' })

  await Promise.allSettled(
    pending.map(async (coverage) => {
      try {
        const scraped = await scrapeArticle(coverage.articleUrl)
        const isBlocked = scraped.fullText.length < MIN_TEXT_LENGTH || isBlockedContent(scraped.fullText)
        if (isBlocked) {
          await coverageRepo.updateCoverage(coverage.id, { status: 'EXTRACTION_FAILED' })
        } else {
          await coverageRepo.updateCoverage(coverage.id, { extractedText: scraped.fullText, status: 'OK' })
        }
      } catch {
        await coverageRepo.updateCoverage(coverage.id, { status: 'EXTRACTION_FAILED' })
      }
    })
  )

  const updated = await coverageRepo.findCoveragesForAnalysis(analysisId)

  // Entity extraction (ticket 34) + Story-relation candidate generation & confirmation (ticket
  // 35) — human-seeded path. Runs here, not at createAnalysis, because this is the earliest
  // point real multi-source extractedText exists for a human-seeded Story (createAnalysis only
  // ever has the single seed article). Entirely best-effort: nothing in this pipeline is ever
  // allowed to block this confirmation flow.
  const okTexts = updated.filter((c) => c.status === 'OK' && c.extractedText).map((c) => c.extractedText!)
  await extractEntitiesAndLinkStoryRelations(
    analysis.storyId,
    okTexts,
    analysis.story,
    {
      updateStoryEntities: analysisRepo.updateStoryEntities,
      findRelationCandidateStories: storyRelationRepo.findRelationCandidateStories,
      createStoryRelation: storyRelationRepo.createStoryRelation,
    },
    log
  )

  return updated.map(toCoverageInfo)
}

// Keyed by analysisId — dedupes concurrent first-view requests for the same Analysis so they
// share one LLM call instead of each racing to generate (and pay for) their own.
const inFlightNarrativeGenerations = new Map<string, Promise<NarrativeResult['segments'] | null>>()

function generateAndCacheNarrative(
  analysisId: string,
  sources: NarrativeSource[],
  dimensions: SynthesisDimensions,
  log?: FastifyBaseLogger
): Promise<NarrativeResult['segments'] | null> {
  const existing = inFlightNarrativeGenerations.get(analysisId)
  if (existing) return existing

  const generation = (async () => {
    try {
      const narrativeResult = await runNarrativePass(sources, dimensions, log)
      // Every segment can end up dropped by quote verification (see quoteVerification.ts). An
      // empty result must not be cached as if generation succeeded — [] is truthy, so a naive
      // `!narrative` regeneration check would treat this Analysis as permanently, unfixably done.
      if (narrativeResult.segments.length === 0) {
        log?.warn(
          { analysisId },
          'Cross-Source Narrative generation produced no verifiable segments; serving without one'
        )
        return null
      }
      await synthesisResultRepo.updateSynthesisResultNarrative(analysisId, narrativeResult.segments)
      return narrativeResult.segments
    } catch (err) {
      log?.warn({ analysisId, err }, 'Cross-Source Narrative generation failed; serving without one')
      return null
    } finally {
      inFlightNarrativeGenerations.delete(analysisId)
    }
  })()

  inFlightNarrativeGenerations.set(analysisId, generation)
  return generation
}

export async function getAnalysisDetail(
  analysisId: string,
  log?: FastifyBaseLogger
): Promise<AnalysisDetail> {
  const analysis = await analysisRepo.findAnalysisWithDetails(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')

  if (analysis.status === 'COMPLETE' && analysis.synthesisResult && !analysis.synthesisResult.narrative) {
    const sources: NarrativeSource[] = analysis.coverages
      .filter((c) => c.status === 'OK' && c.extractedText)
      .map((c) => ({ outlet: c.source.name, articleUrl: c.articleUrl, fullText: c.extractedText! }))

    if (sources.length > 0) {
      const dimensions = analysis.synthesisResult.dimensions as unknown as SynthesisDimensions
      const segments = await generateAndCacheNarrative(analysisId, sources, dimensions, log)
      if (segments) analysis.synthesisResult.narrative = segments
    }
  }

  // AnalysisPage only ever renders relatedEvents for a COMPLETE Analysis (a Draft/PENDING/FAILED
  // one never reaches that branch) — skip the extra StoryRelation/Story/Analysis join entirely
  // for every other status rather than fetching data that can never be shown.
  const relatedEvents =
    analysis.status === 'COMPLETE'
      ? toRelatedEvents(
          analysis.storyId,
          await storyRelationRepo.findPublishedRelationsForStory(analysis.storyId)
        )
      : []

  return toAnalysisDetail(analysis, relatedEvents)
}

export async function listAnalyses(
  includeAllStatuses: boolean,
  cursor: string | undefined,
  limit: number = DEFAULT_PAGE_SIZE
): Promise<Page<AnalysisListItem>> {
  const { items, nextCursor } = await fetchPage(cursor, limit, (decoded, boundedLimit) =>
    analysisRepo.findAnalysesPage(includeAllStatuses, decoded, boundedLimit)
  )
  return { items: items.map(toAnalysisListItem), nextCursor }
}
