import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import OpenAI from 'openai'
import { z } from 'zod'
import type { ExtractionResult } from './extractionPass.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/synthesis.txt'), 'utf8')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const AttributionSchema = z.object({
  outlet: z.string(),
  czechQuote: z.string(),
  articleUrl: z.string(),
})

const DimensionItemSchema = z.object({
  prose: z.string(),
  attributions: z.array(AttributionSchema).min(1),
})

const ContradictionItemSchema = z.object({
  prose: z.string(),
  sides: z.array(AttributionSchema).length(2),
})

export const SynthesisResultSchema = z.object({
  agreement: z.array(DimensionItemSchema),
  contradiction: z.array(ContradictionItemSchema),
  uniqueReporting: z.array(DimensionItemSchema),
  framing: z.array(DimensionItemSchema),
})

export type SynthesisResult = z.infer<typeof SynthesisResultSchema>

export interface SourceExtraction {
  outlet: string
  articleUrl: string
  extraction: ExtractionResult
}

export async function runSynthesisPass(sources: SourceExtraction[]): Promise<SynthesisResult> {
  const response = await openai.chat.completions.create({
    model: process.env.SYNTHESIS_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(sources) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed: unknown = JSON.parse(raw)
  return SynthesisResultSchema.parse(parsed)
}
