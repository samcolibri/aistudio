/**
 * OmniHuman + MuseTalk one-pass run
 * Run: npx tsx src/scripts/run-omnihuman.ts
 */
import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

const ROOT = process.cwd()
const OUT_DIR = join(ROOT, 'output/rec0kxOAXZNsJvmwO')
const LOGO = join(ROOT, 'remotion/public/simplenursing-logo.png')

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'pipe' })
    child.stderr?.on('data', () => {})
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
  })
}

async function addLogo(input: string, output: string) {
  await ffmpeg(['-y', '-i', input, '-i', LOGO,
    '-filter_complex', '[1:v]scale=200:-1[logo];[0:v][logo]overlay=28:28:format=auto',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'copy', output])
  console.log(`  ✅ Logo added → ${output}`)
}

async function run() {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not set')
  fal.config({ credentials: key })

  // Upload files
  console.log('📤 Uploading portrait, audio, Veo3 video...')
  const [imgBuf, audBuf, vidBuf] = await Promise.all([
    readFile(join(ROOT, 'remotion/public/mike_realistic.png')),
    readFile(join(OUT_DIR, 'narration.mp3')),
    readFile(join(OUT_DIR, 'veo3_stitched.mp4')),
  ])
  const [imageUrl, audioUrl, videoUrl] = await Promise.all([
    fal.storage.upload(new Blob([imgBuf], { type: 'image/png' }) as any),
    fal.storage.upload(new Blob([audBuf], { type: 'audio/mpeg' }) as any),
    fal.storage.upload(new Blob([vidBuf], { type: 'video/mp4' }) as any),
  ])
  console.log('  ✅ All uploaded')

  // Run OmniHuman + MuseTalk in parallel
  console.log('\n🚀 OmniHuman (ByteDance) + MuseTalk in parallel...')

  const [omniResult, museResult] = await Promise.allSettled([
    // OmniHuman — portrait image + audio → full video
    fal.subscribe('fal-ai/bytedance/omnihuman', {
      input: { image_url: imageUrl, audio_url: audioUrl },
      pollInterval: 5000, logs: false,
      onQueueUpdate: () => process.stdout.write('O'),
    }),
    // MuseTalk — apply lip sync to Veo3 motion video
    fal.subscribe('fal-ai/musetalk', {
      input: { source_video_url: videoUrl, audio_url: audioUrl },
      pollInterval: 5000, logs: false,
      onQueueUpdate: () => process.stdout.write('M'),
    }),
  ])
  console.log('')

  if (omniResult.status === 'fulfilled') {
    const r = omniResult.value as any
    const url: string = r.video?.url ?? r.data?.video?.url ?? r.output?.video?.url
    if (url) {
      console.log('\n⬇️  OmniHuman done, downloading...')
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      const raw = join(OUT_DIR, 'omnihuman_raw.mp4')
      await writeFile(raw, buf)
      console.log(`  ✅ ${raw} (${(buf.length/1024/1024).toFixed(1)}MB)`)
      await addLogo(raw, join(OUT_DIR, 'omnihuman_logo.mp4'))
    }
  } else {
    console.log(`\n  ⚠ OmniHuman failed: ${String(omniResult.reason).slice(0, 120)}`)
  }

  if (museResult.status === 'fulfilled') {
    const r = museResult.value as any
    const url: string = r.video?.url ?? r.data?.video?.url ?? r.output?.video?.url
    if (url) {
      console.log('\n⬇️  MuseTalk done, downloading...')
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      const raw = join(OUT_DIR, 'musetalk_raw.mp4')
      await writeFile(raw, buf)
      console.log(`  ✅ ${raw} (${(buf.length/1024/1024).toFixed(1)}MB)`)
      await addLogo(raw, join(OUT_DIR, 'musetalk_logo.mp4'))
    }
  } else {
    console.log(`\n  ⚠ MuseTalk failed: ${String(museResult.reason).slice(0, 120)}`)
  }

  console.log('\n🎉 Done!')
}

run().catch(console.error)
