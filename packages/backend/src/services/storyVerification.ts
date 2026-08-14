import type { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { callJsonModel } from './llmClient.js'

const SYSTEM_PROMPT = `You are a news analyst determining whether two headlines describe the same specific real-world event, not merely a similar or related topic. All reasoning must be in English; preserve the original Czech headlines verbatim when quoting them.

Two headlines describe the same event only if they refer to the same specific occurrence — not just the same general subject, an ongoing situation, or a recurring type of event. For example, two different truck accidents on the same highway are NOT the same event, even though the headlines look similar.

Return only a JSON object: {"sameEvent": true or false, "reasoning": "one or two sentences explaining your judgement"}`

const VerifySameStoryResultSchema = z.object({
  sameEvent: z.boolean(),
  reasoning: z.string(),
})

export type VerifySameStoryResult = z.infer<typeof VerifySameStoryResultSchema>

/**
 * Asks whether a candidate article's headline describes the same real-world event as a
 * Story's anchor headline. The one verification primitive used everywhere an article is
 * about to become Coverage on some Story — see ADR 0017.
 */
export async function verifySameStory(
  candidateTitle: string,
  anchorHeadline: string
): Promise<VerifySameStoryResult> {
  const model = process.env.EXTRACTION_MODEL ?? 'gpt-4o'
  const userContent = `Anchor headline: ${anchorHeadline}\nCandidate headline: ${candidateTitle}`
  const parsed = await callJsonModel(model, SYSTEM_PROMPT, userContent)
  return VerifySameStoryResultSchema.parse(parsed)
}

/** verifySameStory, but a failure (LLM error, malformed response) degrades to "not the same
 *  event" instead of throwing — an unverifiable match must never fall back to being trusted. */
async function verifySameStorySafe(
  candidateTitle: string,
  anchorHeadline: string,
  log?: FastifyBaseLogger
): Promise<VerifySameStoryResult> {
  try {
    return await verifySameStory(candidateTitle, anchorHeadline)
  } catch (err) {
    log?.warn({ candidateTitle, err }, 'verifySameStory failed; treating as not the same event')
    const message = err instanceof Error ? err.message : String(err)
    return { sameEvent: false, reasoning: `Verification failed: ${message}` }
  }
}

/** Verifies a single candidate/match against an anchor headline, logging the verdict (or the
 *  failure that produced a conservative rejection) so it's debuggable after the fact. */
export async function verifySameStoryLogged(
  candidateTitle: string,
  anchorHeadline: string,
  log?: FastifyBaseLogger
): Promise<VerifySameStoryResult> {
  const verdict = await verifySameStorySafe(candidateTitle, anchorHeadline, log)
  log?.info({ candidateTitle, anchorHeadline, verdict }, 'Same-story verification')
  return verdict
}

/** Verifies every candidate's title against one anchor headline in parallel, returning only
 *  the ones confirmed as the same event. Used by every site that filters a candidate list
 *  before persisting any of it as Coverage — see ADR 0017. No concurrency cap of its own: relies
 *  on callers bounding candidate-list size (today, discovery.ts's MAX_CANDIDATES) to keep the
 *  fan-out modest; a caller passing an unbounded list should chunk it before calling this. */
export async function verifyCandidatesAgainstAnchor<T extends { title: string }>(
  candidates: T[],
  anchorHeadline: string,
  log?: FastifyBaseLogger
): Promise<T[]> {
  const verdicts = await Promise.all(
    candidates.map((c) => verifySameStoryLogged(c.title, anchorHeadline, log))
  )
  return candidates.filter((_, i) => verdicts[i].sameEvent)
}
