#!/usr/bin/env node
/**
 * Asset Indexer — learns from /Downloads/aistudio-assets/ before NurseForge creates
 *
 * tsx src/indexer/index.ts                    — index all assets (resume-safe)
 * tsx src/indexer/index.ts --report           — print report from existing manifest
 * tsx src/indexer/index.ts --reindex          — force re-analyze all assets
 * tsx src/indexer/index.ts search "<query>"   — semantic search (needs ChromaDB)
 */
import 'dotenv/config'
import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { join, extname, basename, relative } from 'path'
import { existsSync } from 'fs'
import chalk from 'chalk'
import { extractFrameBase64, getVideoDimensions } from './extract-frame.js'
import { analyzeAssetVision, type AssetAnalysis } from './analyze-vision.js'
import { generateLearningReport } from './report.js'
import { embedAssetsToChroma, searchAssets } from './chroma.js'
import { uploadToR2 } from '../client/r2.js'

const ASSETS_DIR    = process.env.ASSETS_DIR ?? '/Users/anmolsam/Downloads/aistudio-assets'
const MANIFEST_PATH = join(process.cwd(), '.asset-manifest.json')

export interface AssetRecord {
  id: string
  filename: string
  relativePath: string
  absPath: string
  type: 'video' | 'image' | 'audio'
  ext: string
  sizeBytes: number
  folder: string
  analysis?: AssetAnalysis
  r2Url?: string
  r2ThumbnailUrl?: string
  chromaEmbedded?: boolean
  indexedAt?: string
  errorMsg?: string
}

type Manifest = { version: number; indexedAt: string; assets: AssetRecord[] }

const VIDEO_EXTS  = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm'])
const IMAGE_EXTS  = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

async function walkDir(dir: string): Promise<string[]> {
  const files: string[] = []
  async function recurse(d: string) {
    const entries = await readdir(d, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = join(d, e.name)
      if (e.isDirectory()) await recurse(full)
      else files.push(full)
    }
  }
  await recurse(dir)
  return files
}

function classifyFile(absPath: string): AssetRecord['type'] | null {
  const ext = extname(absPath).toLowerCase()
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (IMAGE_EXTS.has(ext)) return 'image'
  return null
}

async function loadManifest(): Promise<Manifest> {
  if (existsSync(MANIFEST_PATH)) {
    try {
      const raw = await readFile(MANIFEST_PATH, 'utf8')
      return JSON.parse(raw) as Manifest
    } catch { /* corrupted — start fresh */ }
  }
  return { version: 2, indexedAt: new Date().toISOString(), assets: [] }
}

async function saveManifest(m: Manifest) {
  m.indexedAt = new Date().toISOString()
  await writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2))
}

async function indexAsset(
  record: AssetRecord,
  uploadR2: boolean
): Promise<void> {
  const spinChar = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
  let i = 0
  const spin = setInterval(() => process.stdout.write(`\r${spinChar[i++ % spinChar.length]} ${record.filename.slice(0, 50).padEnd(50)}`), 80)

  try {
    let base64: string
    let mediaType: string

    if (record.type === 'video') {
      base64 = await extractFrameBase64(record.absPath)
      mediaType = 'image/png'
    } else {
      const ext = record.ext.slice(1)
      mediaType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      const buf = await readFile(record.absPath)
      // Downscale large images — Anthropic hard limit is 5MB base64, resize anything >1MB to be safe
      if (buf.length > 1_000_000) {
        const resized = await resizeImage(record.absPath)
        base64 = resized.base64
        mediaType = resized.mediaType  // always PNG after resize
      } else {
        base64 = buf.toString('base64')
      }
    }

    record.analysis = await analyzeAssetVision({
      base64,
      mediaType,
      filename: record.filename,
    })

    // Infer format from actual dimensions if video
    if (record.type === 'video') {
      try {
        const dims = await getVideoDimensions(record.absPath)
        if (dims.width > 0 && dims.height > 0) {
          const ratio = dims.width / dims.height
          record.analysis.format =
            ratio > 1.5  ? '16:9' :
            ratio < 0.7  ? '9:16' :
            ratio < 0.85 ? '4:5'  :
            ratio < 1.1  ? '1:1'  : '2:3'
        }
      } catch { /* keep Claude's guess */ }
    }

    record.indexedAt = new Date().toISOString()

    if (uploadR2 && process.env.R2_ENDPOINT) {
      const key = `assets/${record.folder}/${record.filename}`
      try {
        const ct = record.type === 'video' ? 'video/mp4' : `image/${record.ext.slice(1)}`
        record.r2Url = await uploadToR2({ localPath: record.absPath, key, contentType: ct })
      } catch { /* R2 not configured — skip */ }
    }

    clearInterval(spin)
    process.stdout.write(`\r${chalk.green('✓')} ${chalk.bold(record.analysis.title.slice(0, 45).padEnd(45))} ${chalk.dim(`[${record.analysis.category}]`)}\n`)
  } catch (err) {
    clearInterval(spin)
    record.errorMsg = String(err)
    process.stdout.write(`\r${chalk.red('✗')} ${record.filename.slice(0, 50)}\n`)
    console.error(`   ${chalk.dim(record.errorMsg?.slice(0, 100))}`)
  }
}

