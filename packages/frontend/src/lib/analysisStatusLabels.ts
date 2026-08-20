import type { AnalysisStatusLabel } from '@news-triangulator/shared'

/** Shared Czech label for an Analysis' status — used by both HistoryPage (the archive list) and
 *  NewAnalysisPage (the dedup-match step), so the wording can't drift between the two surfaces. */
export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatusLabel, string> = {
  draft: 'Koncept',
  complete: 'Dokončeno',
  failed: 'Selhalo',
  pending: 'Zpracovává se',
}
