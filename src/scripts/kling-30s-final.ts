/**
 * Kling Avatar v2 Pro — Full 30-second TikTok
 *
 * Splits the Fish Audio narration into 3 × 10s segments.
 * For each segment: portrait + audio → Kling Avatar v2 Pro → realistic talking head.
 * Stitches 3 clips → 30s video → SimpleNursing logo.
 *
 * Result: real custom Fish Audio voice + real lip sync throughout the full 30s.
 *
 * Run: npx tsx src/scripts/kling-30s-final.ts
 */
import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

const ROOT    = process.cwd()
const OUT_DIR = join(ROOT, 'output/rec0kxOAXZNsJvmwO')
const LOGO    = join(ROOT, 'remotion/public/simplenursing-logo.png')
const IMAGE   = join(ROOT, 'remotion/public/mike_realistic.png')
const AUDIO   = join(OUT_DIR, 'narration_student.mp3')  // female Sarah voice

fal.config({ credentials: process.env.FAL_KEY! })

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'pipe' })
    child.stderr?.on('data', () => {})
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))
  })
}

async function splitAudio(): Promise<string[]> {
  // Split 31.8s into: 0-10s, 10-20s, 20-31.8s
  const segments = [
    { start: 0,  duration: 10,  file: join(OUT_DIR, 'narration_seg_0.mp3') },
    { start: 10, duration: 10,  file: join(OUT_DIR, 'narration_seg_1.mp3') },
    { start: 20, duration: 12,  file: join(OUT_DIR, 'narration_seg_2.mp3') },
  ]
  for (const seg of segments) {
    if (existsSync(seg.file)) continue
    await ffmpeg(['-y', '-i', AUDIO, '-ss', String(seg.start), '-t', String(seg.duration),
      '-c:a', 'libmp3lame', '-q:a', '2', seg.file])
  }
  return segments.map(s => s.file)
}

async function klingAvatar(imageUrl: string, audioPath: string, idx: number): Promise<string> {
  const outPath = join(OUT_DIR, `kling30_clip_${idx}.mp4`)
  if (existsSync(outPath)) {
    console.log(`  ♻️  Segment ${idx} already exists`)
    return outPath
  }

  // Upload audio segment
  console.log(`  📤 Uploading segment ${idx} audio...`)
  const audioBuf = await readFile(audioPath)
  const audioUrl = await fal.storage.upload(new Blob([audioBuf], { type: 'audio/mpeg' }) as any)

  // Submit to Kling Avatar queue
  console.log(`  🎬 Segment ${idx}: Kling Avatar v2 Pro generating...`)
  const { request_id } = await fal.queue.submit('fal-ai/kling-video/ai-avatar/v2/pro', {
    input: {
      image_url: imageUrl,
      audio_url: audioUrl,
      prompt: 'Young nursing student at her study desk, speaking naturally and excitedly to camera, relatable TikTok style delivery, natural head movement and genuine expressions.',
    },
  })

  // Poll (max 8 min)
  const deadline = Date.now() + 8 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000))
    const status = await fal.queue.status('fal-ai/kling-video/ai-avatar/v2/pro', { requestId: request_id, logs: false })
    process.stdout.write('.')
    if (status.status === 'COMPLETED') break
    if (status.status === 'FAILED') throw new Error(`Kling segment ${idx} failed`)
  }
  console.log('')

  const result = await fal.queue.result('fal-ai/kling-video/ai-avatar/v2/pro', { requestId: request_id }) as any
  const url: string = result.video?.url ?? result.data?.video?.url
  if (!url) throw new Error('No URL: ' + JSON.stringify(result).slice(0, 200))

  console.log(`  ⬇️  Downloading segment ${idx}...`)
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  await writeFile(outPath, buf)
  console.log(`  ✅ Segment ${idx}: ${(buf.length/1024/1024).toFixed(1)}MB`)
  return outPath
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log('🎬 Kling Avatar v2 Pro — Full 30s TikTok')
  console.log('   Strategy: 3 × 10s segments with Fish Audio voice → stitch → logo\n')

  // Upload portrait once
  console.log('📤 Uploading portrait image...')
  const imgBuf = await readFile(IMAGE)
  const imageUrl = await fal.storage.upload(new Blob([imgBuf], { type: 'image/png' }) as any)
  console.log(`  ✅ ${imageUrl.slice(0, 60)}...\n`)

  // Split narration into 3 segments
  console.log('✂️  Splitting narration into 3 × 10s segments...')
  const segments = await splitAudio()
  console.log('  ✅ Segments ready\n')

  // Generate 3 Kling Avatar clips
  const clipPaths: string[] = []
  for (let i = 0; i < segments.length; i++) {
    console.log(`\n[${i+1}/3] Segment ${i} (${i === 2 ? '~12s' : '10s'})`)
    const clipPath = await klingAvatar(imageUrl, segments[i], i)
    clipPaths.push(clipPath)
  }

  // Stitch clips
  console.log('\n🔗 Stitching 3 clips into 30s video...')
  const listPath = join(OUT_DIR, 'kling30_list.txt')
  await writeFile(listPath, clipPaths.map(p => `file '${p}'`).join('\n'))
  const stitchedPath = join(OUT_DIR, 'kling30_stitched.mp4')
  await ffmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p',
    stitchedPath,
  ])
  console.log('  ✅ Stitched')

  // Add logo
  console.log('\n🏷  Adding SimpleNursing logo...')
  const finalPath = join(OUT_DIR, 'kling30_final.mp4')
  await ffmpeg(['-y', '-i', stitchedPath, '-i', LOGO,
    '-filter_complex', '[1:v]scale=200:-1[logo];[0:v][logo]overlay=28:28:format=auto',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'copy', finalPath])
  console.log(`  ✅ ${finalPath}`)

  spawn('open', [finalPath])
  console.log('\n🎉 Done! Full 30s — Fish Audio voice + Kling lip sync')
  console.log(`   File: ${finalPath}`)
}

main().catch(console.error)
