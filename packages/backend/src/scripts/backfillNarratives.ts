/** One-time backfill (ticket 47 / ADR 0034): re-enqueues `narrative.generate` for every COMPLETE
 *  Analysis so its Cross-Source Narrative gets regenerated in the new NarrativeDocument shape —
 *  `SynthesisResult.narrative`'s shape changes in place, no dual-format period. Run ad hoc via
 *  `npx tsx src/scripts/backfillNarratives.ts` (same convention as `testPrompts.ts` — not wired
 *  into package.json). Nulls each Analysis's cached `narrative` first: `narrativeJob.ts`'s own
 *  "narrative already present (redelivered job?)" skip guard would otherwise silently no-op the
 *  re-enqueue for every already-narrated historical Analysis. */
import { findAnalysesPage } from '../repositories/analysis.js'
import { nullifySynthesisResultNarrative } from '../repositories/synthesisResult.js'
import { enqueueJob } from '../jobs/enqueue.js'
import { JobName } from '../jobs/jobDefinitions.js'
import { splitPage, type Cursor } from '../pagination.js'

const PAGE_SIZE = 50

async function main() {
  let cursor: Cursor | undefined
  let total = 0
  let failed = 0

  for (;;) {
    const rows = await findAnalysesPage(false, cursor, PAGE_SIZE)
    const { items, nextCursor } = splitPage(rows, PAGE_SIZE)
    if (items.length === 0) break

    for (const row of items) {
      try {
        // nullifySynthesisResultNarrative runs the enqueue inside its own transaction (via
        // onTransition) — a failure enqueueing rolls the nullify back too, so an Analysis can
        // never end up with its narrative cleared and no regeneration job actually in flight.
        await nullifySynthesisResultNarrative(row.id, (tx) =>
          enqueueJob(JobName.Narrative, { analysisId: row.id }, { tx }).then(() => undefined)
        )
        total++
      } catch (err) {
        failed++
        console.error(`Failed to re-enqueue narrative.generate for Analysis ${row.id}:`, err)
      }
    }

    console.log(`Re-enqueued ${total} so far (${failed} failed)...`)
    if (!nextCursor) break
    const last = items[items.length - 1]
    cursor = { createdAt: last.createdAt, id: last.id }
  }

  console.log(`Done. Re-enqueued ${total} Analyses (${failed} failed).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
