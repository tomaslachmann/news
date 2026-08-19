import type { FastifyBaseLogger } from 'fastify'
import { getQueueClient, stopQueueClient } from './jobs/queueClient.js'
import { registerJobWorker } from './jobs/registerWorker.js'
import { JobName } from './jobs/jobDefinitions.js'
import { runEntityRelationJob } from './jobs/entityRelationJob.js'
import * as analysisRepo from './repositories/analysis.js'
import * as coverageRepo from './repositories/coverage.js'
import * as entityRepo from './repositories/entity.js'
import * as storyRelationRepo from './repositories/storyRelation.js'

// No Fastify app runs in this process, so there's no request-scoped logger to reuse — a thin
// console-backed adapter satisfying just the levels the job pipeline actually calls (warn/error)
// gives job failures an application-log trail alongside pg-boss's own archive row, without adding
// a direct pino dependency this process would otherwise need only for this.
const workerLog = {
  warn: (obj: unknown, msg?: string) => console.warn(msg ?? '', obj),
  error: (obj: unknown, msg?: string) => console.error(msg ?? '', obj),
} as unknown as FastifyBaseLogger

// Tickets 15/17 each add their own handler via registerJobWorker() alongside this one.
const start = async () => {
  try {
    await getQueueClient()
    await registerJobWorker(JobName.EntityRelation, (payload) =>
      runEntityRelationJob(
        payload,
        {
          findAnalysisWithStory: analysisRepo.findAnalysisWithStory,
          findCoveragesForAnalysis: coverageRepo.findCoveragesForAnalysis,
          replaceStoryEntities: entityRepo.replaceStoryEntities,
          findStoryEntitiesForScoring: entityRepo.findStoryEntitiesForScoring,
          countStories: entityRepo.countStories,
          findRelationCandidateStories: storyRelationRepo.findRelationCandidateStories,
          createStoryRelation: storyRelationRepo.createStoryRelation,
        },
        workerLog
      )
    )
    console.log('Worker started; entity.extract handler registered.')
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
