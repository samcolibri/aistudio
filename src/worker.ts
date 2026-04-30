import 'dotenv/config'
import { Worker, NativeConnection } from '@temporalio/worker'
import * as activities from './activities/index.js'

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233'
const TASK_QUEUE       = process.env.TEMPORAL_TASK_QUEUE ?? 'simplenursing-studio'

async function main() {
  const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS })

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath: new URL('./workflows/nurseforge.workflow.js', import.meta.url).pathname,
    activities,
    maxConcurrentActivityTaskExecutions: 3, // limit parallel AI calls
  })

  console.log(`[Worker] Started on queue: ${TASK_QUEUE}`)
  console.log(`[Worker] Temporal UI → http://localhost:8080`)
  console.log(`[Worker] Activities: ${Object.keys(activities).join(', ')}`)
  await worker.run()
}

main().catch(err => {
  console.error('[Worker] Fatal:', err)
  process.exit(1)
})
