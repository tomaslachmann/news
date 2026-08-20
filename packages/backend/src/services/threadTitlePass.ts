import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callJsonModel } from './llmClient.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/threadTitle.txt'), 'utf8')

const ThreadTitleResultSchema = z.object({ title: z.string().min(1) })

/**
 * Generates a Thread's tool-authored title — the audit's own "z Agreement napříč členy, ne z 1
 * titulku" (from Agreement across members, not one headline), mirroring `runHeadlinePass`'s
 * discipline (ADR 0021): only each member's already-synthesized Agreement prose goes to the
 * model, flattened across every member, never Contradiction/Framing/UniqueReporting from any of
 * them. Called once, at Thread creation only (see `threadRecomputeJob.ts`) — never regenerated as
 * later members join.
 *
 * Unlike `runHeadlinePass`, this never returns null and never throws to its caller: an LLM
 * failure or an empty result is caught by the caller (`threadRecomputeJob.ts`), which falls back
 * to the ORIGIN member's own display title — `Thread.title` is NOT NULL, and this is presentation
 * text, not something worth spending `thread.recompute`'s own retry budget on (see ticket 17's
 * Answer on `JOB_RETRY_POLICY`).
 */
export async function runThreadTitlePass(
  memberAgreementProse: string[][],
  log?: FastifyBaseLogger
): Promise<string> {
  const model = process.env.SYNTHESIS_MODEL ?? 'gpt-4o'
  const userContent = JSON.stringify(memberAgreementProse)
  const parsed = ThreadTitleResultSchema.parse(
    await callJsonModel(model, SYSTEM_PROMPT, userContent, 'threadTitle')
  )
  log?.info({ title: parsed.title }, 'Generated Thread title')
  return parsed.title
}
