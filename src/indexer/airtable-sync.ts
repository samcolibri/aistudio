/**
 * Syncs .asset-manifest.json → AI Studio Airtable base
 *
 * tsx src/indexer/airtable-sync.ts
 *
 * Creates tables if they don't exist, upserts all analyzed assets.
 * Tables created:
 *   - Asset Library  (indexed videos/images from /Downloads/aistudio-assets)
 *   - Workflow Log   (NurseForge production runs)
 *   - Style Guide    (per-channel style fingerprints)
 */
import 'dotenv/config'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import fetch from 'node-fetch'
import chalk from 'chalk'
import type { AssetRecord } from './index.js'

const BASE_ID = process.env.AIRTABLE_STUDIO_BASE!
const API_KEY = process.env.AIRTABLE_STUDIO_KEY!
const META    = 'https://api.airtable.com/v0/meta'
const DATA    = 'https://api.airtable.com/v0'
const MANIFEST_PATH = join(process.cwd(), '.asset-manifest.json')

function headers() {
  return { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
}

async function atFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { ...headers(), ...(opts?.headers as Record<string,string> ?? {}) } })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Airtable ${r.status}: ${t.slice(0, 200)}`)
  }
  return r.json()
}

// ── Table definitions ──────────────────────────────────────────────────────────

const ASSET_LIBRARY_FIELDS = [
  { name: 'Title',               type: 'singleLineText' },
  { name: 'Filename',            type: 'singleLineText' },
  { name: 'Folder',              type: 'singleLineText' },
  { name: 'Category',            type: 'singleSelect', options: { choices: [
    'music_video','tutorial_video','short_form','carousel','thumbnail','story','product','youtube_long_form','membership_video'
  ].map(n => ({ name: n })) } },
  { name: 'Channel',             type: 'singleSelect', options: { choices: [
    'youtube','tiktok','instagram','pinterest','story','membership','unknown'
  ].map(n => ({ name: n })) } },
  { name: 'Format',              type: 'singleSelect', options: { choices: [
    '16:9','9:16','1:1','2:3','4:5','unknown'
  ].map(n => ({ name: n })) } },
  { name: 'Persona',             type: 'singleLineText' },
  { name: 'Topic',               type: 'singleLineText' },
  { name: 'Animation Style',     type: 'singleSelect', options: { choices: [
    'poster_overlay','talking_head','music_video','quiz_reveal','story_overlay','product_shot','static','none'
  ].map(n => ({ name: n })) } },
  { name: 'Hook Text',           type: 'singleLineText' },
  { name: 'Visual Style',        type: 'multilineText' },
  { name: 'What Works',          type: 'multilineText' },
  { name: 'Veo3 Prompt',         type: 'multilineText' },
  { name: 'Tags',                type: 'multilineText' },
  { name: 'Brand Colors',        type: 'checkbox',    options: { icon: 'check', color: 'greenBright' } },
  { name: 'Brand Consistency',   type: 'number',      options: { precision: 1 } },
  { name: 'Quality Score',       type: 'number',      options: { precision: 1 } },
  { name: 'File Type',           type: 'singleSelect', options: { choices: [{ name: 'video' }, { name: 'image' }] } },
  { name: 'R2 URL',              type: 'url' },
  { name: 'Copywriting Style',   type: 'multilineText' },
  { name: 'Error',               type: 'singleLineText' },
  { name: 'Indexed At',          type: 'dateTime',    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'America/Los_Angeles' } },
]

const WORKFLOW_LOG_FIELDS = [
  { name: 'Workflow ID',         type: 'singleLineText' },
  { name: 'Brief Title',         type: 'singleLineText' },
  { name: 'Channel',             type: 'singleSelect', options: { choices: ['youtube','tiktok','instagram','pinterest'].map(n=>({name:n})) } },
  { name: 'Persona',             type: 'singleLineText' },
  { name: 'Status',              type: 'singleSelect', options: { choices: [
    'Queued','Producing','Awaiting Approval','Publishing','Done','Failed'
  ].map(n=>({name:n})) } },
  { name: 'Output URLs',         type: 'multilineText' },
  { name: 'Airtable Brief ID',   type: 'singleLineText' },
  { name: 'Started At',          type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'America/Los_Angeles' } },
  { name: 'Completed At',        type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'America/Los_Angeles' } },
  { name: 'Notes',               type: 'multilineText' },
]

const STYLE_GUIDE_FIELDS = [
  { name: 'Name',                type: 'singleLineText' },
  { name: 'Channel',             type: 'singleSelect', options: { choices: ['youtube','tiktok','instagram','pinterest'].map(n=>({name:n})) } },
  { name: 'Recommended Format',  type: 'singleLineText' },
  { name: 'Avg Quality',         type: 'number', options: { precision: 1 } },
  { name: 'Veo3 Style Guide',    type: 'multilineText' },
  { name: 'Brand Patterns',      type: 'multilineText' },
  { name: 'Hook Examples',       type: 'multilineText' },
  { name: 'Asset Count',         type: 'number', options: { precision: 0 } },
  { name: 'Last Updated',        type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'America/Los_Angeles' } },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

async function listTables(): Promise<{ id: string; name: string }[]> {
  const r = await atFetch(`${META}/bases/${BASE_ID}/tables`) as { tables: { id: string; name: string }[] }
  return r.tables
}

async function createTable(name: string, fields: object[]): Promise<string> {
  const r = await atFetch(`${META}/bases/${BASE_ID}/tables`, {
    method: 'POST',
    body: JSON.stringify({ name, fields }),
  }) as { id: string }
  return r.id
}

async function addField(tableId: string, field: object): Promise<void> {
  await atFetch(`${META}/bases/${BASE_ID}/tables/${tableId}/fields`, {
    method: 'POST',
    body: JSON.stringify(field),
  }).catch(() => { /* field may already exist */ })
}

async function upsertRecords(tableId: string, records: { fields: Record<string, unknown> }[]): Promise<void> {
  // Airtable max 10 records per request
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10)
    await atFetch(`${DATA}/${BASE_ID}/${tableId}`, {
      method: 'POST',
      body: JSON.stringify({ records: batch, typecast: true }),
    })
    if (i + 10 < records.length) await new Promise(r => setTimeout(r, 250))
  }
}

async function ensureTable(name: string, fields: object[]): Promise<string> {
  const tables = await listTables()
  const existing = tables.find(t => t.name === name)
  if (existing) {
    console.log(`  ${chalk.dim('existing')} ${name} (${existing.id})`)
    // Add any missing fields
    for (const f of fields) {
      await addField(existing.id, f)
    }
    return existing.id
  }
  const id = await createTable(name, fields)
  console.log(`  ${chalk.green('created')}  ${name} (${id})`)
  return id
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!BASE_ID || !API_KEY) {
    console.error('AIRTABLE_STUDIO_BASE and AIRTABLE_STUDIO_KEY must be set in .env')
    process.exit(1)
  }

  console.log(chalk.bold('\n  AI Studio → Airtable Sync'))
  console.log(chalk.dim(`  Base: ${BASE_ID}\n`))

  // 1. Ensure tables
  console.log('Setting up tables...')
  const assetTableId    = await ensureTable('Asset Library', ASSET_LIBRARY_FIELDS)
  const workflowTableId = await ensureTable('Workflow Log',  WORKFLOW_LOG_FIELDS)
  const styleTableId    = await ensureTable('Style Guide',   STYLE_GUIDE_FIELDS)
  console.log()

  // 2. Load manifest
  if (!existsSync(MANIFEST_PATH)) {
    console.log(chalk.yellow('  No .asset-manifest.json found — run `npm run index` first'))
    return
  }
  const raw = await readFile(MANIFEST_PATH, 'utf8')
  const manifest = JSON.parse(raw) as { assets: AssetRecord[] }
  const assets = manifest.assets

  const analyzed = assets.filter(a => a.analysis)
  const errored  = assets.filter(a => a.errorMsg && !a.analysis)
  console.log(`  ${chalk.cyan(String(analyzed.length))} analyzed assets to sync`)
  console.log(`  ${chalk.yellow(String(errored.length))} failed assets (error logged)`)
  console.log()

  // 3. Push analyzed assets to Asset Library
  console.log('Pushing to Asset Library...')
  const records = analyzed.map(a => ({
    fields: {
      'Title':              a.analysis!.title,
      'Filename':           a.filename,
      'Folder':             a.folder,
      'Category':           a.analysis!.category,
      'Channel':            a.analysis!.channel,
      'Format':             a.analysis!.format,
      'Persona':            a.analysis!.persona,
      'Topic':              a.analysis!.topic,
      'Animation Style':    a.analysis!.animationStyle,
      'Hook Text':          a.analysis!.hookText || '',
      'Visual Style':       a.analysis!.visualStyle,
      'What Works':         (a.analysis!.whatWorks ?? []).join('\n• '),
      'Veo3 Prompt':        a.analysis!.veo3Prompt,
      'Tags':               (a.analysis!.tags ?? []).join(', '),
      'Brand Colors':       a.analysis!.brandColors,
      'Brand Consistency':  a.analysis!.brandConsistency,
      'Quality Score':      a.analysis!.qualityScore,
      'File Type':          a.type,
      'R2 URL':             a.r2Url ?? '',
      'Copywriting Style':  a.analysis!.copywritingStyle,
      'Indexed At':         a.indexedAt ?? new Date().toISOString(),
    }
  }))

  await upsertRecords(assetTableId, records)
  console.log(chalk.green(`  ✓ ${records.length} assets pushed`))

  // 4. Push errored assets (for visibility)
  if (errored.length > 0) {
    const errRecords = errored.map(a => ({
      fields: {
        'Title':    a.filename,
        'Filename': a.filename,
        'Folder':   a.folder,
        'File Type': a.type,
        'Error':    (a.errorMsg ?? '').slice(0, 500),
      }
    }))
    await upsertRecords(assetTableId, errRecords)
    console.log(chalk.yellow(`  ✓ ${errored.length} failed assets logged (no analysis)`))
  }

  // 5. Build Style Guide per channel
  console.log('\nBuilding Style Guide...')
  const { getStyleContext, styleContextToString } = await import('./query-assets.js')
  const channels = ['youtube', 'tiktok', 'instagram', 'pinterest']
  const styleRecords = []
  for (const ch of channels) {
    try {
      const ctx = await getStyleContext({ channel: ch })
      if (ctx.topAssets.length === 0) continue
      styleRecords.push({
        fields: {
          'Name':              `${ch.toUpperCase()} Style Guide`,
          'Channel':           ch,
          'Recommended Format': ctx.recommendedFormat,
          'Avg Quality':       ctx.averageQuality,
          'Veo3 Style Guide':  ctx.veo3StyleGuide,
          'Brand Patterns':    ctx.brandPatterns.join('\n• '),
          'Hook Examples':     ctx.hookExamples.join('\n'),
          'Asset Count':       ctx.topAssets.length,
          'Last Updated':      new Date().toISOString(),
        }
      })
    } catch { /* skip */ }
  }
  if (styleRecords.length > 0) {
    await upsertRecords(styleTableId, styleRecords)
    console.log(chalk.green(`  ✓ ${styleRecords.length} channel style guides`))
  }

  console.log(chalk.bold(`\n  Done! Open: https://airtable.com/${BASE_ID}`))
  console.log(`  Tables: Asset Library · Workflow Log · Style Guide\n`)
}

main().catch(err => {
  console.error(chalk.red('[Airtable Sync] Fatal:'), err.message)
  process.exit(1)
})
