const SHORT = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })
const LONG = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })

/** Shared cs-CZ date formatting (ticket 22) — 'short' for compact list/table rows, 'long' for
 *  the navbar's utility bar. Consolidates what used to be near-identical formatter instances
 *  hand-duplicated per page. */
export function formatDate(date: string | Date, style: 'short' | 'long' = 'short'): string {
  try {
    return (style === 'long' ? LONG : SHORT).format(typeof date === 'string' ? new Date(date) : date)
  } catch {
    return typeof date === 'string' ? date : ''
  }
}
