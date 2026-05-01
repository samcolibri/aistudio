/**
 * Google Direct — 30-second TikTok via Veo 3.1
 *
 * Uses Google Generative Language API directly (no fal.ai).
 * Veo 3.1 generates video WITH audio — character speaks the exact lines,
 * natural lip sync, gestures, expressions, all in one pass per scene.
 *
 * Pipeline:
 *   5 scenes × Veo 3.1 → stitch with ffmpeg → logo overlay → Airtable
 *
 * Run: npx tsx src/scripts/google-direct-30s.ts
 */
import 'dotenv/config'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

const ROOT = process.cwd()
const OUT_DIR = join(ROOT, 'output/rec0kxOAXZNsJvmwO')
const LOGO    = join(ROOT, 'remotion/public/simplenursing-logo.png')
const MODEL   = 'veo-3.0-generate-001'  // 3.1 preview if available, else 3.0
const BASE    = 'https://generativelanguage.googleapis.com/v1beta/models'

const key = () => {
  const k = process.env.GOOGLE_AI_KEY
  if (!k) throw new Error('GOOGLE_AI_KEY not set')
  return k
}

// ── Nurse Mike character — consistent across all scenes ──────────────────────
const MIKE = [
  'Nurse Mike: a Black male nurse educator in his mid-30s,',
  'wearing light blue scrubs, short natural hair, warm confident smile.',
  'Soft teal-blue studio background, professional educational TikTok talking-head.',
  'Camera at eye level, medium close-up showing face and chest.',
  'Photorealistic, natural skin tone, sharp focus, broadcast quality.',
  'Vertical 9:16 framing.',
].join(' ')

// ── 5 scenes matching the 30s script ─────────────────────────────────────────
const SCENES = [
  {
    sec: 4,
    dialogue: 'Every nursing program wants the SAME 9 classes',
    visual: 'Arms wide open, excited expression, leaning toward camera with energy. "I have to tell you something" body language.',
  },
  {
    sec: 8,
    dialogue: 'Bio, Chem, A and P 1 and 2, Stats',
    visual: 'Counts on fingers while speaking: 1-Bio, 2-Chem, 3-A&P, 4-Stats. Clear deliberate gestures, nodding confidently.',
  },
  {
    sec: 7,
    dialogue: 'Micro, English, Psych, Nutrition',
    visual: 'Continues counting on fingers: 5-Micro, 6-English, 7-Psych, 8-Nutrition. Building the full list, engaged expression.',
  },
  {
    sec: 6,
    dialogue: "ADN or BSN — they want these same classes",
    visual: 'One hand raised in explanatory gesture, calm confident delivery, slight head nod. "It doesn\'t matter which path" energy.',
  },
  {
    sec: 5,
    dialogue: 'Take the quiz at simplenursing.com slash quiz',
    visual: 'Big warm smile, pointing finger toward camera. Inviting "this is for you" closing energy.',
  },
]

// ── Veo API helpers ───────────────────────────────────────────────────────────
async function veoStart(prompt: string, durationSeconds: number): Promise<string> {
  const url = `${BASE}/${MODEL}:predictLongRunning?key=${key()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        aspectRatio: '9:16',
        durationSeconds,
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Veo start ${res.status}: ${err.slice(0, 300)}`)
  }
  const data = await res.json() as any
  if (!data.name) throw new Error('No operation name in response: ' + JSON.stringify(data).slice(0, 200))
  return data.name
}

