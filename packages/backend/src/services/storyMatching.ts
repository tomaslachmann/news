// Cheap, LLM-free candidate matching for automated Ingestion — replaces GDELT/keyword search
// as the retrieval mechanism. See ADR 0018. The exact threshold/decay constants below are a
// starting point, not a tuned result — expect to revisit them once live data is observed,
// mirroring how GDELT_MIN_THRESHOLD/DEDUP_WINDOW_HOURS were tuned by hand elsewhere.

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

// Candidates come from a 48h window (DEDUP_WINDOW_HOURS in ingestionService.ts). A flat decay
// with no grace period would gut most of that window — even a perfect-similarity match would
// stop clearing MATCH_THRESHOLD after roughly 10 hours, well before two outlets' morning vs.
// evening editions of the same event would both have published. Full strength for the first
// DECAY_GRACE_HOURS, then halving every TIME_DECAY_HALF_LIFE_HOURS after that, so decay mainly
// discounts Stories approaching the edge of the window rather than same-day coverage.
const DECAY_GRACE_HOURS = 24
const TIME_DECAY_HALF_LIFE_HOURS = 24

/** 1.0 for a Story within the grace period, halving every TIME_DECAY_HALF_LIFE_HOURS past it —
 *  so an old Story needs higher raw similarity than a fresh one to still clear the match
 *  threshold. Entity-overlap scoring is intentionally not included yet; see ADR 0018. */
export function timeDecayFactor(ageHours: number): number {
  const effectiveAge = Math.max(ageHours - DECAY_GRACE_HOURS, 0)
  return Math.pow(0.5, effectiveAge / TIME_DECAY_HALF_LIFE_HOURS)
}

export const MATCH_THRESHOLD = 0.75

export interface StoryCandidate {
  storyId: string
  analysisId: string
  analysisStatus: string
  embedding: number[]
  createdAt: Date
}

/** Scores `itemEmbedding` against every candidate (cosine similarity combined with a time-decay
 *  penalty for older Stories) and returns the highest-scoring one that clears MATCH_THRESHOLD,
 *  or null if nothing does — the caller treats null exactly like "no Story found". */
export function findBestMatch(
  itemEmbedding: number[],
  candidates: StoryCandidate[],
  now: Date
): StoryCandidate | null {
  let best: StoryCandidate | null = null
  let bestScore = -Infinity

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(itemEmbedding, candidate.embedding)
    const ageHours = (now.getTime() - candidate.createdAt.getTime()) / (60 * 60 * 1000)
    const score = similarity * timeDecayFactor(ageHours)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return bestScore >= MATCH_THRESHOLD ? best : null
}

/** Cheap embedding input for an incoming RSS item — title plus excerpt where available, never
 *  the full article (that's exactly the network/LLM cost this retrieval mechanism avoids). */
export function buildEmbeddingInput(item: { title: string; excerpt?: string }): string {
  return item.excerpt ? `${item.title}\n${item.excerpt}` : item.title
}
