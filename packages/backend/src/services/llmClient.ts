import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions'
import type { z } from 'zod'
import { recordLlmCallSafe } from '../repositories/llmCallLog.js'
import { createLogger } from '../logger.js'

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Traces call flow only (callSite, model, duration, success/fail) -- the full prompt/response
// content stays exclusively in LlmCallLog (ADR 0020), never duplicated here. See docs/adr/0038.
const log = createLogger('llm')

/** Every module that calls callJsonModel, so a typo'd or future value can't silently fragment
 *  LlmCallLog's callSite column — see ADR 0020. Extend this when a new caller is added. */
export type LlmCallSite =
  | 'extraction'
  | 'synthesis'
  | 'narrative'
  | 'storyVerification'
  | 'keywordExtractor'
  | 'headline'
  | 'entityExtraction'
  | 'storyRelation'
  | 'threadTitle'
  | 'threadOpenQuestions'
  | 'claimSeriesLinking'

/** Shared by `callJsonModel`/`callStructuredModel` below — both send one chat completion and log
 *  it via `recordLlmCallSafe`, differing only in `response_format`. */
async function callModel(
  model: string,
  systemPrompt: string,
  userContent: string,
  callSite: LlmCallSite,
  responseFormat: ChatCompletionCreateParamsNonStreaming['response_format'],
  temperature: number
): Promise<unknown> {
  let raw: string | null = null
  const logBase = { callSite, model, systemPrompt, userContent }
  const startedAt = Date.now()
  log.info({ callSite, model }, `LLM call started`)
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: responseFormat,
      temperature,
      // Makes this completion visible under platform.openai.com's Logs page — the prompt/response
      // content is already sent to OpenAI as part of the request either way; this only affects how
      // long OpenAI's own dashboard keeps it retrievable, not what's transmitted.
      store: true,
    })
    raw = response.choices[0]?.message?.content ?? '{}'
    const parsed: unknown = JSON.parse(raw)
    await recordLlmCallSafe({ ...logBase, responseContent: raw, error: null })
    log.info({ callSite, model, durationMs: Date.now() - startedAt }, 'LLM call finished')
    return parsed
  } catch (err) {
    await recordLlmCallSafe({
      ...logBase,
      responseContent: raw,
      error: err instanceof Error ? err.message : String(err),
    })
    log.error({ callSite, model, durationMs: Date.now() - startedAt, err }, 'LLM call failed')
    throw err
  }
}

export async function callJsonModel(
  model: string,
  systemPrompt: string,
  userContent: string,
  callSite: LlmCallSite,
  temperature = 0
): Promise<unknown> {
  return callModel(model, systemPrompt, userContent, callSite, { type: 'json_object' }, temperature)
}

/** Like `callJsonModel`, but drives OpenAI Structured Outputs (strict `json_schema` mode, derived
 *  from `zodSchema` via `zodResponseFormat` — no hand-written JSON Schema) instead of loose
 *  `json_object` mode. The raw JSON is still parsed and returned as `unknown`, not auto-parsed via
 *  the SDK's own `.parse()`/`.parsed`, so every call site validates the same way `callJsonModel`'s
 *  callers already do (ticket 47 / ADR 0034 — Structured Outputs catches shape-level failures,
 *  `verifyAndRepair`-style semantic checks still run afterward on the caller's own schema). */
export async function callStructuredModel(
  model: string,
  systemPrompt: string,
  userContent: string,
  callSite: LlmCallSite,
  zodSchema: z.ZodType,
  schemaName: string,
  temperature = 0
): Promise<unknown> {
  return callModel(
    model,
    systemPrompt,
    userContent,
    callSite,
    zodResponseFormat(zodSchema, schemaName),
    temperature
  )
}
