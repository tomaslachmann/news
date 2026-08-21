import { getQueueClient, stopQueueClient } from './jobs/queueClient.js'
import { registerJobWorker } from './jobs/registerWorker.js'
import { JobName } from './jobs/jobDefinitions.js'
import { runEntityRelationJob } from './jobs/entityRelationJob.js'
import { runNarrativeJob } from './jobs/narrativeJob.js'
import { runThreadRecomputeJob } from './jobs/threadRecomputeJob.js'
import { runEntityImageEnrichJob } from './jobs/entityImageEnrichJob.js'
import { makeConsoleLogger } from './jobs/consoleLogger.js'
import * as analysisRepo from './repositories/analysis.js'
import * as coverageRepo from './repositories/coverage.js'
import * as entityRepo from './repositories/entity.js'
import * as entityAliasRepo from './repositories/entityAlias.js'
import * as entityImageRepo from './repositories/entityImage.js'
import * as storyRelationRepo from './repositories/storyRelation.js'
import * as synthesisResultRepo from './repositories/synthesisResult.js'
import * as threadRepo from './repositories/thread.js'

const workerLog = makeConsoleLogger()

const start = async () => {
  try {
    await getQueueClient()
    // The three queues are independent — registered concurrently so their pg-boss declaration
    // latencies don't add up on every process start/restart.
    await Promise.all([
      registerJobWorker(JobName.EntityRelation, (payload) =>
        runEntityRelationJob(
          payload,
          {
            findAnalysisWithStory: analysisRepo.findAnalysisWithStory,
            findCoveragesForAnalysis: coverageRepo.findCoveragesForAnalysis,
            // ticket 40 / ADR 0033: resolveEntityKey baked in via closure rather than threaded
            // through entityRelationJob.ts/storyRelationPass.ts's own deps interfaces — it's an
            // implementation detail of *how* replaceStoryEntities persists, not something either
            // of those layers needs to know about or inject separately.
            replaceStoryEntities: (storyId, entities, entityRelations) =>
              entityRepo.replaceStoryEntities(
                storyId,
                entities,
                entityRelations,
                entityAliasRepo.resolveEntityKey
              ),
            findStoryEntitiesForScoring: entityRepo.findStoryEntitiesForScoring,
            countStories: entityRepo.countStories,
            findRelationCandidateStories: storyRelationRepo.findRelationCandidateStories,
            createStoryRelation: storyRelationRepo.createStoryRelation,
          },
          workerLog
        )
      ),
      registerJobWorker(JobName.Narrative, (payload) =>
        runNarrativeJob(
          payload,
          {
            findAnalysisWithDetails: analysisRepo.findAnalysisWithDetails,
            updateSynthesisResultNarrative: synthesisResultRepo.updateSynthesisResultNarrative,
            markNarrativeGenerationFailedSafe: synthesisResultRepo.markNarrativeGenerationFailedSafe,
          },
          workerLog
        )
      ),
      registerJobWorker(JobName.ThreadRecompute, (payload) =>
        runThreadRecomputeJob(
          payload,
          {
            findFollowUpComponent: threadRepo.findFollowUpComponent,
            anyExistingThreadForStories: threadRepo.anyExistingThreadForStories,
            findAgreementForTitle: threadRepo.findAgreementForTitle,
            upsertThreadFromComponent: threadRepo.upsertThreadFromComponent,
          },
          workerLog
        )
      ),
      registerJobWorker(JobName.EntityImageEnrich, (payload) =>
        runEntityImageEnrichJob(
          payload,
          {
            findEntityById: entityRepo.findEntityById,
            findEntityImageForEntity: entityImageRepo.findEntityImageForEntity,
            createEntityImage: entityImageRepo.createEntityImage,
          },
          workerLog
        )
      ),
    ])
    console.log(
      'Worker started; entity.extract, narrative.generate, thread.recompute, and ' +
        'entity.image.enrich handlers registered.'
    )
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

const shutdown = async () => {
  try {
    await stopQueueClient()
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

void start()
