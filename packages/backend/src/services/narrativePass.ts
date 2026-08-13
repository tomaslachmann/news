import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { callJsonModel } from './llmClient.js'
import { DimensionItemSchema, type SynthesisResult } from './synthesisPass.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/narrative.txt'), 'utf8')

export const NarrativeResultSchema = z.object({
  segments: z.array(DimensionItemSchema).min(1),
})

export type NarrativeResult = z.infer<typeof NarrativeResultSchema>

export interface NarrativeSource {
  outlet: string
  articleUrl: string
  fullText: string
}

export async function runNarrativePass(
  sources: NarrativeSource[],
  dimensions: SynthesisResult
): Promise<NarrativeResult> {
  const model = process.env.SYNTHESIS_MODEL ?? 'gpt-4o'
  const parsed = await callJsonModel(model, SYSTEM_PROMPT, JSON.stringify({ sources, dimensions }))
  return NarrativeResultSchema.parse(parsed)
}
