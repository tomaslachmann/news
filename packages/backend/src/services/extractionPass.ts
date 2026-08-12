import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import OpenAI from 'openai'
import { z } from 'zod'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/extraction.txt'), 'utf8')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
  const response = await openai.chat.completions.create({
    model: process.env.EXTRACTION_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: articleText },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed: unknown = JSON.parse(raw)
  return ExtractionResultSchema.parse(parsed)
}
