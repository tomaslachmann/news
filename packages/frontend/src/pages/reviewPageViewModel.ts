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
      'Nic se nesmazalo — vyřazené zdroje zůstávají u konceptu jen označené jako vyloučené. ' +
      'Kterýkoli z nich můžete níže zaškrtnutím vrátit do analýzy.',
    groups,
  }
}

const EXCLUSION_FALLBACK_LABEL = 'Vyloučeno — zaškrtnutím vrátíte do analýzy'

/** Ticket 95 — the per-row label for an auto-excluded source in the `/review/:id` picker. Uses the
 *  specific quality-gate reason when *this* approval's `draftExclusions` still names the row (fresh
 *  navigation from `/admin/ingestion`); a neutral fallback otherwise — on a plain reload the nav
 *  state is gone, and a source an Admin deselected in an earlier round carries no reason at all. */
export function coverageExclusionLabel(coverageId: string, exclusions: DraftExclusion[]): string {
  const reason = exclusions.find((e) => e.coverageId === coverageId)?.reason
  return REASON_GROUPS.find((g) => g.reason === reason)?.label ?? EXCLUSION_FALLBACK_LABEL
}
