/**
 * ONE-SHOT: Female student voice + OmniHuman v1.5
 * portrait → female voice → OmniHuman → 30s video with lip sync, all in one
 *
 * Run: npx tsx src/scripts/student-omnihuman.ts
 */
import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'
import fetch from 'node-fetch'

const ROOT    = process.cwd()
const OUT_DIR = join(ROOT, 'output/rec0kxOAXZNsJvmwO')
const IMAGE   = join(ROOT, 'remotion/public/mike_realistic.png')  // student_v2.png
const LOGO    = join(ROOT, 'remotion/public/simplenursing-logo.png')

const FISH_KEY = process.env.FISH_AUDIO_API_KEY!
// Sarah — young female, conversational, narration (verified female)
const FEMALE_VOICE = '933563129e564b19a115bedd57b7406a'

const SCRIPT = [
  'Every nursing program wants the SAME 9 classes.',
  'Biology, Chemistry, Anatomy and Physiology 1 and 2, and Statistics.',
  'Plus Microbiology, English, Psychology, and Nutrition.',
  'Whether you are doing an ADN or a BSN — they all want these same 9 classes.',
  'Take the quiz at simple nursing dot com slash quiz to see exactly where you stand.',
].join(' ')

fal.config({ credentials: process.env.FAL_KEY! })

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'pipe' })
    child.stderr?.on('data', () => {})
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))
  })
}

async function main() {
  console.log('🎬 One-Shot: Student Face + Female Voice + OmniHuman v1.5\n')

  // Step 1: Generate female voice via Fish Audio
  console.log('🎙  Generating female voice (Fish Audio — Alex American Young)...')
  const ttsRes = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FISH_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: SCRIPT,
      reference_id: FEMALE_VOICE,
      format: 'mp3',
      mp3_bitrate: 192,
      normalize: true,
      latency: 'normal',
    }),
  }) as any

  if (!ttsRes.ok) throw new Error(`Fish Audio error ${ttsRes.status}: ${await ttsRes.text()}`)
  const audioBuf = Buffer.from(await ttsRes.arrayBuffer())
  const audioPath = join(OUT_DIR, 'narration_student.mp3')
  await writeFile(audioPath, audioBuf)
  console.log(`  ✅ Female voice: ${audioPath} (${(audioBuf.length/1024).toFixed(0)}KB)`)

  // Play audio preview
  spawn('afplay', [audioPath])

  // Step 2: Upload portrait + audio to fal storage
  console.log('\n📤 Uploading student portrait + female voice to fal...')
  const [imgBuf, audBuf] = await Promise.all([readFile(IMAGE), readFile(audioPath)])
  const [imageUrl, audioUrl] = await Promise.all([
    fal.storage.upload(new Blob([imgBuf], { type: 'image/png' }) as any),
    fal.storage.upload(new Blob([audBuf], { type: 'audio/mpeg' }) as any),
  ])
  console.log('  ✅ Uploaded')

  // Step 3: OmniHuman v1.5 — ONE CALL → full 30s video
  console.log('\n🤖 OmniHuman v1.5 — one call → full 30s lip-synced video...')
  const MODEL = 'fal-ai/bytedance/omnihuman/v1.5'
  const { request_id } = await fal.queue.submit(MODEL, {
    input: { image_url: imageUrl, audio_url: audioUrl, resolution: '720p' },
  })
  console.log(`  Queued: ${request_id}`)

  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000))
    const status = await fal.queue.status(MODEL, { requestId: request_id, logs: false })
    process.stdout.write('.')
    if (status.status === 'COMPLETED') break
    if (status.status === 'FAILED') throw new Error('OmniHuman failed')
  }
  console.log('')

  const result = await fal.queue.result(MODEL, { requestId: request_id }) as any
  const url: string = result.video?.url ?? result.data?.video?.url ?? result.output?.video?.url
  if (!url) throw new Error('No URL: ' + JSON.stringify(result).slice(0, 200))

  console.log('\n⬇️  Downloading...')
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const rawPath = join(OUT_DIR, 'student_omnihuman_raw.mp4')
  await writeFile(rawPath, buf)
  console.log(`  ✅ ${rawPath} (${(buf.length/1024/1024).toFixed(1)}MB)`)

  // Step 4: Add logo
  console.log('\n🏷  Adding SimpleNursing logo...')
  const finalPath = join(OUT_DIR, 'student_omnihuman_final.mp4')
  await ffmpeg(['-y', '-i', rawPath, '-i', LOGO,
    '-filter_complex', '[1:v]scale=200:-1[logo];[0:v][logo]overlay=28:28:format=auto',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'copy', finalPath])

  spawn('open', [finalPath])
  console.log(`\n🎉 Done! Student face + female voice + lip sync — 30s`)
  console.log(`   ${finalPath}`)
}

main().catch(console.error)
