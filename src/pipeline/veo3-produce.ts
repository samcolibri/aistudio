/**
 * Veo3 Full-Video Producer
 *
 * Divides the 30-second script into 4 × 8-second clips,
 * generates each with fal-ai/veo3 (9:16, 1080p),
 * stitches them with ffmpeg, replaces audio with Fish Audio narration,
 * and adds the SimpleNursing logo overlay via Remotion.
 *
 * Usage: npx tsx src/pipeline/veo3-produce.ts [briefId]
 */
import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

const ROOT = process.cwd()

const MIKE = [
  'A Black male nurse educator in his mid-30s, light blue scrubs,',
  'speaking confidently and warmly directly to camera. Short natural hair,',
  'clean-shaven. Soft teal-blue studio background. Professional healthcare',
  'educator TikTok style. 9:16 vertical. High quality, cinematic.',
].join(' ')

// Scene-specific visual directions layered on top of the character description
const SCENE_PROMPTS = [
  // 0-8s — Hook
  `${MIKE} Arms wide open, excited expression, mouth open mid-sentence, leaning slightly toward camera. Energetic "I have to tell you something" moment.`,
  // 8-16s — First list (Bio, Chem, A&P, Stats)
  `${MIKE} Counting on fingers while talking, nodding confidently, looking straight at viewer. Explaining a list with clear deliberate gestures.`,
  // 16-24s — Second list + ADN/BSN
  `${MIKE} One hand raised in an explanatory gesture, calm confident expression, slight head nod. Breaking down two options clearly.`,
  // 24-30s — CTA
  `${MIKE} Big warm smile, pointing finger toward camera/viewer, inviting gesture. "This is for you" body language, closing statement energy.`,
]

function init() {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not set')
  fal.config({ credentials: key })
}

async function generateVeo3Clip(prompt: string, index: number, outDir: string): Promise<string> {
  const outPath = join(outDir, `veo3_clip_${index}.mp4`)
  if (existsSync(outPath)) {
    console.log(`  ♻️  Clip ${index} already exists, skipping`)
    return outPath
  }

  console.log(`  🎬 Generating Veo3 clip ${index}...`)

  // Use fal.queue for long-running jobs
  const { request_id } = await fal.queue.submit('fal-ai/veo3', {
    input: {
      prompt,
      duration: '8s',
      aspect_ratio: '9:16',
      resolution: '1080p',
      generate_audio: false, // we add our own Fish Audio narration
    },
  })

  // Poll until done (max 8 minutes per clip)
  const deadline = Date.now() + 8 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10000))
    const status = await fal.queue.status('fal-ai/veo3', { requestId: request_id, logs: false })
    if ((status as any).status === 'COMPLETED') break
    if ((status as any).status === 'FAILED') throw new Error(`Veo3 clip ${index} failed`)
    process.stdout.write('.')
  }
  console.log('')

  const result = await fal.queue.result('fal-ai/veo3', { requestId: request_id }) as any
  const videoUrl: string = result.video?.url ?? result.data?.video?.url
  if (!videoUrl) throw new Error(`Veo3 clip ${index}: no URL in result`)

  console.log(`  ✅ Clip ${index} generated — downloading...`)
  const res = await fetch(videoUrl)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(outPath, buf)
  console.log(`  ✅ Clip ${index}: ${(buf.length/1024/1024).toFixed(1)}MB`)
  return outPath
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'pipe' })
    child.stderr?.on('data', () => {}) // suppress output
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
  })
}

async function stitchClips(clipPaths: string[], outPath: string, targetSec: number): Promise<void> {
  // Write concat list
  const listPath = outPath.replace('.mp4', '_list.txt')
  await writeFile(listPath, clipPaths.map(p => `file '${p}'`).join('\n'))

  // Concat + trim to exact duration
  await ffmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-t', String(targetSec),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-an',
    outPath,
  ])
}

async function mergeAudio(videoPath: string, audioPath: string, outPath: string): Promise<void> {
  await ffmpeg([
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    outPath,
  ])
}

export async function produceVeo3Video(opts: {
  briefId: string
  narrationPath: string
  totalSec: number
  outDir: string
}): Promise<string> {
  init()
  await mkdir(opts.outDir, { recursive: true })

  console.log('\n🎬 Generating Veo3 clips (fal-ai/veo3, 9:16, 1080p)...')
  console.log(`   4 clips × 8s = 32s → trimmed to ${opts.totalSec}s`)
  console.log('   Audio: disabled on Veo3 — Fish Audio narration added after\n')

  // Generate all 4 clips in sequence (Veo3 is heavy, avoid concurrent rate limits)
  const clipPaths: string[] = []
  for (let i = 0; i < SCENE_PROMPTS.length; i++) {
    const path = await generateVeo3Clip(SCENE_PROMPTS[i], i, opts.outDir)
    clipPaths.push(path)
  }

  console.log('\n🔗 Stitching clips with ffmpeg...')
  const stitchedPath = join(opts.outDir, 'veo3_stitched.mp4')
  await stitchClips(clipPaths, stitchedPath, opts.totalSec)
  console.log(`  ✅ Stitched: ${opts.totalSec}s video`)

  console.log('\n🎙 Merging Fish Audio narration...')
  const finalPath = join(opts.outDir, 'veo3_final.mp4')
  await mergeAudio(stitchedPath, opts.narrationPath, finalPath)
  console.log(`  ✅ Final: ${finalPath}`)

  return finalPath
}

// CLI entrypoint
if (process.argv[1]?.includes('veo3-produce')) {
  const briefId = process.argv[2] ?? 'rec0kxOAXZNsJvmwO'
  const outDir = join(ROOT, 'output', briefId)
  const narrationPath = join(outDir, 'narration.mp3')

  const manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'))
  const totalSec: number = manifest.totalDurationSec ?? 30

  const finalPath = await produceVeo3Video({ briefId, narrationPath, totalSec, outDir })

  console.log(`\n🎉 Done! Open: ${finalPath}`)
}
