import type { EntityDetail } from '@/services/entities'
import { ENTITY_TYPE_LABELS } from '@/lib/entityTypeLabels'
import { formatDate } from '@/lib/formatDate'
import { formatCzechCount } from '@/lib/formatCount'

const MONTH_LABEL = new Intl.DateTimeFormat('cs-CZ', { month: 'short', year: 'numeric' })

/** A single month with no neighbours isn't a trend worth a chart — same "a couple of numbers
 *  aren't a series" bar `trendWorthyClaimSeries` (threadPageViewModel) draws for claim series. */
export const MIN_MONTHS_FOR_TIMELINE = 2

/** "od 3. bře 2026 do 1. srp 2026", or a single date when both ends fall in one day, or `null`
 *  when the entity has no COMPLETE-Event mention yet. */
export function formatMentionSpan(
  firstMentionAt: string | null,
  lastMentionAt: string | null
): string | null {
  if (!firstMentionAt || !lastMentionAt) return null
  const first = formatDate(firstMentionAt)
  const last = formatDate(lastMentionAt)
  return first === last ? first : `${first} – ${last}`
}

export interface InfoboxRow {
  label: string
  value: string
}

/** The infobox key-facts list. Rows with nothing real to show (no aliases, no mentions yet) are
 *  omitted rather than rendered as "—" — the same "a real absence, not a fabricated zero" rule
 *  `buildThreadStats` follows. */
export function entityInfoboxRows(detail: EntityDetail): InfoboxRow[] {
  const rows: InfoboxRow[] = [{ label: 'Typ', value: ENTITY_TYPE_LABELS[detail.type] }]

  if (detail.aliases.length > 0) {
    rows.push({ label: 'Také známo jako', value: detail.aliases.join(', ') })
  }

  const span = formatMentionSpan(detail.firstMentionAt, detail.lastMentionAt)
  if (span) rows.push({ label: 'Zmiňováno', value: span })

  if (detail.eventCount > 0) {
    rows.push({
      label: 'Články',
      value: formatCzechCount(detail.eventCount, 'článek', 'články', 'článků'),
    })
  }
  if (detail.relationCount > 0) {
    rows.push({
      label: 'Vztahy',
      value: formatCzechCount(detail.relationCount, 'vztah', 'vztahy', 'vztahů'),
    })
  }

  return rows
}

export interface TimelinePoint {
  label: string
  count: number
}

/** `YYYY-MM` buckets → chart rows with a short Czech month label. Returns `[]` (caller renders no
 *  chart) below `MIN_MONTHS_FOR_TIMELINE`. */
export function timelineChartData(mentionTimeline: EntityDetail['mentionTimeline']): TimelinePoint[] {
  if (mentionTimeline.length < MIN_MONTHS_FOR_TIMELINE) return []
  return mentionTimeline.map(({ month, count }) => {
    const [year, monthNo] = month.split('-').map(Number)
    const label = MONTH_LABEL.format(new Date(year, monthNo - 1, 1))
    return { label, count }
  })
}

/** Is there any external encyclopedic text to show a lead block for? */
export function hasWikiContext(detail: EntityDetail): boolean {
  return Boolean(detail.wikidataDescription || detail.wikipediaExtract)
}
