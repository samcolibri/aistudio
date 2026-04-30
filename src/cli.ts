#!/usr/bin/env node
import 'dotenv/config'
import { Client, Connection } from '@temporalio/client'
import { fetchBriefById, fetchApprovedBriefs } from './client/airtable.js'
import type { ContentCreationInput } from './types/workflow.js'

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233'
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default'
const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? 'simplenursing-studio'

async function getClient() {
  const conn = await Connection.connect({ address: TEMPORAL_ADDRESS })
  return new Client({ connection: conn, namespace: TEMPORAL_NAMESPACE })
}

const [,, command, ...args] = process.argv

async function trigger() {
  const client = await getClient()
  const recordId = args[0]

  let brief
  if (recordId) {
    console.log(`Fetching brief ${recordId}...`)
    brief = await fetchBriefById(recordId)
  } else {
    const briefs = await fetchApprovedBriefs()
    if (briefs.length === 0) { console.log('No approved briefs found'); process.exit(0) }
    brief = briefs[0]
    console.log(`Using top-ranked brief: ${brief.title}`)
  }

  const workflowId = `content-creation-${brief.id}`
  const input: ContentCreationInput = { brief }

  const handle = await client.workflow.start('ContentCreationWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId,
    args: [input],
    workflowExecutionTimeout: '6h',
  })

  console.log(`\nStarted workflow: ${handle.workflowId}`)
  console.log(`View in Temporal UI: http://localhost:8080/namespaces/default/workflows/${handle.workflowId}`)
  console.log(`\nBrief: ${brief.title}`)
  console.log(`Channel: ${brief.channel} | Persona: ${brief.personaId}`)
}

async function list() {
  const briefs = await fetchApprovedBriefs()
  if (briefs.length === 0) { console.log('No approved briefs'); return }
  console.log(`\nApproved briefs ready to produce (${briefs.length}):\n`)
  briefs.forEach((b, i) => {
    console.log(`  ${i + 1}. [${b.id}] ${b.title}`)
    console.log(`     Channel: ${b.channel} | Type: ${b.contentType} | Persona: ${b.personaId} | Score: ${b.score}`)
    console.log()
  })
}

switch (command) {
  case 'trigger': await trigger(); break
  case 'list':    await list(); break
  default:
    console.log('Usage: tsx src/cli.ts <trigger [recordId]|list>')
    process.exit(1)
}
