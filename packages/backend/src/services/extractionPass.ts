import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { callJsonModel } from './llmClient.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/extraction.txt'), 'utf8')

const FactualClaimSchema = z.object({
  claim: z.string(),
  czechQuote: z.string(),
})

const AttributedClaimSchema = z.object({
  speaker: z.string(),
  statement: z.string(),
  czechQuote: z.string(),
})

const InterpretiveStatementSchema = z.object({
  statement: z.string(),
  czechQuote: z.string(),
})

const FramingSignalSchema = z.object({
  signal: z.string(),
  czechQuote: z.string(),
})

export const ExtractionResultSchema = z.object({
  factualClaims: z.array(FactualClaimSchema),
  attributedClaims: z.array(AttributedClaimSchema),
  interpretiveStatements: z.array(InterpretiveStatementSchema),
  framingSignals: z.array(FramingSignalSchema),
})

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>

export async function runExtractionPass(articleText: string): Promise<ExtractionResult> {
  const model = process.env.EXTRACTION_MODEL ?? 'gpt-4o'
  const parsed = await callJsonModel(model, SYSTEM_PROMPT, articleText)
  return ExtractionResultSchema.parse(parsed)
}
