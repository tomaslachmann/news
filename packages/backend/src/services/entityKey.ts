/** Deterministic label, not verified real-world identity — two different real-world entities
 *  that happen to normalize to the same name (e.g. two people sharing a surname) can collide
 *  under this scheme. An accepted, documented v1 limitation (see ticket 34/35's ADR); a future
 *  entity-resolution layer could disambiguate this without changing this key format. */
export function deriveEntityKey(type: string, canonicalName: string): string {
  return `${type.toLowerCase()}:${slugify(canonicalName)}`
}

const COMBINING_DIACRITICS = /[̀-ͯ]/g

function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(COMBINING_DIACRITICS, '')
      .toLowerCase()
      .trim()
      // Any Unicode letter/number, not just [a-z0-9] — a canonical_name can legitimately stay in a
      // non-Latin script (the extraction prompt allows this), and collapsing everything outside
      // ASCII to nothing would silently collide every such name onto the same empty slug.
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
  )
}
