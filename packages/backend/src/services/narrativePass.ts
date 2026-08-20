import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callJsonModel } from './llmClient.js'
import { DimensionItemSchema, type SynthesisResult } from './synthesisPass.js'
import {
  verifyAndRepair,
  extractAttributionQuotes,
  filterValidAttributedItems,
  type QuoteRef,
} from './quoteVerification.js'

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

function buildSourceTextMap(sources: NarrativeSource[]): Map<string, string> {
  return new Map(sources.map((s) => [s.articleUrl, s.fullText]))
}

function extractQuotes(result: NarrativeResult, sourceTextByUrl: Map<string, string>): QuoteRef[] {
  return extractAttributionQuotes(result.segments, sourceTextByUrl, 'segments')
}

function dropFailingSegments(result: NarrativeResult, sourceTextByUrl: Map<string, string>): NarrativeResult {
  return { segments: filterValidAttributedItems(result.segments, sourceTextByUrl) }
}

function buildRepairPrompt(originalUserContent: string, previous: unknown, failures: QuoteRef[]): string {
  return [
    originalUserContent,
    '',
    '---',
    "You previously produced the JSON below, but some czechQuote attributions were not verbatim substrings of the cited article's fullText:",
    JSON.stringify(failures.map((f) => ({ context: f.context, quote: f.quote }))),
    '',
    "Return corrected JSON in the exact same schema. Fix each flagged czechQuote to a real verbatim quote from that outlet's fullText, or remove the entire segment if no valid quote supports it — every segment requires at least one attribution.",
    '',
    'Previous output:',
    JSON.stringify(previous),
  ].join('\n')
}

/** The four dimensions only — never `agreementCategory` (ticket 38). narrative.txt's own "Input
 *  format" section documents exactly these four keys; the model has no instruction for a 5th, and
 *  ADR 0012's "never adjudicates a disputed fact itself" is the reason not to hand it one — a
 *  categorical agree/disagree judgement is exactly the kind of signal that could nudge narration
 *  tone instead of just narrating the four already-classified dimensions. */
export type NarrativeDimensions = Pick<
  SynthesisResult,
  'agreement' | 'contradiction' | 'uniqueReporting' | 'framing'
>

export async function runNarrativePass(
  sources: NarrativeSource[],
  dimensions: NarrativeDimensions,
  log?: FastifyBaseLogger
): Promise<NarrativeResult> {
  const model = process.env.SYNTHESIS_MODEL ?? 'gpt-4o'
  // Rebuilt as a literal, not `{ sources, dimensions }` — `dimensions` is typed as
  // NarrativeDimensions, but a caller passing the wider SynthesisResult it's `Pick`ed from
  // (structurally assignable) would otherwise still carry `agreementCategory` through to
  // JSON.stringify unnoticed, since TS's structural typing doesn't strip runtime properties.
  const userContent = JSON.stringify({
    sources,
    dimensions: {
      agreement: dimensions.agreement,
      contradiction: dimensions.contradiction,
      uniqueReporting: dimensions.uniqueReporting,
      framing: dimensions.framing,
    },
  })
  const parsed = NarrativeResultSchema.parse(
    await callJsonModel(model, SYSTEM_PROMPT, userContent, 'narrative')
  )

  const sourceTextByUrl = buildSourceTextMap(sources)

  return verifyAndRepair({
    result: parsed,
    extractQuotes: (r) => extractQuotes(r, sourceTextByUrl),
    dropFailing: (r) => dropFailingSegments(r, sourceTextByUrl),
    schema: NarrativeResultSchema,
    passName: 'narrative',
    log,
    repair: (failures) =>
      callJsonModel(model, SYSTEM_PROMPT, buildRepairPrompt(userContent, parsed, failures), 'narrative'),
  })
}
