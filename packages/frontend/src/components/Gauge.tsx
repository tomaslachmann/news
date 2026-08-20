/** The ten-segment `.gauge` bar (`ds/components.css`) — shared rendering for every gauge on the
 *  site. Domain-specific bits (what "bad" means, the aria-label wording) are each call site's own
 *  decision: AnalysisPage's real Source Overlap gauge (ticket 38 / ADR 0030) derives `bad` from
 *  the backend-interpreted tier, never re-deriving the 85/65 boundaries itself; HomePage's sample
 *  sections are a literal port of the reference mockup's own fabricated numbers and keep its
 *  hardcoded threshold — there is no real tier to read there. Only `.gauge i.is-on.is-bad` gets a
 *  distinct colour; there's no separate "mid" segment treatment. */
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
