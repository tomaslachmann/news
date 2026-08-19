import { getQueueClient, stopQueueClient } from './jobs/queueClient.js'

// No job handlers registered yet — tickets 14/15/17 each add theirs via registerJobWorker().
// Starting the queue here just brings the shared pg-boss instance up and declares every known
// queue (see jobDefinitions.ts) so they exist with the right retry policy ahead of that.
const start = async () => {
  try {
    await getQueueClient()
    console.log('Worker started; queues ready, no job handlers registered yet.')
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
