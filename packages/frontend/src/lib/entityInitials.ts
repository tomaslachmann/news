/** 1–2 uppercase letters for an entity's dot badge (ticket 91 follow-up) — the first letter of
 *  the first word, plus the first letter of the last word when the name has more than one
 *  ("Ratko Mladić" → "RM", "Srbsko" → "S", "Česká národní banka" → "ČB"). Czech-locale uppercase
 *  so "č"/"š"/… render as "Č"/"Š". "?" for an empty name. */
export function entityInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toLocaleUpperCase('cs')
}
