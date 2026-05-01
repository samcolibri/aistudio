/**
 * Upload carousel slides to GitHub + sync to Airtable Produced Videos table
 * Also updates the Creative Link field on the brief record
 *
 * Run: npx tsx src/scripts/airtable-sync-carousel.ts
 */
import 'dotenv/config'
import { readFile } from 'fs/promises'
import { join, basename } from 'path'
import { spawn } from 'child_process'

const STUDIO_BASE  = process.env.AIRTABLE_STUDIO_BASE ?? 'app4LEuOXBxPArLsr'
const STUDIO_KEY   = process.env.AIRTABLE_STUDIO_KEY  ?? process.env.AIRTABLE_API_KEY!
const BRIEFS_BASE  = process.env.AIRTABLE_BASE_ID     ?? 'appLFh438nLooz6u7'
const BRIEFS_KEY   = process.env.AIRTABLE_API_KEY!
const BRIEFS_TABLE = 'tbl5P3J8agdY4gNtT'
const REPO         = 'samcolibri/aistudio'
const TAG          = 'simplenursing-assets-2026-05-01'
const BRIEF_ID     = 'recUm0xdiqNLg664h'  // Should I Be a Nurse?
const TABLE_NAME   = 'Produced Videos'

const SLIDES = [
  { file: 'slide_01.png', label: 'HOOK — How to figure out if nursing fits your life' },
  { file: 'slide_02.png', label: 'Q1-3 — Start with the practical questions' },
  { file: 'slide_03.png', label: 'Q4-6 — Think about the day to day' },
  { file: 'slide_04.png', label: 'Q7-9 — Big picture questions' },
  { file: 'slide_05.png', label: 'Q10 — The most important question' },
  { file: 'slide_06.png', label: 'CTA — simplenursing.com/quiz' },
]

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    let out = ''
    const child = spawn(cmd, args, { stdio: 'pipe', env: { ...process.env, GITHUB_TOKEN: '' } })
    child.stdout?.on('data', d => out += d.toString())
    child.stderr?.on('data', () => {})
    child.on('close', () => resolve(out.trim()))
  })
}

async function at(path: string, key: string, method = 'GET', body?: object) {
  const res = await fetch(`https://api.airtable.com/v0${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const d = await res.json() as any
  if (!res.ok) throw new Error(`AT ${method} ${path}: ${JSON.stringify(d).slice(0, 200)}`)
  return d
}

async function getTableId(): Promise<string> {
  const meta = await at(`/meta/bases/${STUDIO_BASE}/tables`, STUDIO_KEY)
  const t = (meta.tables as any[]).find(t => t.name === TABLE_NAME)
  if (!t) throw new Error(`Table "${TABLE_NAME}" not found`)
  return t.id
}

async function main() {
  console.log('\n📸 Syncing "Should I Be a Nurse?" carousel (6 slides) to GitHub + Airtable\n')

  const tableId = await getTableId()
  const slideDir = join(process.cwd(), 'output/recUm0xdiqNLg664h/carousel')
  let firstUrl = ''

  for (let i = 0; i < SLIDES.length; i++) {
    const slide = SLIDES[i]
    const filePath = join(slideDir, slide.file)
    process.stdout.write(`  [${i+1}/6] Uploading ${slide.file}... `)

    // Upload to GitHub
    await run('gh', ['release', 'upload', TAG, filePath, '--clobber', '--repo', REPO])
    const url = `https://github.com/${REPO}/releases/download/${TAG}/${encodeURIComponent(slide.file)}`
    if (i === 0) firstUrl = url
    console.log('✅ GitHub')

    // Add to Airtable Produced Videos
    await at(`/${STUDIO_BASE}/${tableId}`, STUDIO_KEY, 'POST', {
      fields: {
        'Name':          `Should I Be a Nurse? Carousel — ${slide.label}`,
        'Type':          'AI Generated',
        'Channel':       'Instagram',
        'Status':        'Final',
        'Brief ID':      BRIEF_ID,
        'GitHub URL':    url,
        'Date Produced': new Date().toISOString().slice(0, 10),
        'Notes':         'Instagram carousel slide. 6-slide quiz format. PIL pixel-perfect text, SimpleNursing brand colors. Zero spelling errors.',
      }
    }).catch(e => console.log(`  ⚠ Airtable: ${e.message?.slice(0,80)}`))
  }

  // Update the Creative Link on the brief record
  console.log('\n  Updating Creative Link on brief record...')
  await at(`/${BRIEFS_BASE}/${BRIEFS_TABLE}/${BRIEF_ID}`, BRIEFS_KEY, 'PATCH', {
    fields: {
      'Creative Link': firstUrl,
      'Creative Approved?': 'Waiting for Content',  // keep as-is until Chad approves
    }
  }).catch(e => console.log(`  ⚠ Brief update: ${e.message?.slice(0,80)}`))

  console.log('\n✅ Done! Carousel synced to Airtable')
  console.log(`  View assets: https://airtable.com/${STUDIO_BASE}`)
  console.log(`  View brief:  https://airtable.com/${BRIEFS_BASE}/${BRIEFS_TABLE}/${BRIEF_ID}`)
  console.log(`  Slide 1 URL: ${firstUrl}`)
}

main().catch(console.error)
