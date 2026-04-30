// Polls Airtable every 30min for Creative Approved briefs → dispatches NurseForge workflows
import 'dotenv/config'
import { Client, Connection } from '@temporalio/client'
import { fetchCreativeApprovedBriefs, setProductionStatus } from './client/airtable.js'
import type { ContentBrief } from './types/brief.js'

const POLL_INTERVAL_MS = 30 * 60 * 1000
const TASK_QUEUE       = process.env.TEMPORAL_TASK_QUEUE ?? 'simplenursing-studio'

async function getClient() {
  const conn = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' })
  return new Client({ connection: conn, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default' })
}

async function dispatch(client: Client, brief: ContentBrief) {
  const workflowId = `nurseforge-${brief.airtableId}`

  // Check if already running
  try {
    const handle = client.workflow.getHandle(workflowId)
    const desc = await handle.describe()
    if (desc.status.name === 'RUNNING') {
      console.log(`  [skip] ${workflowId} already running`)
      return
    }
  } catch { /* doesn't exist yet — proceed */ }

  console.log(`  [dispatch] ${workflowId} — #${brief.rank} ${brief.title.slice(0, 50)} [${brief.channel}]`)
  await client.workflow.start('NurseForgeWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId,
    args: [brief],
    workflowExecutionTimeout: '7 days',
  })
  await setProductionStatus(brief.airtableId, 'Queued', workflowId)
}

async function poll(client: Client) {
  console.log(`\n[Scheduler] ${new Date().toISOString()} — checking Airtable...`)
  let briefs: ContentBrief[]
  try {
    briefs = await fetchCreativeApprovedBriefs()
  } catch (err) {
    console.error('[Scheduler] Airtable error:', err)
    return
  }

  console.log(`[Scheduler] ${briefs.length} Creative Approved brief(s)`)
  for (const brief of briefs) {
    await dispatch(client, brief)
  }
}

async function main() {
  const client = await getClient()
  console.log(`[Scheduler] Started — polling every ${POLL_INTERVAL_MS / 60000}min`)
  while (true) {
    await poll(client)
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
}

main().catch(err => {
  console.error('[Scheduler] Fatal:', err)
  process.exit(1)
})
