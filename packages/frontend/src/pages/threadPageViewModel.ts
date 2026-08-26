import type { ThreadDetail, ThreadTimelineItem } from '@/services/thread'
import { formatDate } from '@/lib/formatDate'

export interface ThreadStat {
  k: string
  v: string
  warn?: boolean
}

/** The `daystats` strip's contents — real numbers only (ticket 65's grilling session).
 *  "Průměrná shoda" and "Rozpory" are each omitted, not shown as 0/—, when there's nothing to
 *  report (no member has a `sourceOverlap`, or no member has any `contradiction` item) — a real
 *  absence, not a fabricated zero. */
export function buildThreadStats(thread: ThreadDetail): ThreadStat[] {
  return [
    { k: 'Otevřeno', v: formatDate(thread.firstEventAt) },
    { k: 'Zpráv ve vlákně', v: String(thread.memberCount) },
    { k: 'Zdrojů', v: String(thread.sourceCount) },
    ...(thread.averageAgreementPercentage != null
      ? [{ k: 'Průměrná shoda', v: `${thread.averageAgreementPercentage} %` }]
      : []),
    ...(thread.contradictionCount > 0
      ? [{ k: 'Rozpory', v: String(thread.contradictionCount), warn: true }]
      : []),
    { k: 'Poslední změna', v: formatDate(thread.lastEventAt) },
  ]
}

/** `items` arrives oldest-first from the backend (`ThreadDetailRow`'s `position asc` ordering) —
 *  `oldestFirst: true` keeps that order, `false` (the default view) reverses to newest-first. */
export function orderTimeline(items: ThreadTimelineItem[], oldestFirst: boolean): ThreadTimelineItem[] {
  return oldestFirst ? items : [...items].reverse()
}
