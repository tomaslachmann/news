import type { StoryRelationTypeLabel } from '@news-triangulator/shared'

/** Shared Czech label for a StoryRelation's type — used by both the Admin review queue
 *  (IngestionReviewPage) and the reader-facing Related Events section (AnalysisPage), so the
 *  wording can't drift between the two surfaces. */
export const RELATION_TYPE_LABELS: Record<StoryRelationTypeLabel, string> = {
  RELATED: 'Související',
  FOLLOW_UP: 'Navazující',
}
