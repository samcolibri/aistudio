import 'dotenv/config'
import { Client, Connection } from '@temporalio/client'
import { fetchApprovedBriefs, markAsProducing } from './client/airtable.js'
import type { ContentCreationInput } from './types/workflow.js'

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233'
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default'
const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? 'simplenursing-studio'
const POLL_INTERVAL_MS = 30 * 60 * 1000  // 30 minutes

async function getClient(): Promise<Client> {
  const connection = await Connection.connect({ address: TEMPORAL_ADDRESS })
  return new Client({ connection, namespace: TEMPORAL_NAMESPACE })
}

async function checkAndDispatch(client: Client) {
  console.log(`[Scheduler] ${new Date().toISOString()} — polling Airtable for approved briefs`)

  let briefs
  try {
    briefs = await fetchApprovedBriefs()
  } catch (err) {
    console.error('[Scheduler] Airtable fetch failed:', err)
    return
  }

  if (briefs.length === 0) {
    console.log('[Scheduler] No new approved briefs — sleeping')
    return
  }

  console.log(`[Scheduler] Found ${briefs.length} approved briefs — dispatching workflows`)

  for (const brief of briefs) {
    const workflowId = `content-creation-${brief.id}`

    // Check if workflow already running
    try {
      const handle = client.workflow.getHandle(workflowId)
      const desc = await handle.describe()
      if (desc.status.name === 'RUNNING') {
        console.log(`[Scheduler] ${workflowId} already running — skip`)
        continue
      }
    } catch {
      // Workflow doesn't exist yet — proceed
    }

    console.log(`[Scheduler] Starting workflow — ${workflowId} (${brief.channel}: ${brief.title})`)

    try {
      const input: ContentCreationInput = { brief }
      const handle = await client.workflow.start('ContentCreationWorkflow', {
        taskQueue: TASK_QUEUE,
        workflowId,
        args: [input],
        workflowExecutionTimeout: '6h',
      })

      await markAsProducing(brief.id, handle.workflowId)
      console.log(`[Scheduler] Dispatched → ${handle.workflowId}`)
    } catch (err) {
      console.error(`[Scheduler] Failed to start ${workflowId}:`, err)
    }
  }
}

async function main() {
  const client = await getClient()
  console.log(`[Scheduler] Running — polling every ${POLL_INTERVAL_MS / 60000}min`)

  while (true) {
    await checkAndDispatch(client)
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
}

main().catch(err => {
  console.error('[Scheduler] Fatal:', err)
  process.exit(1)
})
