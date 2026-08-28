import type { EntityType } from '../repositories/entity.js'
import { fetchWithRetry, NEWS_TRIANGULATOR_USER_AGENT } from './httpClient.js'

// Optional cross-check for the semi-automated Wikidata linker (ticket 93 / ADR 0042, research §3):
// the hosted OpenRefine-Wikibase reconciliation service. Before auto-linking, the scan job asks
// this independently-implemented service for its own opinion and requires it to agree (same top
// Q-id, `match: true` — its own "score > ~95 AND beats #2 by > 10" rule, research §3.3). It is a
// volunteer-run WMCloud service with no published rate limits, so every non-answer — 429, timeout,
// any non-OK — surfaces as ReconcileUnavailableError and the job falls back to the admin queue
// rather than blocking or treating silence as agreement.

const TIMEOUT_MS = 8_000
const RECONCILE_URL = 'https://wikidata-reconciliation.wmcloud.org/cs/api'
const CANDIDATE_LIMIT = 3

/** The broad Wikidata class to constrain reconciliation by, per entity type. The service walks
 *  `P279*` subclasses server-side (research §3.3), so the root class is the right thing to pass —
 *  unlike our own CirrusSearch path, which needs the enumerated subtype list. */
const RECONCILE_TYPE_QID: Record<EntityType, string> = {
  PERSON: 'Q5', // human
  COUNTRY: 'Q6256', // country
  PLACE: 'Q486972', // human settlement
  ORGANIZATION: 'Q43229', // organization
}

export class ReconcileUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReconcileUnavailableError'
  }
}

export interface ReconcileTopCandidate {
  qid: string
  score: number
  match: boolean
}

interface ReconcileResponse {
  [key: string]: { result?: { id?: string; score?: number; match?: boolean }[] }
}

/** Reconcile one name against the hosted service, constrained to the entity type's broad class.
 *  Returns the top candidate (highest score) or null when the service returned an empty result
 *  set. Throws ReconcileUnavailableError on any transport/HTTP failure — the caller treats that as
 *  "no opinion", never as disagreement or agreement. */
export async function reconcile(
  query: string,
  entityType: EntityType
): Promise<ReconcileTopCandidate | null> {
  const batch = {
    q0: { query, type: RECONCILE_TYPE_QID[entityType], limit: CANDIDATE_LIMIT },
  }
  // POST with a form-encoded `queries` body — the W3C Reconciliation spec's primary transport
  // (research §3.1); `GET ?queries=` is only a SHOULD-support fallback.
  const formBody = `queries=${encodeURIComponent(JSON.stringify(batch))}`

  let res: Response
  try {
    res = await fetchWithRetry(RECONCILE_URL, TIMEOUT_MS, {
      headers: {
        'User-Agent': NEWS_TRIANGULATOR_USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      init: { method: 'POST', body: formBody },
    })
  } catch (err) {
    throw new ReconcileUnavailableError(
      `Reconciliation request failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  if (!res.ok) {
    throw new ReconcileUnavailableError(`Reconciliation service returned HTTP ${res.status}`)
  }

  let body: ReconcileResponse
  try {
    body = (await res.json()) as ReconcileResponse
  } catch (err) {
    throw new ReconcileUnavailableError(
      `Reconciliation response was not JSON: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const results = body.q0?.result ?? []
  const top = results
    .filter((r): r is { id: string; score?: number; match?: boolean } => typeof r.id === 'string')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  if (!top) return null

  return { qid: top.id, score: top.score ?? 0, match: top.match ?? false }
}
