#!/usr/bin/env node
/**
 * Autonomous Airtable Watcher — runs 24/7 on Railway
 *
 * Polls Chad's Airtable every 5 minutes for newly "Creative Approved" briefs.
 * When found: triggers full production pipeline → updates status in Airtable.
 *
 * tsx src/watcher.ts
 */
import 'dotenv/config'
import chalk from 'chalk'
import { fetchCreativeApprovedBriefs, setProductionStatus } from './client/airtable.js'
import { spawn } from 'child_process'
import { join } from 'path'

const POLL_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes
const ROOT = process.cwd()
const producedIds = new Set<string>()  // session memory — tracks what we triggered

console.log(chalk.bold('\n  🤖 SimpleNursing AI Studio — Autonomous Watcher\n'))
console.log(chalk.dim(`  Polling Airtable every 5 min for Creative Approved briefs...`))
console.log(chalk.dim(`  Dashboard: http://localhost:3004  |  Remotion: http://localhost:3003\n`))

async function checkAndProduce() {
  try {
    const briefs = await fetchCreativeApprovedBriefs()

    for (const brief of briefs) {
      // Skip if already triggered in this session or already producing
      if (producedIds.has(brief.airtableId)) continue

      console.log(chalk.cyan(`\n  📋 New brief: #${brief.rank} "${brief.title}" [${brief.channel}]`))
      producedIds.add(brief.airtableId)

      // Mark as producing in Airtable
      await setProductionStatus(brief.airtableId, 'Producing').catch(() => {})

      // Spawn producer in background
      const child = spawn(
        join(ROOT, 'node_modules/.bin/tsx'),
        ['src/produce-now.ts', '--rank', String(brief.rank)],
        { cwd: ROOT, env: process.env, stdio: 'inherit' }
      )

      child.on('close', async (code) => {
        if (code === 0) {
          console.log(chalk.green(`\n  ✅ #${brief.rank} "${brief.title}" — production complete`))
        } else {
          console.log(chalk.red(`\n  ✗ #${brief.rank} production failed (exit ${code})`))
          await setProductionStatus(brief.airtableId, 'Failed').catch(() => {})
        }
      })
    }

    if (briefs.length === 0) {
      process.stdout.write(chalk.dim(`\r  [${new Date().toLocaleTimeString()}] No new briefs — sleeping 5 min...`))
    }
  } catch (err) {
    console.error(chalk.red(`\n  Watcher error: ${String(err)}`))
  }
}

// Run immediately then on interval
checkAndProduce()
setInterval(checkAndProduce, POLL_INTERVAL_MS)
