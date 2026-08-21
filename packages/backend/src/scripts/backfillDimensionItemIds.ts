/** One-off structural backfill: narrative generation (ticket 47/48) requires every dimension item
 *  (`DimensionItem`/`ContradictionItem`) to carry a stable `id`, generated at Synthesis time since
 *  ticket 47/ADR 0034 — `NarrativeAssertion.dimensionItemId` cites it, and verification
 *  (narrativeDocument.ts) rejects any assertion whose id isn't in the set built from the stored
 *  dimensions. Analyses synthesized *before* ticket 47 shipped have `dimensions` JSON with no `id`
 *  on any item at all, so narrative generation can never pass verification for them — confirmed by
 *  running `regenNarrativeForAnalysis.ts` against a real pre-ticket-47 Analysis, which failed
 *  verification on every single assertion. `scripts/backfillNarratives.ts` alone doesn't fix this:
 *  it only nulls the cached narrative and re-enqueues, assuming ids already exist.
 *
 *  This script patches a fresh `crypto.randomUUID()` onto every dimension item across every
 *  SynthesisResult that's missing one, leaving everything else (prose, attributions, narrative,
 *  headline, etc.) untouched. No LLM call, no cost — purely a DB JSON patch. Run narrative
 *  regeneration (regenNarrativeForAnalysis.ts for one Analysis, or backfillNarratives.ts for all)
 *  separately afterward.
 *
 *  Run via `npx tsx --env-file-if-exists=../../.env src/scripts/backfillDimensionItemIds.ts`
 *  from packages/backend. */
import { randomUUID } from 'node:crypto'
import {
  findAllSynthesisResultDimensions,
  updateSynthesisResultDimensions,
  type StoredDimensions,
} from '../repositories/synthesisResult.js'

function patchMissingIds(dimensions: StoredDimensions): { patched: StoredDimensions; changedCount: number } {
  let changedCount = 0
  const patchArray = <T extends { id?: string }>(items: T[]): T[] =>
    items.map((item) => {
      if (item.id) return item
      changedCount++
      return { ...item, id: randomUUID() }
    })

  const patched: StoredDimensions = {
    agreement: patchArray(dimensions.agreement ?? []),
    contradiction: patchArray(dimensions.contradiction ?? []),
    uniqueReporting: patchArray(dimensions.uniqueReporting ?? []),
    framing: patchArray(dimensions.framing ?? []),
  }
  return { patched, changedCount }
}

async function main() {
  const rows = await findAllSynthesisResultDimensions()
  let rowsPatched = 0
  let itemsPatched = 0

  for (const row of rows) {
    const { patched, changedCount } = patchMissingIds(row.dimensions)
    if (changedCount === 0) continue

    await updateSynthesisResultDimensions(row.analysisId, patched)
    rowsPatched++
    itemsPatched += changedCount
    console.log(`Analysis ${row.analysisId}: patched ${changedCount} dimension item id(s)`)
  }

  console.log(`Done. ${rowsPatched}/${rows.length} SynthesisResult rows patched, ${itemsPatched} ids added.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
