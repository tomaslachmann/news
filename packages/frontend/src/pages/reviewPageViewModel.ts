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

const REASON_LABELS: Record<DraftExclusionReason, string> = {
  'failed-verification': 'Neprošly ověřením, že popisují stejnou událost',
  'no-title': 'Bez staženého názvu článku – ověření neproběhlo',
}

// Fixed reason order so the notice reads the same regardless of the order approveDraft happened
// to concatenate its two exclusion buckets in.
const REASON_ORDER: DraftExclusionReason[] = ['failed-verification', 'no-title']

/** Ticket 87 — turns `approveDraft`'s `excluded` list into the banner shown on `/review/:id` right
 *  after approval, so a source count that shrank between `/admin/ingestion` and here reads as "the
 *  quality gate did its job" rather than data loss. Returns `null` when nothing was excluded. */
export function buildDraftExclusionNotice(exclusions: DraftExclusion[]): DraftExclusionNotice | null {
  if (exclusions.length === 0) return null

  const groups = REASON_ORDER.flatMap((reason): DraftExclusionGroup[] => {
    const outlets = exclusions.filter((e) => e.reason === reason).map((e) => e.outlet)
    return outlets.length > 0 ? [{ reason, label: REASON_LABELS[reason], outlets }] : []
  })

  return {
    heading: 'Některé zdroje byly při schválení automaticky vyřazeny',
    detail:
      'Kontrola kvality před extrakcí ověřuje, že každý připojený zdroj popisuje stejnou událost. ' +
      'Nic se nesmazalo — vyřazené zdroje zůstávají u konceptu jen označené jako vyloučené.',
    groups,
  }
}
