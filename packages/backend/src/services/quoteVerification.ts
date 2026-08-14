import type { FastifyBaseLogger } from 'fastify'
import type { z } from 'zod'

// Normalizes typography that scraped HTML and LLM-reproduced text commonly disagree on
// (curly vs. straight quotes — including Czech-style „low-high“ quotation marks — NBSP vs.
// space, Unicode composition) without loosening what "verbatim" actually requires — the words
// themselves still must match exactly.
function normalizeForComparison(text: string): string {
  return text.normalize('NFC').replace(/[‘’]/g, "'").replace(/[„“”]/g, '"').replace(/ /g, ' ')
}

export function isVerbatimQuote(quote: string, sourceText: string): boolean {
  if (quote.length === 0) return false
  return normalizeForComparison(sourceText).includes(normalizeForComparison(quote))
}

export interface QuoteRef {
  quote: string
  sourceText: string
  /** Human-readable location of this quote, fed back to the model on repair. */
  context: string
}

export interface AttributedItem {
  prose: string
  attributions: { outlet: string; czechQuote: string; articleUrl: string }[]
}

/** Shared by Synthesis and Narrative, whose dimension-items/segments have the identical
 *  {prose, attributions[]} shape, each attribution verified against its own cited source. */
export function extractAttributionQuotes<T extends AttributedItem>(
  items: T[],
  sourceTextByUrl: Map<string, string>,
  labelPrefix: string
): QuoteRef[] {
  const refs: QuoteRef[] = []
  items.forEach((item, itemIndex) => {
    item.attributions.forEach((attribution, attrIndex) => {
      refs.push({
        quote: attribution.czechQuote,
        sourceText: sourceTextByUrl.get(attribution.articleUrl) ?? '',
        context: `${labelPrefix}[${itemIndex}].attributions[${attrIndex}] (${attribution.outlet}): ${item.prose}`,
      })
    })
  })
  return refs
}

/** Counterpart to extractAttributionQuotes — drops an item entirely if any of its attributions
 *  still fail verification, never leaving one with a partially-invalid attribution list. */
export function filterValidAttributedItems<T extends AttributedItem>(
  items: T[],
  sourceTextByUrl: Map<string, string>
): T[] {
  return items.filter((item) =>
    item.attributions.every((a) => isVerbatimQuote(a.czechQuote, sourceTextByUrl.get(a.articleUrl) ?? ''))
  )
}

export interface VerifyAndRepairParams<T> {
  result: T
  extractQuotes: (result: T) => QuoteRef[]
  /** Called once, only if verification fails, with the specific failing quotes. */
  repair: (failures: QuoteRef[]) => Promise<unknown>
  schema: z.ZodType<T>
  /** Drops any item whose quote(s) still fail verification after the repair attempt. */
  dropFailing: (result: T) => T
  passName: string
  log?: FastifyBaseLogger
}

/**
 * Verifies every czechQuote produced by a pass is a verbatim substring of its cited source
 * text. On failure, retries once with the specific failures fed back to the model; anything
 * still failing after that is dropped wholesale (the whole claim/item/segment, not just the
 * offending attribution) rather than left in a state that violates its own schema. See ADR 0014.
 *
 * If the repair response doesn't even match the expected schema (e.g. the model left a
 * contradiction item with one attribution instead of restoring two or removing it entirely),
 * the repair attempt is discarded and the *original* failing items are dropped instead — a
 * malformed correction must never crash the whole pass and lose every otherwise-valid item.
 */
export async function verifyAndRepair<T>({
  result,
  extractQuotes,
  repair,
  schema,
  dropFailing,
  passName,
  log,
}: VerifyAndRepairParams<T>): Promise<T> {
  const failures = extractQuotes(result).filter((q) => !isVerbatimQuote(q.quote, q.sourceText))
  if (failures.length === 0) return result

  log?.warn({ passName, failureCount: failures.length }, 'Quote verification failed; retrying once')

  const repairedParse = schema.safeParse(await repair(failures))
  if (!repairedParse.success) {
    log?.warn(
      { passName },
      'Repair response did not match the expected schema; dropping the originally-failing items'
    )
    return dropFailing(result)
  }

  const repaired = repairedParse.data
  const stillFailing = extractQuotes(repaired).filter((q) => !isVerbatimQuote(q.quote, q.sourceText))

  if (stillFailing.length > 0) {
    log?.warn(
      { passName, stillFailingCount: stillFailing.length },
      'Quote verification still failing after retry; dropping affected items'
    )
  }

  return dropFailing(repaired)
}
