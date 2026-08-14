import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callJsonModel } from './llmClient.js'
import { verifyAndRepair, isVerbatimQuote, type QuoteRef } from './quoteVerification.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/extraction.txt'), 'utf8')

const FactualClaimSchema = z.object({
  claim: z.string(),
  czechQuote: z.string().min(1),
})

const AttributedClaimSchema = z.object({
  speaker: z.string(),
  statement: z.string(),
  czechQuote: z.string().min(1),
})

const InterpretiveStatementSchema = z.object({
  statement: z.string(),
  czechQuote: z.string().min(1),
})

const FramingSignalSchema = z.object({
  signal: z.string(),
  czechQuote: z.string().min(1),
})

export const ExtractionResultSchema = z.object({
  factualClaims: z.array(FactualClaimSchema),
  attributedClaims: z.array(AttributedClaimSchema),
  interpretiveStatements: z.array(InterpretiveStatementSchema),
  framingSignals: z.array(FramingSignalSchema),
})

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>

function extractQuotes(result: ExtractionResult, articleText: string): QuoteRef[] {
  return [
    ...result.factualClaims.map((c, i) => ({
      quote: c.czechQuote,
      sourceText: articleText,
      context: `factualClaims[${i}]: ${c.claim}`,
    })),
    ...result.attributedClaims.map((c, i) => ({
      quote: c.czechQuote,
      sourceText: articleText,
      context: `attributedClaims[${i}]: ${c.speaker} — ${c.statement}`,
    })),
    ...result.interpretiveStatements.map((c, i) => ({
      quote: c.czechQuote,
      sourceText: articleText,
      context: `interpretiveStatements[${i}]: ${c.statement}`,
    })),
    ...result.framingSignals.map((c, i) => ({
      quote: c.czechQuote,
      sourceText: articleText,
      context: `framingSignals[${i}]: ${c.signal}`,
    })),
  ]
}

function dropFailingItems(result: ExtractionResult, articleText: string): ExtractionResult {
  const keep = (item: { czechQuote: string }) => isVerbatimQuote(item.czechQuote, articleText)
  return {
    factualClaims: result.factualClaims.filter(keep),
    attributedClaims: result.attributedClaims.filter(keep),
    interpretiveStatements: result.interpretiveStatements.filter(keep),
    framingSignals: result.framingSignals.filter(keep),
  }
}

function buildRepairPrompt(articleText: string, previous: unknown, failures: QuoteRef[]): string {
  return [
    articleText,
    '',
    '---',
    'You previously extracted the JSON below, but some czechQuote values were not verbatim substrings of the article text above:',
    JSON.stringify(failures.map((f) => ({ quote: f.quote, context: f.context }))),
    '',
    'Return corrected JSON in the exact same schema. Fix each flagged czechQuote to a real verbatim substring of the article, or remove the entire item if no valid quote supports it.',
    '',
    'Previous output:',
    JSON.stringify(previous),
  ].join('\n')
}

export async function runExtractionPass(
  articleText: string,
  log?: FastifyBaseLogger
): Promise<ExtractionResult> {
  const model = process.env.EXTRACTION_MODEL ?? 'gpt-4o'
  const parsed = ExtractionResultSchema.parse(await callJsonModel(model, SYSTEM_PROMPT, articleText))

  return verifyAndRepair({
    result: parsed,
    extractQuotes: (r) => extractQuotes(r, articleText),
    dropFailing: (r) => dropFailingItems(r, articleText),
    schema: ExtractionResultSchema,
    passName: 'extraction',
    log,
    repair: (failures) =>
      callJsonModel(model, SYSTEM_PROMPT, buildRepairPrompt(articleText, parsed, failures)),
  })
}
