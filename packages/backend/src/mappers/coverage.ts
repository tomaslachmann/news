import type { CoverageInfo } from '@news-triangulator/shared'
import type { Coverage, CoverageStatus } from '../repositories/coverage.js'

const STATUS_MAP: Record<CoverageStatus, CoverageInfo['status']> = {
  OK: 'ok',
  EXTRACTION_FAILED: 'extraction-failed',
  PENDING: 'pending',
}

export function toCoverageInfo(coverage: Coverage): CoverageInfo {
  return {
    id: coverage.id,
    outlet: coverage.outlet,
    title: coverage.title ?? undefined,
    articleUrl: coverage.articleUrl,
    publishedAt: coverage.publishedAt ?? undefined,
    status: STATUS_MAP[coverage.status],
  }
}
