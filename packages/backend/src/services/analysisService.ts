import type { FastifyBaseLogger } from 'fastify'
import type {
  CandidateArticle,
  CreateAnalysisResponse,
  AnalysisDetail,
  AnalysisListItem,
  CoverageInfo,
  PatchCoveragesBody,
} from '@news-triangulator/shared'
import { scrapeArticle, ScrapeError, MIN_TEXT_LENGTH, type ScrapedArticle } from './articleScraper.js'
import { extractKeywords } from './keywordExtractor.js'
import { discoverCoverage } from './discovery.js'
import { isBlockedContent } from './blockedContent.js'
import { verifyCandidatesAgainstAnchor } from './storyVerification.js'
import { runNarrativePass, type NarrativeSource, type NarrativeResult } from './narrativePass.js'
import type { SynthesisResult as SynthesisDimensions } from './synthesisPass.js'
import { NotFoundError, ExternalServiceError } from '../errors.js'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as synthesisResultRepo from '../repositories/synthesisResult.js'
import { toCoverageInfo } from '../mappers/coverage.js'
import { toAnalysisDetail, toAnalysisListItem } from '../mappers/analysis.js'

export async function createAnalysis(seedUrl: string): Promise<CreateAnalysisResponse> {
  let scraped: ScrapedArticle
  try {
    scraped = await scrapeArticle(seedUrl)
  } catch (err) {
    throw new ExternalServiceError(
      err instanceof ScrapeError ? err.message : 'Nepodařilo se načíst zdrojový článek'
    )
  }

  let keywords: string[]
  try {
    keywords = await extractKeywords(scraped.title, scraped.excerpt)
  } catch {
    throw new ExternalServiceError('Nepodařilo se extrahovat klíčová slova z článku')
  }

  const analysis = await analysisRepo.createAnalysis({ seedUrl, seedHeadline: scraped.title })

  return { id: analysis.id, seedHeadline: analysis.seedHeadline, keywords }
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

  await coverageRepo.createCoverages(
    verified.map((c) => ({
      analysisId,
      outlet: c.outlet,
      title: c.title,
      articleUrl: c.url,
      publishedAt: c.publishedAt,
      status: 'PENDING',
    }))
  )

  return verified
}

export async function confirmCoverages(
  analysisId: string,
  body: PatchCoveragesBody
): Promise<CoverageInfo[]> {
  const { confirmedIds, customUrls = [], manualTexts = [] } = body

  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')

  const manualMap = new Map(manualTexts.map((m) => [m.id, m.text]))
  if (manualMap.size > 0) {
    await Promise.all(
      [...manualMap.entries()].map(([covId, text]) =>
        coverageRepo.updateCoverage(covId, { extractedText: text, status: 'OK' })
      )
    )
  }

  await coverageRepo.excludeCoverages(analysisId, confirmedIds)
  await coverageRepo.includeCoverages(analysisId, confirmedIds)

  const existingUrls = new Set(await coverageRepo.findCoverageUrlsForAnalysis(analysisId))
  const newUrls = customUrls.filter((u) => {
    try {
      new URL(u)
      return !existingUrls.has(u)
    } catch {
      return false
    }
  })

  if (newUrls.length > 0) {
    await coverageRepo.createCoverages(
      newUrls.map((u) => ({
        analysisId,
        outlet: new URL(u).hostname.replace(/^www\./, ''),
        articleUrl: u,
        status: 'PENDING',
      }))
    )
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
      .map((c) => ({ outlet: c.outlet, articleUrl: c.articleUrl, fullText: c.extractedText! }))

    if (sources.length > 0) {
      const dimensions = analysis.synthesisResult.dimensions as unknown as SynthesisDimensions
      const segments = await generateAndCacheNarrative(analysisId, sources, dimensions, log)
      if (segments) analysis.synthesisResult.narrative = segments
    }
  }

  return toAnalysisDetail(analysis)
}

export async function listAnalyses(includeAllStatuses: boolean): Promise<AnalysisListItem[]> {
  const rows = await analysisRepo.findAllAnalyses(includeAllStatuses)
  return rows.map(toAnalysisListItem)
}
