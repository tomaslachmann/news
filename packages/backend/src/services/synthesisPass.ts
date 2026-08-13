import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { callJsonModel } from './llmClient.js'
import type { ExtractionResult } from './extractionPass.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/synthesis.txt'), 'utf8')

const AttributionSchema = z.object({
  outlet: z.string(),
  czechQuote: z.string(),
  articleUrl: z.string(),
})

export const DimensionItemSchema = z.object({
  prose: z.string(),
  attributions: z.array(AttributionSchema).min(1),
})

const ContradictionItemSchema = z.object({
  prose: z.string(),
  attributions: z.array(AttributionSchema).length(2),
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

export async function runSynthesisPass(
  sources: SourceExtraction[],
  excludedCount = 0
): Promise<SynthesisResult> {
  const model = process.env.SYNTHESIS_MODEL ?? 'gpt-4o'
  const note =
    excludedCount > 0
      ? `Note: ${excludedCount} coverage(s) were excluded from this analysis because their article text could not be extracted.\n\n`
      : ''
  const parsed = await callJsonModel(model, SYSTEM_PROMPT, note + JSON.stringify(sources))
  return SynthesisResultSchema.parse(parsed)
}
