/** An `Entity.key` shape: `<type>:<slug>` (e.g. `person:petr-fiala`). Lets an Admin who already
 *  knows the exact key paste it and submit without picking from the dropdown (ticket 50 keeps the
 *  direct-entry path, it's an enhancement not a removal). */
export function looksLikeEntityKey(text: string): boolean {
  return /^[a-z]+:[a-z0-9-]+$/.test(text.trim())
}

/** Arrow-key navigation over a `count`-item dropdown, wrapping at both ends. `active` of `-1`
 *  means "nothing highlighted yet"; the first ArrowDown from there lands on `0`. */
export function nextActiveIndex(active: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1
  if (active === -1) return direction === 1 ? 0 : count - 1
  return (active + direction + count) % count
}
