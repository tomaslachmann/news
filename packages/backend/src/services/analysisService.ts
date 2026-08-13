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
import { NotFoundError, ExternalServiceError } from '../errors.js'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import { toCoverageInfo } from '../mappers/coverage.js'
import { toAnalysisDetail, toAnalysisListItem } from '../mappers/analysis.js'

export async function createAnalysis(seedUrl: string): Promise<CreateAnalysisResponse> {
  let scraped: ScrapedArticle
  try {
    scraped = await scrapeArticle(seedUrl)
  } catch (err) {
    throw new ExternalServiceError(
      err instanceof ScrapeError ? err.message : 'Failed to fetch the seed article'
    )
  }

  let keywords: string[]
  try {
    keywords = await extractKeywords(scraped.title, scraped.excerpt)
  } catch {
    throw new ExternalServiceError('Failed to extract keywords from the article')
  }

  const analysis = await analysisRepo.createAnalysis({ seedUrl, seedHeadline: scraped.title })

  return { id: analysis.id, seedHeadline: analysis.seedHeadline, keywords }
}

export async function discoverSources(
  analysisId: string,
  keywords: string[],
  log?: FastifyBaseLogger
): Promise<CandidateArticle[]> {
  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analysis not found')

  const candidates = await discoverCoverage(keywords, log)

  await coverageRepo.createCoverages(
    candidates.map((c) => ({
      analysisId,
      outlet: c.outlet,
      title: c.title,
      articleUrl: c.url,
      publishedAt: c.publishedAt,
      status: 'PENDING',
    }))
  )

  return candidates
}

export async function confirmCoverages(
  analysisId: string,
  body: PatchCoveragesBody
): Promise<CoverageInfo[]> {
  const { confirmedIds, customUrls = [], manualTexts = [] } = body

  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analysis not found')

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

export async function getAnalysisDetail(analysisId: string): Promise<AnalysisDetail> {
  const analysis = await analysisRepo.findAnalysisWithDetails(analysisId)
  if (!analysis) throw new NotFoundError('Analysis not found')
  return toAnalysisDetail(analysis)
}

export async function listAnalyses(): Promise<AnalysisListItem[]> {
  const rows = await analysisRepo.findAllAnalyses()
  return rows.map(toAnalysisListItem)
}
