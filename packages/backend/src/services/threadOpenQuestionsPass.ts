import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callStructuredModel } from './llmClient.js'
import type { ThreadMemberForOpenQuestions } from '../repositories/thread.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/threadOpenQuestions.txt'), 'utf8')
const SCHEMA_NAME = 'thread_open_questions'

const LlmRelatedItemSchema = z.object({ analysisId: z.string(), dimensionItemId: z.string() })

const LlmOpenQuestionSchema = z.object({
  question: z.string(),
  detail: z.string(),
  relatedItems: z.array(LlmRelatedItemSchema),
})

export const LlmThreadOpenQuestionsSchema = z.object({
  openQuestions: z.array(LlmOpenQuestionSchema),
})
export type LlmThreadOpenQuestionsDocument = z.infer<typeof LlmThreadOpenQuestionsSchema>
export type LlmOpenQuestion = z.infer<typeof LlmOpenQuestionSchema>

export type ThreadOpenQuestion = LlmOpenQuestion

export interface ThreadOpenQuestionsVerificationContext {
  /** Every visible member's own set of real dimension-item ids (contradiction/agreement/
   *  uniqueReporting combined — `relatedItems` doesn't distinguish which dimension an id came
   *  from, so neither does this check), keyed by `analysisId`. An `analysisId` missing from this
   *  map entirely means it isn't a currently-visible member of this Thread at all. */
  validDimensionItemIdsByAnalysisId: Map<string, Set<string>>
}

export function buildVerificationContext(
  members: ThreadMemberForOpenQuestions[]
): ThreadOpenQuestionsVerificationContext {
  const validDimensionItemIdsByAnalysisId = new Map<string, Set<string>>()
  for (const member of members) {
    validDimensionItemIdsByAnalysisId.set(
      member.analysisId,
      new Set(
        [...member.contradiction, ...member.agreement, ...member.uniqueReporting].map((item) => item.id)
      )
    )
  }
  return { validDimensionItemIdsByAnalysisId }
}

/** The semantic checks schema validation can't express, mirroring `narrativeDocument.ts`'s own
 *  dangling-ref checks: every `relatedItems` entry must resolve to a real dimension item on a
 *  real, currently-visible member of this Thread, and every open question must cite at least one
 *  — an untraceable claim is exactly what this project's core premise (every claim traceable back
 *  to its source) exists to prevent. Returns every failure found, not just the first, so a repair
 *  prompt can address them all at once (same reasoning as `findNarrativeVerificationFailures`). */
export function findOpenQuestionsVerificationFailures(
  doc: LlmThreadOpenQuestionsDocument,
  ctx: ThreadOpenQuestionsVerificationContext
): string[] {
  const failures: string[] = []

  doc.openQuestions.forEach((question, questionIndex) => {
    const where = `openQuestions[${questionIndex}]`
    if (question.relatedItems.length === 0) {
      failures.push(`${where}: must cite at least one relatedItems entry`)
    }
    question.relatedItems.forEach((item, itemIndex) => {
      const itemWhere = `${where}.relatedItems[${itemIndex}]`
      const validIds = ctx.validDimensionItemIdsByAnalysisId.get(item.analysisId)
      if (!validIds) {
        failures.push(`${itemWhere}: analysisId "${item.analysisId}" is not a visible member of this Thread`)
      } else if (!validIds.has(item.dimensionItemId)) {
        failures.push(
          `${itemWhere}: dimensionItemId "${item.dimensionItemId}" does not exist on analysis "${item.analysisId}"`
        )
      }
    })
  })

  return failures
}

function buildUserContent(members: ThreadMemberForOpenQuestions[]): string {
  return JSON.stringify(
    members.map((m) => ({
      analysisId: m.analysisId,
      contradiction: m.contradiction,
      agreement: m.agreement,
      uniqueReporting: m.uniqueReporting,
    }))
  )
}

function buildRepairPrompt(originalUserContent: string, previous: unknown, failures: string[]): string {
  return [
    originalUserContent,
    '',
    '---',
    'You previously produced the JSON document below, but it failed the following verification checks:',
    JSON.stringify(failures),
    '',
    'Return a corrected JSON document in the exact same schema, fixing every flagged issue: every ' +
      'relatedItems entry must name an analysisId and dimensionItemId that were actually given to ' +
      'you, and every open question must cite at least one relatedItems entry.',
    '',
    'Previous output:',
    JSON.stringify(previous),
  ].join('\n')
}

/** Ticket 67's Answer: unlike Narrative's `verifyNarrativeDocumentOrThrow` (retry-once-then-throw,
 *  failing the whole job), this rail is supplementary, not the primary Narrative — a repeat
 *  verification failure retries once and then falls back to an empty result (no open questions
 *  shown) rather than failing `thread.synthesizeOpenQuestions` and consuming its job-level retry
 *  budget. A raw LLM/network failure (thrown by `callStructuredModel` itself, before there's
 *  anything to verify) is NOT caught here — it propagates so the job fails and pg-boss's own
 *  `LLM_JOB_RETRY_POLICY` retries it, the same as any other transient outage. */
export async function runThreadOpenQuestionsPass(
  members: ThreadMemberForOpenQuestions[],
  log?: FastifyBaseLogger
): Promise<ThreadOpenQuestion[]> {
  const model = process.env.SYNTHESIS_MODEL ?? 'gpt-4o'
  const userContent = buildUserContent(members)
  const ctx = buildVerificationContext(members)

  const parsed = LlmThreadOpenQuestionsSchema.parse(
    await callStructuredModel(
      model,
      SYSTEM_PROMPT,
      userContent,
      'threadOpenQuestions',
      LlmThreadOpenQuestionsSchema,
      SCHEMA_NAME
    )
  )

  let failures = findOpenQuestionsVerificationFailures(parsed, ctx)
  if (failures.length === 0) return parsed.openQuestions

  log?.warn(
    { failureCount: failures.length, failures },
    'Thread open-questions verification failed; retrying once'
  )

  const repaired = await callStructuredModel(
    model,
    SYSTEM_PROMPT,
    buildRepairPrompt(userContent, parsed, failures),
    'threadOpenQuestions',
    LlmThreadOpenQuestionsSchema,
    SCHEMA_NAME
  )
  const repairedParse = LlmThreadOpenQuestionsSchema.safeParse(repaired)
  if (!repairedParse.success) {
    log?.warn(
      'Thread open-questions repair response did not match the expected schema; falling back to empty'
    )
    return []
  }

  failures = findOpenQuestionsVerificationFailures(repairedParse.data, ctx)
  if (failures.length > 0) {
    log?.warn(
      { failureCount: failures.length, failures },
      'Thread open-questions still failing verification after retry; falling back to empty'
    )
    return []
  }

  return repairedParse.data.openQuestions
}
