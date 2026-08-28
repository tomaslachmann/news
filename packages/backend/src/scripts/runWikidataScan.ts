/** One-off manual run of the semi-automated entity → Wikidata linker (ticket 93 / ADR 0042,
 *  operability follow-up ticket 94). The job is normally scheduled once a day and has no on-boot
 *  send, so this is the operator escape hatch for a first run or for debugging one — same ad hoc
 *  convention as `backfillNarratives.ts` / `regenNarrativeForAnalysis.ts` (not wired into
 *  package.json). Runs `runEntityWikidataScan` in-process against the real dependencies — no
 *  pg-boss round-trip, no worker process needed — and prints the run summary.
 *
 *  The `WIKIDATA_SCAN_MIN_STORY_COUNT` / `WIKIDATA_SCAN_MAX_PER_RUN` / `WIKIDATA_SUGGESTION_TTL_DAYS`
 *  env vars apply here too; lower `WIKIDATA_SCAN_MIN_STORY_COUNT` to widen the first pass.
 *
 *  Run from packages/backend:
 *    SERVICE_NAME=scripts npx tsx --env-file-if-exists=../../.env src/scripts/runWikidataScan.ts
 */
import * as entityRepo from '../repositories/entity.js'
import * as suggestionRepo from '../repositories/entityWikidataSuggestion.js'
import { recordAdminActionSafe } from '../repositories/adminActionLog.js'
import { enqueueJob } from '../jobs/enqueue.js'
import { JobName } from '../jobs/jobDefinitions.js'
import {
  fetchItemDetails,
  resolveByCswikiTitle,
  searchTypedCandidates,
} from '../services/wikidataSearchClient.js'
import { reconcile } from '../services/wikidataReconcileClient.js'
import {
  runEntityWikidataScan,
  WIKIDATA_SCAN_MIN_STORY_COUNT,
  WIKIDATA_SCAN_MAX_PER_RUN,
} from '../services/entityWikidataScanService.js'
import { createLogger } from '../logger.js'

async function main() {
  console.log(
    `Running entity.wikidata.scan (minStoryCount=${WIKIDATA_SCAN_MIN_STORY_COUNT}, ` +
      `maxPerRun=${WIKIDATA_SCAN_MAX_PER_RUN})...`
  )

  const result = await runEntityWikidataScan(
    {
      findUnlinkedEntitiesForScan: suggestionRepo.findUnlinkedEntitiesForScan,
      countUnlinkedEntitiesForScan: suggestionRepo.countUnlinkedEntitiesForScan,
      findRejectedQidsByEntity: suggestionRepo.findRejectedQidsByEntity,
      upsertSuggestion: suggestionRepo.upsertSuggestion,
      deleteSuggestion: suggestionRepo.deleteSuggestion,
      setEntityWikidataId: entityRepo.setEntityWikidataId,
      recordAdminAction: recordAdminActionSafe,
      enqueueImageEnrich: async (entityId) => {
        await enqueueJob(JobName.EntityImageEnrich, { entityId })
      },
      resolveByCswikiTitle,
      searchTypedCandidates,
      fetchItemDetails,
      reconcile,
    },
    createLogger(JobName.EntityWikidataScan)
  )

  console.log('Done:', result)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
