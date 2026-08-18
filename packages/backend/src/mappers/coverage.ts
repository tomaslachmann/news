import type { CoverageInfo } from '@news-triangulator/shared'
import type { CoverageStatus, CoverageWithSource } from '../repositories/coverage.js'

const STATUS_MAP: Record<CoverageStatus, CoverageInfo['status']> = {
  OK: 'ok',
  EXTRACTION_FAILED: 'extraction-failed',
  PENDING: 'pending',
}

export function toCoverageInfo(coverage: CoverageWithSource): CoverageInfo {
  return {
    id: coverage.id,
    outlet: coverage.source.name,
    title: coverage.title ?? undefined,
    articleUrl: coverage.articleUrl,
    publishedAt: coverage.publishedAt ?? undefined,
    status: STATUS_MAP[coverage.status],
  }
}
