import 'dotenv/config'
import { Worker, NativeConnection } from '@temporalio/worker'
import * as activities from './activities/index.js'

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233'
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default'
const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? 'simplenursing-studio'

async function main() {
  const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS })

  const worker = await Worker.create({
    connection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: TASK_QUEUE,
    workflowsPath: new URL('./workflows/content-creation.workflow.js', import.meta.url).pathname,
    activities,
    maxConcurrentActivityTaskExecutions: 5,
  })

  console.log(`[Worker] Started — queue: ${TASK_QUEUE} | namespace: ${TEMPORAL_NAMESPACE}`)
  console.log(`[Worker] Temporal UI → http://localhost:8080`)

  await worker.run()
}

main().catch(err => {
  console.error('[Worker] Fatal error:', err)
  process.exit(1)
})
