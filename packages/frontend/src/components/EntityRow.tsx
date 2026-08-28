import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** One linked entity in a rail list (ticket 91) — shared by the homepage "Entity dne" rail, the
 *  Article "Entity ve zprávě" rail, and the Thread one, which had each re-implemented this markup.
 *
 *  `badge` is whatever goes in the round dot — a 24h mention count (homepage) or a type-initial
 *  letter (Article/Thread). `badgeSize` (px) is the homepage's proportional-bubble override; omit
 *  it for the fixed circle. `trailing` is a fully-formed cell (the homepage's trend %), rendered
 *  as-is so the caller keeps control of its `is-up`/`is-down` class; omit it and an empty cell
 *  holds the grid column. */
export function EntityRow({
  to,
  badge,
  badgeSize,
  name,
  meta,
  trailing,
}: {
  to: string
  badge: ReactNode
  badgeSize?: number
  name: string
  meta: ReactNode
  /** A fully-formed trailing cell, or a falsy value for none. */
  trailing?: ReactElement | false | null
}) {
  return (
    <Link className="erow" to={to}>
      <span className="erow__c">
        <span
          className="erow__dot"
          style={badgeSize ? { inlineSize: badgeSize, blockSize: badgeSize } : undefined}
        >
          {badge}
        </span>
      </span>
      <span>
        <span className="erow__n hl">{name}</span>
        <span className="erow__k">{meta}</span>
      </span>
      {trailing || <span className="erow__t" />}
    </Link>
  )
}