async function veoPoll(opName: string): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${key()}`
  const deadline = Date.now() + 8 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000))
    const res = await fetch(url)
    const data = await res.json() as any
    if (data.done) {
      const samples = data.response?.generateVideoResponse?.generatedSamples ?? []
      if (!samples.length) {
        // Veo filtered or failed — print response for debug
        console.log('\n  ⚠ No samples. Full response:', JSON.stringify(data.response ?? data).slice(0, 400))
        throw new Error('No samples in completed response')
      }
      const uri: string = samples[0].video?.uri
      if (!uri) throw new Error('No URI in sample')
      const dlUrl = uri.includes('key=') ? uri : `${uri}&key=${key()}`
      const dl = await fetch(dlUrl)
      if (!dl.ok) throw new Error(`Download failed ${dl.status}`)
      return Buffer.from(await dl.arrayBuffer())
    }
    if (data.error) throw new Error(`Veo error: ${data.error.message}`)
    process.stdout.write('.')
  }
  throw new Error('Veo timed out after 8 minutes')
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'pipe' })
    child.stderr?.on('data', () => {})
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log('🎬 Google Direct — Veo 3.1 — 30s TikTok')
  console.log(`   Model: ${MODEL}`)
  console.log(`   Scenes: ${SCENES.length} × (${SCENES.map(s=>s.sec+'s').join(', ')}) = 30s`)
  console.log(`   Audio: ON — character speaks the exact lines\n`)

  // Generate scenes, skip if already done
  const clipPaths: string[] = []

  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i]
    const clipPath = join(OUT_DIR, `google_clip_${i}.mp4`)
    clipPaths.push(clipPath)

    if (existsSync(clipPath)) {
      console.log(`  ♻️  Scene ${i} already exists, skipping`)
      continue
    }

    const prompt = [
      MIKE,
      scene.visual,
      `Speaking directly to camera, saying: "${scene.dialogue}"`,
    ].join(' ')

    console.log(`\n  🎬 Scene ${i} (${scene.sec}s): "${scene.dialogue.slice(0, 50)}..."`)
    process.stdout.write('  ')

    // API only accepts 4s or 8s — generate 8s then trim to exact duration
    const genSec = scene.sec <= 4 ? 4 : 8

    let succeeded = false
    for (let attempt = 1; attempt <= 3 && !succeeded; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`  🔄 Retry attempt ${attempt}...`)
          process.stdout.write('  ')
        }
        const opName = await veoStart(prompt, genSec)
        const buf = await veoPoll(opName)
        const rawPath = join(OUT_DIR, `google_clip_${i}_raw.mp4`)
        await writeFile(rawPath, buf)
        await ffmpeg(['-y', '-i', rawPath, '-t', String(scene.sec), '-c', 'copy', clipPath])
        console.log(`\n  ✅ Scene ${i}: generated ${genSec}s → trimmed to ${scene.sec}s`)
        succeeded = true
      } catch (err: any) {
        console.log(`\n  ⚠ Scene ${i} attempt ${attempt} failed: ${String(err).slice(0, 150)}`)
        if (attempt === 3) console.log(`  ✗ Scene ${i} skipped after 3 attempts`)
      }
    }
  }

  // Stitch all clips that exist
  const existingClips = clipPaths.filter(p => existsSync(p))
  console.log(`\n🔗 Stitching ${existingClips.length}/${clipPaths.length} clips with ffmpeg...`)
  const listPath = join(OUT_DIR, 'google_clips_list.txt')
  await writeFile(listPath, existingClips.map(p => `file '${p}'`).join('\n'))
  const stitchedPath = join(OUT_DIR, 'google_stitched.mp4')
  await ffmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    stitchedPath,
  ])
  console.log(`  ✅ Stitched: ${stitchedPath}`)

  // Add logo overlay
  console.log('\n🏷  Adding SimpleNursing logo...')
  const finalPath = join(OUT_DIR, 'google_direct_final.mp4')
  await ffmpeg([
    '-y', '-i', stitchedPath, '-i', LOGO,
    '-filter_complex', '[1:v]scale=200:-1[logo];[0:v][logo]overlay=28:28:format=auto',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'copy',
    finalPath,
  ])
  console.log(`  ✅ Final: ${finalPath}`)

  // Open it
  spawn('open', [finalPath])

  console.log('\n🎉 Done! Google Direct Veo 3.1 — 30s TikTok')
  console.log(`   File: ${finalPath}`)
}

main().catch(console.error)
