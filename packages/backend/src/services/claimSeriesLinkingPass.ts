import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callStructuredModel } from './llmClient.js'
import type { TrackableValue, ExistingSeriesLatestMember } from './claimSeriesMatching.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/claimSeriesLinking.txt'), 'utf8')
const SCHEMA_NAME = 'claim_series_links'

const LlmLinkSchema = z.object({ valueRefId: z.string(), seriesId: z.string().nullable() })
const LlmLinksSchema = z.object({ links: z.array(LlmLinkSchema) })
type LlmLinksDocument = z.infer<typeof LlmLinksSchema>

export interface ClaimLink {
  valueRefId: string
  /** `null` means: start a new series for this value — either the LLM said so, or its answer
   *  didn't survive sanitization (see `runClaimSeriesLinkingPass`'s own doc comment). */
  seriesId: string | null
}

/** One new trackable value plus the existing series it's a candidate to continue —
 *  `findCandidateSeries` (claimSeriesMatching.ts) narrows `candidates` before this ever runs. */
export interface ValueWithCandidates {
  value: TrackableValue
  candidates: ExistingSeriesLatestMember[]
}

function buildUserContent(items: ValueWithCandidates[]): string {
  return JSON.stringify(
    items.map(({ value, candidates }) => ({
      valueRefId: value.valueRefId,
      text: value.text,
      candidates: candidates.map((c) => ({ seriesId: c.seriesId, text: c.text })),
    }))
  )
}

function buildRepairPrompt(originalUserContent: string, previous: unknown, failures: string[]): string {
  return [
    originalUserContent,
    '',
    '---',
    'You previously produced the JSON document below, but it failed the following checks:',
    JSON.stringify(failures),
    '',
    'Return a corrected JSON document in the exact same schema: exactly one links entry per value ' +
      "you were given, and every non-null seriesId must be one of that specific value's own candidates.",
    '',
    'Previous output:',
    JSON.stringify(previous),
  ].join('\n')
}

function findFailures(doc: LlmLinksDocument, items: ValueWithCandidates[]): string[] {
  const failures: string[] = []
  const candidateIdsByValueRefId = new Map(
    items.map(({ value, candidates }) => [value.valueRefId, new Set(candidates.map((c) => c.seriesId))])
  )
  const seenValueRefIds = new Set<string>()
  const claimedSeriesIds = new Set<string>()

  doc.links.forEach((link, index) => {
    const where = `links[${index}]`
    const candidateIds = candidateIdsByValueRefId.get(link.valueRefId)
    if (!candidateIds) {
      failures.push(`${where}: valueRefId "${link.valueRefId}" was not one of the given values`)
      return
    }
    seenValueRefIds.add(link.valueRefId)
    if (link.seriesId !== null && !candidateIds.has(link.seriesId)) {
      failures.push(
        `${where}: seriesId "${link.seriesId}" is not one of valueRefId "${link.valueRefId}"'s own candidates`
      )
    } else if (link.seriesId !== null) {
      // ClaimSeriesMember.@@unique([seriesId, analysisId]) means this member (one analysisId) can
      // only ever contribute one point to a given series — two of this member's own values can
      // never legitimately continue the same series simultaneously, whatever their candidate
      // lists say. Flagged here (not just left to the DB constraint) so the retry gets a chance to
      // pick a real distinction; `sanitize` enforces the same rule unconditionally as the final
      // safety net.
      if (claimedSeriesIds.has(link.seriesId)) {
        failures.push(
          `${where}: seriesId "${link.seriesId}" is already claimed by another value in this batch`
        )
      }
      claimedSeriesIds.add(link.seriesId)
    }
  })

  for (const { value } of items) {
    if (!seenValueRefIds.has(value.valueRefId)) {
      failures.push(`links: missing an entry for valueRefId "${value.valueRefId}"`)
    }
  }

  return failures
}

