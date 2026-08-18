import * as sourceRepo from '../repositories/source.js'
import type { Source } from '../repositories/source.js'

/** The one place a URL becomes a hostname for identity purposes — every resolveSource* caller
 *  routes through this, so "www.idnes.cz" and "idnes.cz" are never treated as different hosts. */
export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function hostnameSuffixes(hostname: string): string[] {
  const parts = hostname.split('.')
  const suffixes: string[] = []
  // Stops one short of the bare TLD ("cz") — that's never a real Source.domains entry, and
  // matching it would make every unrelated .cz domain collide into whichever Source happened to
  // register the TLD itself (impossible today, but not worth relying on).
  for (let i = 0; i < parts.length - 1; i++) suffixes.push(parts.slice(i).join('.'))
  return suffixes
}

/** Most-specific-first: "servis.idnes.cz" matches a Source whose domains include "idnes.cz"
 *  even though "servis.idnes.cz" itself was never explicitly configured — see docs/audit.md
 *  P0-6. Pure and synchronous so it's unit-testable without a DB. */
export function matchSourceByHostname(hostname: string, sources: Source[]): Source | undefined {
  const domainToSource = new Map<string, Source>()
  for (const source of sources) {
    for (const domain of source.domains) domainToSource.set(domain, source)
  }
  for (const suffix of hostnameSuffixes(hostname)) {
    const match = domainToSource.get(suffix)
    if (match) return match
  }
  return undefined
}

async function resolveHostname(hostname: string): Promise<Source> {
  const sources = await sourceRepo.findAllSources()
  const matched = matchSourceByHostname(hostname, sources)
  if (matched) return matched
  // An outlet outside the curated RSS list (typically a GDELT result) — never silently dropped
  // or lumped under an unrelated Source; gets its own row so it shows up as itself everywhere,
  // and can be merged into a known Source later if it turns out to be a fresh domain for one.
  return sourceRepo.findOrCreateUnverifiedSource(hostname)
}

/** For a full article URL — human-seeded submissions, custom URLs, Discovery candidates. */
export function resolveSourceByUrl(url: string): Promise<Source> {
  return resolveHostname(hostnameFromUrl(url))
}

/** For a bare hostname — GDELT's `domain` field, which arrives pre-extracted, not as a URL. */
export function resolveSourceByDomain(domain: string): Promise<Source> {
  return resolveHostname(domain.replace(/^www\./, ''))
}

/** Batch form of resolveSourceByDomain — one findAllSources() call for the whole batch instead
 *  of one per domain. Use whenever resolving many domains from the same request/poll (GDELT can
 *  return up to 25 articles per call); resolveSourceByDomain alone would issue that many
 *  redundant SELECTs against a table small enough that this function's whole point is doing it
 *  once. Returns a map keyed by the same normalized (www-stripped) domain passed in. */
export async function resolveSourcesByDomains(domains: string[]): Promise<Map<string, Source>> {
  const normalized = domains.map((d) => d.replace(/^www\./, ''))
  const sources = await sourceRepo.findAllSources()
  const result = new Map<string, Source>()
  const unmatched = new Set<string>()

  for (const domain of new Set(normalized)) {
    const matched = matchSourceByHostname(domain, sources)
    if (matched) result.set(domain, matched)
    else unmatched.add(domain)
  }

  await Promise.all(
    [...unmatched].map(async (domain) => {
      result.set(domain, await sourceRepo.findOrCreateUnverifiedSource(domain))
    })
  )

  return result
}
