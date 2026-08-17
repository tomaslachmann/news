import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callJsonModel } from './llmClient.js'
import type { SynthesisResult } from './synthesisPass.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/headline.txt'), 'utf8')

const HeadlineResultSchema = z.object({ headline: z.string().min(1) })

/**
 * Generates the tool-authored Article headline — grounded only in the Agreement dimension so it
 * can never assert, imply, or lean toward anything contested or framed differently across
 * sources, mirroring the same restraint the Narrative pass's prose already applies to itself.
 * See ADR 0021.
 *
 * Returns null (skipping the LLM call entirely) when Agreement is empty — there is nothing
 * agreed-upon to draw a headline from, and forcing one would mean fabricating certainty the
 * sources themselves don't share. A thrown error here is not caught: unlike the empty-Agreement
 * case, a genuine call failure should surface as a Synthesis-stage failure and block completion,
 * not silently degrade.
 */
export async function runHeadlinePass(
  agreement: SynthesisResult['agreement'],
  log?: FastifyBaseLogger
): Promise<string | null> {
  if (agreement.length === 0) return null

  const model = process.env.SYNTHESIS_MODEL ?? 'gpt-4o'
  // Only the already-synthesized Agreement prose goes to the model — no attributions/quotes, and
  // no other dimension's content is ever included, so a framing/contradiction claim structurally
  // cannot reach this call regardless of what the prompt itself says.
  const userContent = JSON.stringify(agreement.map((item) => item.prose))
  const parsed = HeadlineResultSchema.parse(
    await callJsonModel(model, SYSTEM_PROMPT, userContent, 'headline')
  )
  log?.info({ headline: parsed.headline }, 'Generated Article headline')
  return parsed.headline
}
