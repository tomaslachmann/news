// Cheap, LLM-free candidate matching for automated Ingestion — replaces GDELT/keyword search
// as the retrieval mechanism. See ADR 0018. MATCH_THRESHOLD is a starting point, not a tuned
// result — expect to revisit once MatchDecision (ADR 0025) has real data to calibrate against.

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export const MATCH_THRESHOLD = 0.75

/** Bump whenever this file's scoring math changes, so MatchDecision rows (ADR 0025) can be
 *  segmented by which formula actually produced them. v2: dropped the multiplicative time-decay
 *  factor v1 used to apply (P1-7, docs/audit.md) — score is now plain cosine similarity within
 *  a hard DEDUP_WINDOW_HOURS cutoff. */
export const MATCH_SCORER_VERSION = 'storyMatching-v2'

// How far back a Story stays eligible for matching — shared by Ingestion's own per-item
// matching and human-seeded submission's dedup check (ticket 27), so both paths agree on what
// "recent" means. Was previously duplicated as a private constant in ingestionService.ts.
export const DEDUP_WINDOW_HOURS = 48

export interface StoryCandidate {
  storyId: string
  analysisId: string
  analysisStatus: string
  embedding: number[]
  createdAt: Date
  /** The Story's own anchor headline — not used by Ingestion's embedding-only matching, but
   *  needed by any caller that follows up an embedding match with an LLM same-event confirmation
   *  (ticket 27's human-seeded dedup check). Carried here rather than fetched separately since
   *  findRecentStoriesForMatching already has it for free. */
  anchorHeadline: string
  /** The candidate Analysis's generated headline, if it's already COMPLETE — otherwise null.
   *  Same rationale as anchorHeadline: needed by human-seeded submission's dedup-match response
   *  (ticket 33), carried here for free rather than fetched separately. Ignored by Ingestion's
   *  own embedding-only matching. */
  headline: string | null
}

export interface ScoredMatch {
  candidate: StoryCandidate
  score: number
}

/**
 * Ranks every candidate within DEDUP_WINDOW_HOURS by plain cosine similarity and returns the
 * single highest-scoring one — candidate plus its raw score — regardless of whether it clears
 * MATCH_THRESHOLD. `evaluateMatch` below applies that threshold; this function exists
 * separately so a caller that needs to log what was actually considered (MatchDecision, ADR
 * 0025) has the score even on a below-threshold result, which calibrating a threshold
 * specifically needs examples of.
 *
 * A candidate older than DEDUP_WINDOW_HOURS is excluded outright, never merely discounted. This
 * used to be a multiplicative time-decay factor on the score instead (halving every 24h past a
 * 24h grace period) — docs/audit.md P1-7 found that decay silently shrank the *effective*
 * matchable window to ~26-34h even though DEDUP_WINDOW_HOURS declares 48h: a candidate sitting
 * right at 40h old, with perfect similarity, would still fail to clear MATCH_THRESHOLD once
 * decayed. The window is already enforced once by the caller's own SQL query
 * (findRecentStoriesForMatching bounds by DEDUP_WINDOW_HOURS) — this filter makes that boundary
 * a real, hard property of this function itself rather than an incidental side effect of decay
 * math, so a caller that ever hands this function an un-pre-filtered candidate list still gets
 * the right answer. See ADR 0025.
 *
 * A candidate whose `createdAt` produces a non-finite age (a corrupt/invalid Date, which
 * shouldn't happen given Prisma's DateTime typing but isn't structurally impossible) is
 * excluded the same as one past the window, rather than falling through to be scored on
 * similarity alone — the old time-decay math made this safe by accident (similarity * NaN is
 * NaN, and NaN can never win the `>` comparison against bestScore), and this hard filter
 * preserves that guarantee explicitly instead of leaving it to be an accident again.
 */
export function scoreBestCandidate(
  itemEmbedding: number[],
  candidates: StoryCandidate[],
  now: Date
): ScoredMatch | null {
  let best: StoryCandidate | null = null
  let bestScore = -Infinity

  for (const candidate of candidates) {
    const ageHours = (now.getTime() - candidate.createdAt.getTime()) / (60 * 60 * 1000)
    if (!Number.isFinite(ageHours) || ageHours > DEDUP_WINDOW_HOURS) continue

    const score = cosineSimilarity(itemEmbedding, candidate.embedding)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best ? { candidate: best, score: bestScore } : null
}

export interface EvaluatedMatch {
  /** The raw top-scoring candidate, if the pool was non-empty — regardless of threshold. What
   *  a MatchDecision row's candidate/score fields come from. */
  best: ScoredMatch | null
  /** What MATCH_THRESHOLD alone decided. */
  thresholdMatched: boolean
  /** `best.candidate` when thresholdMatched, otherwise null — the caller treats null exactly
   *  like "no Story found". Equivalent to the old findBestMatch's return value. */
  match: StoryCandidate | null
}

/** scoreBestCandidate, plus the threshold comparison, in one call — both real call sites
 *  (ingestionService.ts, analysisService.ts) need `best` for their MatchDecision log row *and*
 *  the thresholded `match` for control flow, so this avoids each computing the threshold
 *  comparison itself from a separately-held `best`. */
export function evaluateMatch(
  itemEmbedding: number[],
  candidates: StoryCandidate[],
  now: Date
): EvaluatedMatch {
  const best = scoreBestCandidate(itemEmbedding, candidates, now)
  const thresholdMatched = best !== null && best.score >= MATCH_THRESHOLD
  return { best, thresholdMatched, match: thresholdMatched && best ? best.candidate : null }
}

// Length cap on the lead/excerpt half of the embedding input — long enough to carry real
// signal, short enough that one outlier-long RSS description or excerpt can't dominate the
// vector. See ADR 0025.
const LEAD_MAX_CHARS = 400

// RSS teasers routinely open with a caption label ("Foto: ...") rather than prose. Strips only
// the label itself, not the rest of the line: some feeds prepend a caption label to an
// otherwise-real lead sentence ("Foto: Muž byl zatčen. Policie ve čtvrtek oznámila...") — an
// earlier, greedier version of this regex (`[:\s].*`) matched to the end of the string and
// wiped that real content along with the label, discarding exactly the signal P1-8 added this
// function to preserve. `[:\s]+` only consumes the separator after the label.
const BOILERPLATE_PREFIX = /^(Foto|Video|Ilustrační snímek|Reklama)[:\s]+/i

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * The single, canonical way an embedding input is constructed — both Ingestion (RSS
 * title/contentSnippet) and human-seeded submission (scraped title/excerpt) must go through
 * this one function, never build their own string. docs/audit.md P1-8 found that even though
 * both paths called the same function before this fix, the *distributions* feeding it weren't
 * comparable (an RSS teaser vs. several sentences of real article prose) — cross-path matches
 * were systematically weaker than same-path ones, making MATCH_THRESHOLD effectively two
 * different thresholds depending on which side of a comparison was which. Normalizing
 * whitespace, stripping known boilerplate prefixes, and capping length narrows that gap. See
 * ADR 0025.
 */
export function buildEmbeddingInput(item: { title: string; excerpt?: string }): string {
  const title = normalizeWhitespace(item.title)
  const excerpt = normalizeWhitespace(item.excerpt ?? '')
    .replace(BOILERPLATE_PREFIX, '')
    .slice(0, LEAD_MAX_CHARS)
  return excerpt ? `${title}\n${excerpt}` : title
}
