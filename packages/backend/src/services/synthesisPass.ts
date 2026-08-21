import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import type { AgreementCategory, AnalysisDimensions } from '@news-triangulator/shared'
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

// `id` is never asked of the model — the raw item shape below has no `id` field. It's attached by
// `.transform()` immediately as each item is parsed, so `SynthesisResultSchema.parse(...)`'s
// return value already has stable ids on every item (ticket 47 / ADR 0034), generated once here
// and never re-derived from an array index (which `verifyAndRepair`'s retry can reshuffle).
// `dimensionItemId` on a NarrativeAssertion cites this id directly. The `id: string` local
// widens node:crypto's branded UUID-template-literal return type to a plain `string` via a
// declared variable (not an `as` cast) — callers only need `id: string` (shared's DimensionItem/
// ContradictionItem), and a branded literal type here would force every fixture/test id to
// itself look like a UUID rather than any plain string.
function newItemId(): string {
  const id: string = randomUUID()
  return id
}

export const DimensionItemSchema = z
  .object({
    prose: z.string(),
    attributions: z.array(AttributionSchema).min(1),
  })
  .transform((item) => ({ ...item, id: newItemId() }))

const ContradictionItemSchema = z
  .object({
    prose: z.string(),
    attributions: z.array(AttributionSchema).length(2),
  })
  .transform((item) => ({ ...item, id: newItemId() }))

// ADR 0030 (ticket 38): the model's own story-level read of how much the sources overlap in
// what they report -- one judgement for the whole Analysis, never per dimension item or claim.
// Closed enum, rejected (never coerced) if the model returns anything else. The literal array
// below must list the exact same values as shared's `AgreementCategory` -- the `satisfies` cast
// makes that a compile error instead of a silent drift if one changes without the other.
export const AgreementCategorySchema = z.enum([
  'CONFIRMED',
  'PARTIAL',
  'DISPUTED',
]) satisfies z.ZodType<AgreementCategory>
export type { AgreementCategory }

export const SynthesisResultSchema = z.object({
  agreement: z.array(DimensionItemSchema),
  contradiction: z.array(ContradictionItemSchema),
  uniqueReporting: z.array(DimensionItemSchema),
  framing: z.array(DimensionItemSchema),
  agreementCategory: AgreementCategorySchema,
})

export type SynthesisResult = z.infer<typeof SynthesisResultSchema>

/** `agreementCategory` is persisted twice: inside `SynthesisResult.dimensions`'s JSON blob (part
 *  of the same object Synthesis returned) and its own typed column (ticket 38 / ADR 0030). The
 *  column is authoritative — the 4 rows that migration backfilled have a `dimensions` blob that
 *  predates the field entirely, so a bare JSON cast silently omits it for those rows. Every read
 *  site merges the column back in through this one function rather than casting `dimensions`
 *  directly, so a future read site can't forget to (mappers/analysis.ts, analysisStream.ts). */
export function mergeAgreementCategory(
  dimensionsJson: unknown,
  agreementCategory: AgreementCategory
): AnalysisDimensions {
  return {
    ...(dimensionsJson as Omit<AnalysisDimensions, 'agreementCategory'>),
    agreementCategory,
  }
}

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
    // Not a quote-bearing field -- nothing here can fail verification, so it always passes
    // through unchanged. Dropping items from `agreement` above does not retroactively make this
    // judgement wrong; it's a story-level read, not derived from which items survive repair.
    agreementCategory: result.agreementCategory,
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
  const parsed = SynthesisResultSchema.parse(
    await callJsonModel(model, SYSTEM_PROMPT, userContent, 'synthesis')
  )

  const sourceTextByUrl = buildSourceTextMap(sources)

  return verifyAndRepair({
    result: parsed,
    extractQuotes: (r) => extractQuotes(r, sourceTextByUrl),
    dropFailing: (r) => dropFailingItems(r, sourceTextByUrl),
    schema: SynthesisResultSchema,
    passName: 'synthesis',
    log,
    repair: (failures) =>
      callJsonModel(model, SYSTEM_PROMPT, buildRepairPrompt(userContent, parsed, failures), 'synthesis'),
  })
}