/** Sanitizes a (possibly still-imperfect) LLM response into exactly one link per `items` entry,
 *  defaulting to `seriesId: null` (start a new series) for anything missing or invalid — never
 *  discarding the whole batch over one bad entry. This is the per-value fallback ticket 72's
 *  Answer asks for, distinct from `threadOpenQuestionsPass.ts`'s all-or-nothing empty fallback:
 *  starting an unwanted new series is a much smaller mistake (an inert, never-surfaced extra row —
 *  ticket 76's frontend only shows series with enough points to be worth a trend) than silently
 *  dropping every other value's already-correct link in the same batch.
 *
 *  Also enforces, unconditionally (not just via `findFailures`' retry-triggering check), that no
 *  two of this batch's values claim the same `seriesId` — `ClaimSeriesMember`'s own
 *  `@@unique([seriesId, analysisId])` constraint means one member can only ever contribute one
 *  point to a given series, so a second claim on an already-claimed series is downgraded to a new
 *  series rather than reaching `addClaimSeriesMember` and throwing a unique-constraint violation
 *  (which would otherwise strand every value after it in the batch — see this ticket's own
 *  `/code-review` finding). First-claimed-wins, in the LLM's own array order. */
function sanitize(doc: LlmLinksDocument, items: ValueWithCandidates[]): ClaimLink[] {
  const linkByValueRefId = new Map(doc.links.map((l) => [l.valueRefId, l.seriesId]))
  const claimedSeriesIds = new Set<string>()
  return items.map(({ value, candidates }) => {
    const claimed = linkByValueRefId.get(value.valueRefId)
    const candidateIds = new Set(candidates.map((c) => c.seriesId))
    const valid = claimed != null && candidateIds.has(claimed) && !claimedSeriesIds.has(claimed)
    if (valid) claimedSeriesIds.add(claimed)
    return { valueRefId: value.valueRefId, seriesId: valid ? claimed : null }
  })
}

/** Ticket 72/75: among each new trackable value's already entity/unit-narrowed candidate series
 *  (`findCandidateSeries`), asks the LLM which one (if any) it actually continues. Retries once on
 *  a malformed/invalid response, then always sanitizes rather than throwing or returning empty —
 *  see `sanitize`'s own doc comment. Returns `[]` immediately, with no LLM call, when `items` is
 *  empty (every trackable value had zero candidates — nothing to disambiguate). */
export async function runClaimSeriesLinkingPass(
  items: ValueWithCandidates[],
  log?: FastifyBaseLogger
): Promise<ClaimLink[]> {
  if (items.length === 0) return []

  const model = process.env.SYNTHESIS_MODEL ?? 'gpt-4o'
  const userContent = buildUserContent(items)

  const parsed = LlmLinksSchema.parse(
    await callStructuredModel(
      model,
      SYSTEM_PROMPT,
      userContent,
      'claimSeriesLinking',
      LlmLinksSchema,
      SCHEMA_NAME
    )
  )

  let failures = findFailures(parsed, items)
  if (failures.length === 0) return sanitize(parsed, items)

  log?.warn(
    { failureCount: failures.length, failures },
    'Claim series linking failed verification; retrying once'
  )

  const repaired = await callStructuredModel(
    model,
    SYSTEM_PROMPT,
    buildRepairPrompt(userContent, parsed, failures),
    'claimSeriesLinking',
    LlmLinksSchema,
    SCHEMA_NAME
  )
  const repairedParse = LlmLinksSchema.safeParse(repaired)
  if (!repairedParse.success) {
    log?.warn(
      'Claim series linking repair response did not match the expected schema; starting new series for all'
    )
    return items.map(({ value }) => ({ valueRefId: value.valueRefId, seriesId: null }))
  }

  failures = findFailures(repairedParse.data, items)
  if (failures.length > 0) {
    log?.warn(
      { failureCount: failures.length, failures },
      'Claim series linking still failing after retry; sanitizing per-value'
    )
  }
  return sanitize(repairedParse.data, items)
}
