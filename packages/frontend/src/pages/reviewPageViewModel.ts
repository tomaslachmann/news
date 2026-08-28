import type { DraftExclusion } from '@/services/ingestion'

type DraftExclusionReason = DraftExclusion['reason']

export interface DraftExclusionGroup {
  reason: DraftExclusionReason
  /** Why this bucket of outlets was dropped, in reader-facing Czech. */
  label: string
  /** Source display names, in the order the backend listed them. */
  outlets: string[]
}

export interface DraftExclusionNotice {
  heading: string
  detail: string
  groups: DraftExclusionGroup[]
}

// One ordered source of truth for both the label and the display order of each reason bucket, so
// the notice reads the same regardless of the order approveDraft concatenated its buckets in.
const REASON_GROUPS: { reason: DraftExclusionReason; label: string }[] = [
  { reason: 'failed-verification', label: 'Neprošly ověřením, že popisují stejnou událost' },
  { reason: 'no-title', label: 'Bez staženého názvu článku – ověření neproběhlo' },
]

/** Ticket 87 — turns `approveDraft`'s `excluded` list into the banner shown on `/review/:id` right
 *  after approval, so a source count that shrank between `/admin/ingestion` and here reads as "the
 *  quality gate did its job" rather than data loss. Returns `null` when nothing was excluded. */
export function buildDraftExclusionNotice(exclusions: DraftExclusion[]): DraftExclusionNotice | null {
  if (exclusions.length === 0) return null

  const groups = REASON_GROUPS.flatMap(({ reason, label }): DraftExclusionGroup[] => {
    // De-duped: two excluded Coverage from the same outlet (rare, but possible) shouldn't print
    // the outlet's name twice.
    const outlets = [...new Set(exclusions.filter((e) => e.reason === reason).map((e) => e.outlet))]
    return outlets.length > 0 ? [{ reason, label, outlets }] : []
  })

  return {
    heading: 'Některé zdroje byly při schválení automaticky vyřazeny',
    detail:
      'Kontrola kvality před extrakcí ověřuje, že každý připojený zdroj popisuje stejnou událost. ' +
      'Nic se nesmazalo — vyřazené zdroje zůstávají u konceptu jen označené jako vyloučené.',
    groups,
  }
}
