import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyBaseLogger } from 'fastify'
import type { NarrativeDocument } from '@news-triangulator/shared'
import { callStructuredModel } from './llmClient.js'
import type { SynthesisResult } from './synthesisPass.js'
import {
  LlmNarrativeDocumentSchema,
  verifyNarrativeDocumentOrThrow,
  buildNarrativeDocument,
  type AssertionDimension,
  type KnownEntity,
  type NarrativeVerificationContext,
} from './narrativeDocument.js'

export type { KnownEntity }

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/narrative.txt'), 'utf8')
const SCHEMA_NAME = 'narrative_document'

export interface NarrativeSource {
  outlet: string
  articleUrl: string
  fullText: string
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

function buildSourceTextByArticleUrl(sources: NarrativeSource[]): Map<string, string> {
  return new Map(sources.map((s) => [s.articleUrl, s.fullText]))
}

function buildOutletByArticleUrl(sources: NarrativeSource[]): Map<string, string> {
  return new Map(sources.map((s) => [s.articleUrl, s.outlet]))
}

function buildDimensionItemIdsByDimension(
  dimensions: NarrativeDimensions
): Record<AssertionDimension, Set<string>> {
  return {
    agreement: new Set(dimensions.agreement.map((item) => item.id)),
    contradiction: new Set(dimensions.contradiction.map((item) => item.id)),
    unique_reporting: new Set(dimensions.uniqueReporting.map((item) => item.id)),
    framing: new Set(dimensions.framing.map((item) => item.id)),
  }
}

function buildUserContent(
  sources: NarrativeSource[],
  dimensions: NarrativeDimensions,
  entities: KnownEntity[]
): string {
  // Rebuilt as a literal, not `{ sources, dimensions, entities }` — `dimensions` is typed as
  // NarrativeDimensions, but a caller passing the wider SynthesisResult it's `Pick`ed from
  // (structurally assignable) would otherwise still carry `agreementCategory` through to
  // JSON.stringify unnoticed, since TS's structural typing doesn't strip runtime properties.
  return JSON.stringify({
    sources,
    dimensions: {
      agreement: dimensions.agreement,
      contradiction: dimensions.contradiction,
      uniqueReporting: dimensions.uniqueReporting,
      framing: dimensions.framing,
    },
    entities: entities.map(({ key, canonicalName, type }) => ({ key, canonicalName, type })),
  })
}

function buildRepairPrompt(originalUserContent: string, previous: unknown, failures: string[]): string {
  return [
    originalUserContent,
    '',
    '---',
    'You previously produced the JSON document below, but it failed the following verification checks:',
    JSON.stringify(failures),
    '',
    'Return a corrected JSON document in the exact same schema, fixing every flagged issue: every ' +
      '<nt:e>/<nt:v>/<nt:s> tag id used inline must be declared in entityRefs/valueRefs/sourceRefs, ' +
      'every quote block must name a declared sourceId and its text must be a real verbatim quote ' +
      "from that source's fullText, and every assertion's dimensionItemId must be one of the ids " +
      'actually present in the cited dimension.',
    '',
    'Previous output:',
    JSON.stringify(previous),
  ].join('\n')
}

export async function runNarrativePass(
  sources: NarrativeSource[],
  dimensions: NarrativeDimensions,
  entities: KnownEntity[],
  log?: FastifyBaseLogger
): Promise<NarrativeDocument> {
  const model = process.env.SYNTHESIS_MODEL ?? 'gpt-4o'
  const userContent = buildUserContent(sources, dimensions, entities)

  const parsed = LlmNarrativeDocumentSchema.parse(
    await callStructuredModel(
      model,
      SYSTEM_PROMPT,
      userContent,
      'narrative',
      LlmNarrativeDocumentSchema,
      SCHEMA_NAME
    )
  )

  const verificationContext: NarrativeVerificationContext = {
    sourceTextByArticleUrl: buildSourceTextByArticleUrl(sources),
    knownEntityKeys: new Set(entities.map((e) => e.key)),
    dimensionItemIdsByDimension: buildDimensionItemIdsByDimension(dimensions),
  }

  const verified = await verifyNarrativeDocumentOrThrow(
    parsed,
    verificationContext,
    (failures) =>
      callStructuredModel(
        model,
        SYSTEM_PROMPT,
        buildRepairPrompt(userContent, parsed, failures),
        'narrative',
        LlmNarrativeDocumentSchema,
        SCHEMA_NAME
      ),
    log
  )

  return buildNarrativeDocument(verified, {
    entitiesByKey: new Map(entities.map((e) => [e.key, e])),
    outletByArticleUrl: buildOutletByArticleUrl(sources),
  })
}
