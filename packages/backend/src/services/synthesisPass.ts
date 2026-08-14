import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callJsonModel } from './llmClient.js'
import type { ExtractionResult } from './extractionPass.js'
import {
  verifyAndRepair,
  extractAttributionQuotes,
  filterValidAttributedItems,
  type QuoteRef,
} from './quoteVerification.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/synthesis.txt'), 'utf8')

const AttributionSchema = z.object({
  outlet: z.string(),
  czechQuote: z.string().min(1),
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
  extractedText: string
}

function buildSourceTextMap(sources: SourceExtraction[]): Map<string, string> {
  return new Map(sources.map((s) => [s.articleUrl, s.extractedText]))
}

function extractQuotes(result: SynthesisResult, sourceTextByUrl: Map<string, string>): QuoteRef[] {
  return [
    ...extractAttributionQuotes(result.agreement, sourceTextByUrl, 'agreement'),
    ...extractAttributionQuotes(result.contradiction, sourceTextByUrl, 'contradiction'),
    ...extractAttributionQuotes(result.uniqueReporting, sourceTextByUrl, 'uniqueReporting'),
    ...extractAttributionQuotes(result.framing, sourceTextByUrl, 'framing'),
  ]
}

function dropFailingItems(result: SynthesisResult, sourceTextByUrl: Map<string, string>): SynthesisResult {
  return {
    agreement: filterValidAttributedItems(result.agreement, sourceTextByUrl),
    contradiction: filterValidAttributedItems(result.contradiction, sourceTextByUrl),
    uniqueReporting: filterValidAttributedItems(result.uniqueReporting, sourceTextByUrl),
    framing: filterValidAttributedItems(result.framing, sourceTextByUrl),
  }
}

function buildRepairPrompt(originalUserContent: string, previous: unknown, failures: QuoteRef[]): string {
  return [
    originalUserContent,
    '',
    '---',
    'You previously produced the JSON below, but some czechQuote attributions were not verbatim substrings of the cited article:',
    JSON.stringify(failures.map((f) => ({ context: f.context, quote: f.quote }))),
    '',
    "Return corrected JSON in the exact same schema. Fix each flagged czechQuote to a real verbatim quote from that outlet's article, or remove the entire item if no valid quote supports it — a contradiction item requires exactly two attributions and every other dimension item requires at least one.",
    '',
    'Previous output:',
    JSON.stringify(previous),
  ].join('\n')
}

export async function runSynthesisPass(
  sources: SourceExtraction[],
  excludedCount = 0,
  log?: FastifyBaseLogger
): Promise<SynthesisResult> {
  const model = process.env.SYNTHESIS_MODEL ?? 'gpt-4o'
  const note =
    excludedCount > 0
      ? `Note: ${excludedCount} coverage(s) were excluded from this analysis because their article text could not be extracted.\n\n`
      : ''
  // Only outlet/articleUrl/extraction go to the model — extractedText stays local, used only to
  // verify attributions afterwards (Synthesis never receives raw source text itself, per ADR 0014).
  const modelInput = sources.map(({ outlet, articleUrl, extraction }) => ({ outlet, articleUrl, extraction }))
  const userContent = note + JSON.stringify(modelInput)
  const parsed = SynthesisResultSchema.parse(await callJsonModel(model, SYSTEM_PROMPT, userContent))

  const sourceTextByUrl = buildSourceTextMap(sources)

  return verifyAndRepair({
    result: parsed,
    extractQuotes: (r) => extractQuotes(r, sourceTextByUrl),
    dropFailing: (r) => dropFailingItems(r, sourceTextByUrl),
    schema: SynthesisResultSchema,
    passName: 'synthesis',
    log,
    repair: (failures) =>
      callJsonModel(model, SYSTEM_PROMPT, buildRepairPrompt(userContent, parsed, failures)),
  })
}
