import OpenAI from 'openai'
import { recordLlmCall } from '../repositories/llmCallLog.js'

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/** recordLlmCall, but a logging failure must never break the actual LLM call it's recording —
 *  see ADR 0020. */
async function recordLlmCallSafe(data: Parameters<typeof recordLlmCall>[0]): Promise<void> {
  try {
    await recordLlmCall(data)
  } catch (err) {
    console.error('Failed to record LLM call log', err)
  }
}

/** Every module that calls callJsonModel, so a typo'd or future value can't silently fragment
 *  LlmCallLog's callSite column — see ADR 0020. Extend this when a new caller is added. */
export type LlmCallSite = 'extraction' | 'synthesis' | 'narrative' | 'storyVerification' | 'keywordExtractor'

export async function callJsonModel(
  model: string,
  systemPrompt: string,
  userContent: string,
  callSite: LlmCallSite,
  temperature = 0
): Promise<unknown> {
  let raw: string | null = null
  const logBase = { callSite, model, systemPrompt, userContent }
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature,
    })
    raw = response.choices[0]?.message?.content ?? '{}'
    const parsed: unknown = JSON.parse(raw)
    await recordLlmCallSafe({ ...logBase, responseContent: raw, error: null })
    return parsed
  } catch (err) {
    await recordLlmCallSafe({
      ...logBase,
      responseContent: raw,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