// Returns { base64, mediaType } — always outputs PNG so media type is consistent
async function resizeImage(imagePath: string): Promise<{ base64: string; mediaType: string }> {
  const { tmpdir } = await import('os')
  const { join: pathJoin } = await import('path')
  const tmp = pathJoin(tmpdir(), `resize_${Date.now()}.png`)
  const ffmpegStatic = (await import('ffmpeg-static')).default
  const Ffmpeg = (await import('fluent-ffmpeg')).default
  if (ffmpegStatic) Ffmpeg.setFfmpegPath(ffmpegStatic)
  await new Promise<void>((resolve, reject) =>
    Ffmpeg(imagePath)
      .outputOptions(['-vf', 'scale=640:-1'])
      .output(tmp)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  )
  const { readFile, unlink } = await import('fs/promises')
  const buf = await readFile(tmp)
  await unlink(tmp).catch(() => {})
  return { base64: buf.toString('base64'), mediaType: 'image/png' }
}

async function main() {
  const args = process.argv.slice(2)
  const forceReindex = args.includes('--reindex')
  const reportOnly = args.includes('--report')
  const uploadR2 = args.includes('--r2')

  // Search mode
  if (args[0] === 'search') {
    const query = args.slice(1).join(' ')
    if (!query) { console.error('Usage: index.ts search "<query>"'); process.exit(1) }
    await searchAssets(query)
    return
  }

  const manifest = await loadManifest()
  const existingById = new Map(manifest.assets.map(a => [a.id, a]))

  if (reportOnly && manifest.assets.length > 0) {
    console.log(generateLearningReport(manifest.assets))
    return
  }

  // Discover all assets
  console.log(chalk.bold(`\n  SimpleNursing Asset Indexer`))
  console.log(chalk.dim(`  Scanning: ${ASSETS_DIR}\n`))

  const allFiles = await walkDir(ASSETS_DIR)
  const assetFiles = allFiles.filter(f => classifyFile(f) !== null)
  console.log(`  Found ${chalk.cyan(String(assetFiles.length))} media assets across ${chalk.cyan(String(new Set(assetFiles.map(f => f.replace(ASSETS_DIR + '/', '').split('/')[0])).size))} folders\n`)

  const records: AssetRecord[] = []

  for (const absPath of assetFiles) {
    const rel = relative(ASSETS_DIR, absPath)
    const id = rel.replace(/[^a-zA-Z0-9]/g, '_')
    const existing = existingById.get(id)

    // Skip already-analyzed (unless --reindex)
    if (!forceReindex && existing?.analysis && !existing.errorMsg) {
      records.push(existing)
      continue
    }

    const s = await stat(absPath)
    const folder = rel.includes('/') ? rel.split('/')[0] : 'root'

    const record: AssetRecord = {
      id,
      filename: basename(absPath),
      relativePath: rel,
      absPath,
      type: classifyFile(absPath)!,
      ext: extname(absPath).toLowerCase(),
      sizeBytes: s.size,
      folder: folder.replace(/ /g, '_').toLowerCase(),
      ...(existing ?? {}),
    }

    await indexAsset(record, uploadR2)
    records.push(record)

    // Save progress after every asset (resume-safe)
    manifest.assets = records
    await saveManifest(manifest)

    // 1.5s between requests to stay under rate limits
    await new Promise(r => setTimeout(r, 1500))
  }

  // Embed to ChromaDB (best-effort)
  console.log('\n  Embedding to ChromaDB...')
  await embedAssetsToChroma(records.map(r => ({ ...r, chromaEmbedded: false })))
    .catch(() => console.log(chalk.dim('  (ChromaDB not running — skipping)')))

  // Update manifest
  manifest.assets = records
  await saveManifest(manifest)

  // Print learning report
  console.log('\n')
  console.log(generateLearningReport(records))
}

main().catch(err => {
  console.error(chalk.red('\n[Indexer] Fatal:'), err.message)
  process.exit(1)
})
