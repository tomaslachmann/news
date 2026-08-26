/** One-off manual regen (same ad hoc convention as scripts/backfillNarratives.ts): forces a single
 *  COMPLETE Analysis's Cross-Source Narrative to regenerate. Nulls its cached `narrative` first
 *  (narrativeJob.ts's "narrative already present" skip guard would otherwise no-op), then runs the
 *  `narrative.generate` job handler directly in-process rather than round-tripping through pg-boss —
 *  simpler for a single manual rerun, no worker process needs to be running.
 *
 *  Run via `npx tsx --env-file-if-exists=../../.env src/scripts/regenNarrativeForAnalysis.ts <analysisId>`
 *  from packages/backend. */
import * as analysisRepo from '../repositories/analysis.js'
import * as entityRepo from '../repositories/entity.js'
import * as narrativeImageRepo from '../repositories/narrativeImage.js'
import * as synthesisResultRepo from '../repositories/synthesisResult.js'
import * as threadRepo from '../repositories/thread.js'
import { runNarrativeJob } from '../jobs/narrativeJob.js'
import { makeConsoleLogger } from '../jobs/consoleLogger.js'

async function main() {
  const analysisId = process.argv[2]
  if (!analysisId) {
    console.error('Usage: npx tsx src/scripts/regenNarrativeForAnalysis.ts <analysisId>')
    process.exit(1)
  }

  console.log(`Clearing cached narrative for Analysis ${analysisId}...`)
  await synthesisResultRepo.nullifySynthesisResultNarrative(analysisId)

  console.log('Running narrative.generate synchronously...')
  await runNarrativeJob(
    { analysisId },
    {
      findAnalysisWithDetails: analysisRepo.findAnalysisWithDetails,
      findEntityMentionsForStory: entityRepo.findEntityMentionsForStory,
      updateSynthesisResultNarrative: synthesisResultRepo.updateSynthesisResultNarrative,
      markNarrativeGenerationFailedSafe: synthesisResultRepo.markNarrativeGenerationFailedSafe,
      findNarrativeImageForSynthesisResult: narrativeImageRepo.findNarrativeImageForSynthesisResult,
      createNarrativeImage: narrativeImageRepo.createNarrativeImage,
      findThreadIdForStory: threadRepo.findThreadIdForStory,
    },
    makeConsoleLogger()
  )

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
