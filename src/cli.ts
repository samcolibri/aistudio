#!/usr/bin/env node
/**
 * aistudio CLI
 *
 * tsx src/cli.ts list                       — list Creative Approved briefs
 * tsx src/cli.ts trigger [airtableId]       — start NurseForge for top brief or specific ID
 * tsx src/cli.ts trigger --rank 3           — start for rank 3
 * tsx src/cli.ts approve-creative <wfId>    — send creative_approved signal to running workflow
 * tsx src/cli.ts status <workflowId>        — query workflow status
 */
import 'dotenv/config'
import { Client, Connection } from '@temporalio/client'
import { fetchCreativeApprovedBriefs, fetchBriefByRank, fetchBriefById } from './client/airtable.js'
import { creativeApprovedSignal, getStatusQuery } from './workflows/nurseforge.workflow.js'
import chalk from 'chalk'

const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? 'simplenursing-studio'

async function getClient() {
  const conn = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' })
  return new Client({ connection: conn, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default' })
}

const [,, command, ...args] = process.argv

switch (command) {
  case 'list':          await cmdList(); break
  case 'trigger':       await cmdTrigger(args); break
  case 'approve-creative': await cmdApproveCreative(args[0]); break
  case 'status':        await cmdStatus(args[0]); break
  default:
    console.log(`
${chalk.bold('aistudio CLI')}

  list                         List Creative Approved briefs
  trigger [id]                 Start NurseForge for top brief or specific Airtable ID
  trigger --rank <n>           Start NurseForge for brief at rank N
  approve-creative <workflowId> Send creative_approved signal (Chad approved)
  status <workflowId>          Query workflow status
`)
    process.exit(0)
}

async function cmdList() {
  const briefs = await fetchCreativeApprovedBriefs()
  if (briefs.length === 0) { console.log('No Creative Approved briefs found.'); return }

  console.log(chalk.bold(`\nCreative Approved Briefs (${briefs.length}):\n`))
  for (const b of briefs) {
    console.log(
      chalk.cyan(`  #${b.rank}`),
      chalk.bold(b.title.slice(0, 55)),
      chalk.dim(`[${b.channel}]`),
      chalk.dim(`persona: ${b.personaId}`),
      chalk.green(`score: ${b.score}`)
    )
    console.log(chalk.dim(`     ${b.airtableId}`))
    console.log()
  }
}

async function cmdTrigger(args: string[]) {
  const client = await getClient()
  let brief

  const rankIdx = args.indexOf('--rank')
  if (rankIdx >= 0) {
    const rank = parseInt(args[rankIdx + 1])
    brief = await fetchBriefByRank(rank)
    if (!brief) { console.error(`No brief found at rank ${rank}`); process.exit(1) }
  } else if (args[0] && !args[0].startsWith('--')) {
    brief = await fetchBriefById(args[0])
  } else {
    const briefs = await fetchCreativeApprovedBriefs()
    if (briefs.length === 0) { console.log('No Creative Approved briefs.'); return }
    brief = briefs[0]
  }

  const workflowId = `nurseforge-${brief.airtableId}`
  console.log(chalk.bold(`\nStarting NurseForge workflow`))
  console.log(`  Brief:    #${brief.rank} ${brief.title}`)
  console.log(`  Channel:  ${brief.channel} | Persona: ${brief.personaId}`)
  console.log(`  Workflow: ${workflowId}`)

  const handle = await client.workflow.start('NurseForgeWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId,
    args: [brief],
    workflowExecutionTimeout: '7 days',
  })

  console.log(chalk.green(`\n✓ Started`))
  console.log(`  Temporal UI → http://localhost:8080/namespaces/default/workflows/${workflowId}`)
  console.log(`\n  When Chad approves creatives in Airtable, run:`)
  console.log(chalk.cyan(`  tsx src/cli.ts approve-creative ${workflowId}`))
}

async function cmdApproveCreative(workflowId: string) {
  if (!workflowId) { console.error('Workflow ID required'); process.exit(1) }
  const client = await getClient()
  const handle = client.workflow.getHandle(workflowId)
  await handle.signal(creativeApprovedSignal)
  console.log(chalk.green(`✓ creative_approved signal sent to ${workflowId}`))
}

async function cmdStatus(workflowId: string) {
  if (!workflowId) { console.error('Workflow ID required'); process.exit(1) }
  const client = await getClient()
  const handle = client.workflow.getHandle(workflowId)
  const status = await handle.query(getStatusQuery)
  const desc = await handle.describe()
  console.log(`\nWorkflow: ${workflowId}`)
  console.log(`  Stage:    ${chalk.yellow(status)}`)
  console.log(`  State:    ${desc.status.name}`)
  console.log(`  Started:  ${desc.startTime}`)
}
