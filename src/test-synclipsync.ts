import 'dotenv/config'
import { join } from 'path'
import { mkdir, copyFile, readFile, writeFile } from 'fs/promises'
import { spawn } from 'child_process'
import { generateSceneTalkingHeads } from './client/talking-head.js'

const ROOT = process.cwd()
const BRIEF_ID = 'rec0kxOAXZNsJvmwO'
const OUT_DIR = join(ROOT, 'output', BRIEF_ID)
const CHARACTER = join(ROOT, 'remotion/public/mike_realistic.png')

const log = (level: string, msg: string) => {
  const c: Record<string, string> = { info: '\x1b[36m', success: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' }
  console.log(`${c[level] ?? ''}[${level.toUpperCase()}]\x1b[0m ${msg}`)
}

const scenes = [0, 1, 2, 3, 4].map(i => ({ index: i, audioPath: join(OUT_DIR, `scene_audio_${i}.mp3`) }))

log('info', 'Generating all 5 scenes: Kling v2 motion + sync-lipsync...')
log('info', '(~2min per scene × 5 scenes running 2 at a time = ~5-7min total)')

const results = await generateSceneTalkingHeads({ scenes, characterImagePath: CHARACTER, outDir: OUT_DIR, log: log as any })
log('success', `Generated ${Object.keys(results).length}/5 scenes`)

// Stage all to remotion/public
const thPublic = join(ROOT, 'remotion/public/talking-heads', BRIEF_ID)
await mkdir(thPublic, { recursive: true })
for (const [idx, srcPath] of Object.entries(results)) {
  await copyFile(srcPath, join(thPublic, `scene_${idx}.mp4`))
}

// Update asset map
const assetMap = JSON.parse(await readFile(join(OUT_DIR, 'asset-map.json'), 'utf8'))
const talkingHeadVideos: Record<number, string> = {}
for (const idx of Object.keys(results)) {
  talkingHeadVideos[Number(idx)] = `talking-heads/${BRIEF_ID}/scene_${idx}.mp4`
}
assetMap.assets.talkingHeadVideos = talkingHeadVideos
await writeFile(join(OUT_DIR, 'asset-map.json'), JSON.stringify(assetMap, null, 2))

// Render final video
const outPath = join(OUT_DIR, 'tiktok_final_kling.mp4')
log('info', `\nRendering final TikTok with Kling motion + logo → ${outPath}`)

await new Promise<void>((resolve, reject) => {
  const child = spawn('node', [
    'node_modules/@remotion/cli/remotion-cli.js',
    'render', 'remotion/src/Root.tsx', 'NurseForgeProductionTikTok',
    '--output', outPath, '--props', JSON.stringify(assetMap),
  ], { cwd: ROOT, env: process.env, stdio: 'pipe' })
  child.stderr?.on('data', (d: Buffer) => {
    const l = d.toString().trim()
    if (l.includes('900') || l.includes('Done') || l.includes('error') || l.includes('Error')) log('info', `  ${l}`)
  })
  child.on('close', code => code === 0 ? resolve() : reject(new Error(`Remotion exited ${code}`)))
})

log('success', `\n✅ Done! Open: ${outPath}`)
