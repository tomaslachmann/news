/** The ten-segment `.gauge` bar (`ds/components.css`) — shared rendering for every gauge on the
 *  site. Domain-specific bits (what "bad" means, the aria-label wording) are each call site's own
 *  decision, never re-derived here: `ArticlePage`'s Source Overlap gauge (ticket 38 / ADR 0030)
 *  and `HomePage`'s own two gauges (`StoryByline`'s per-Article overlap, `ConflictsSection`'s
 *  contradiction overlap) all derive `bad`/`pct` from real backend-interpreted data (tickets
 *  58–61's homepage-real-data work) — none of them read from fabricated sample numbers any more.
 *  Only `.gauge i.is-on.is-bad` gets a distinct colour; there's no separate "mid" segment
 *  treatment. */
export function Gauge({
  pct,
  bad,
  big,
  ariaLabel,
}: {
  pct: number
  bad: boolean
  big?: boolean
  ariaLabel: string
}) {
  const litSegments = Math.round(pct / 10)
  return (
    <span className={`gauge${big ? ' gauge--lg' : ''}`} role="img" aria-label={ariaLabel}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={i < litSegments ? `is-on${bad ? ' is-bad' : ''}` : ''} />
      ))}
    </span>
  )
}
