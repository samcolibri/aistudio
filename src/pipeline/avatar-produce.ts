/**
 * Avatar Video Producer — One-Pass Audio-Driven Portrait Animation
 *
 * Takes mike_realistic.png + narration.mp3 and generates a fully realistic
 * talking head video in ONE step — no stitching, no separate lip sync pass.
 *
 * Tries two models in parallel, keeps whichever finishes first:
 *   1. fal-ai/bytedance/omnihuman  — ByteDance, 18K hours training, best emotional consistency
 *   2. fal-ai/kling-video/ai-avatar/v2/pro — Kling Avatar Pro, purpose-built talking head
 *
 * Then overlays the SimpleNursing logo with ffmpeg.
 *
 * Usage: npx tsx src/pipeline/avatar-produce.ts [briefId]
 */
import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

const ROOT = process.cwd()
const LOGO = join(ROOT, 'remotion/public/simplenursing-logo.png')

function init() {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not set')
  fal.config({ credentials: key })
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'pipe' })
    child.stderr?.on('data', () => {})
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
  })
}

async function uploadFiles(imagePath: string, audioPath: string) {
  console.log('📤 Uploading portrait + audio to fal storage...')
  const [imgBuf, audBuf] = await Promise.all([readFile(imagePath), readFile(audioPath)])
  const [imageUrl, audioUrl] = await Promise.all([
    fal.storage.upload(new Blob([imgBuf], { type: 'image/png' }) as any),
    fal.storage.upload(new Blob([audBuf], { type: 'audio/mpeg' }) as any),
  ])
  console.log(`  ✅ Image: ${imageUrl.slice(0, 60)}...`)
  console.log(`  ✅ Audio: ${audioUrl.slice(0, 60)}...`)
  return { imageUrl, audioUrl }
}

async function tryOmniHuman(imageUrl: string, audioUrl: string): Promise<string | null> {
  try {
    console.log('\n🤖 [OmniHuman] ByteDance portrait animation...')
    const result = await fal.subscribe('fal-ai/bytedance/omnihuman', {
      input: {
        image_url: imageUrl,
        audio_url: audioUrl,
      },
      pollInterval: 5000,
      logs: false,
      onQueueUpdate: () => process.stdout.write('.'),
    }) as any
    console.log('')
    const url: string = result.video?.url ?? result.data?.video?.url ?? result.output?.video?.url
    if (!url) throw new Error('No video URL — ' + JSON.stringify(result).slice(0, 200))
    console.log(`  ✅ OmniHuman done: ${url.slice(0, 60)}...`)
    return url
  } catch (err: any) {
    console.log(`\n  ⚠ OmniHuman failed: ${String(err).slice(0, 120)}`)
    return null
  }
}

async function tryKlingAvatar(imageUrl: string, audioUrl: string): Promise<string | null> {
  try {
    console.log('\n🤖 [Kling Avatar v2 Pro] portrait + audio → video...')
    const result = await fal.subscribe('fal-ai/kling-video/ai-avatar/v2/pro', {
      input: {
        image_url: imageUrl,
        audio_url: audioUrl,
        duration: '10',
      },
      pollInterval: 5000,
      logs: false,
      onQueueUpdate: () => process.stdout.write('.'),
    }) as any
    console.log('')
    const url: string = result.video?.url ?? result.data?.video?.url ?? result.output?.video?.url
    if (!url) throw new Error('No video URL — ' + JSON.stringify(result).slice(0, 200))
    console.log(`  ✅ Kling Avatar done: ${url.slice(0, 60)}...`)
    return url
  } catch (err: any) {
    console.log(`\n  ⚠ Kling Avatar failed: ${String(err).slice(0, 120)}`)
    return null
  }
}

async function tryMuseTalk(sourceVideoUrl: string, audioUrl: string): Promise<string | null> {
  try {
    console.log('\n🤖 [MuseTalk v1.5] real-time lip sync on Veo3 video...')
    const result = await fal.subscribe('fal-ai/musetalk', {
      input: {
        source_video_url: sourceVideoUrl,
        audio_url: audioUrl,
      },
      pollInterval: 5000,
      logs: false,
      onQueueUpdate: () => process.stdout.write('.'),
    }) as any
    console.log('')
    const url: string = result.video?.url ?? result.data?.video?.url ?? result.output?.video?.url
    if (!url) throw new Error('No video URL — ' + JSON.stringify(result).slice(0, 200))
    console.log(`  ✅ MuseTalk done: ${url.slice(0, 60)}...`)
    return url
  } catch (err: any) {
    console.log(`\n  ⚠ MuseTalk failed: ${String(err).slice(0, 120)}`)
    return null
  }
}

async function downloadAndSave(url: string, outPath: string): Promise<void> {
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(outPath, buf)
  console.log(`  ✅ Saved: ${outPath} (${(buf.length/1024/1024).toFixed(1)}MB)`)
}

async function addLogo(inputPath: string, outputPath: string): Promise<void> {
  await ffmpeg([
    '-y',
    '-i', inputPath,
    '-i', LOGO,
    '-filter_complex', '[1:v]scale=200:-1[logo];[0:v][logo]overlay=28:28:format=auto',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'copy',
    outputPath,
  ])
  console.log(`  ✅ Logo added: ${outputPath}`)
}

export async function produceAvatarVideo(opts: {
  briefId: string
  imagePath: string
  audioPath: string
  outDir: string
  sourceVideoPath?: string  // for MuseTalk (takes video, not image)
}): Promise<{ omnihuman?: string; kling?: string; musetalk?: string }> {
  init()
  await mkdir(opts.outDir, { recursive: true })

  const { imageUrl, audioUrl } = await uploadFiles(opts.imagePath, opts.audioPath)

  // Upload source video for MuseTalk if provided
  let sourceVideoUrl: string | null = null
  if (opts.sourceVideoPath && existsSync(opts.sourceVideoPath)) {
    console.log('📤 Uploading Veo3 stitched video for MuseTalk...')
    const buf = await readFile(opts.sourceVideoPath)
    sourceVideoUrl = await fal.storage.upload(new Blob([buf], { type: 'video/mp4' }) as any)
    console.log(`  ✅ Video URL: ${sourceVideoUrl.slice(0, 60)}...`)
  }

  // Run all available models in parallel
  console.log('\n🚀 Running OmniHuman + Kling Avatar' + (sourceVideoUrl ? ' + MuseTalk' : '') + ' in parallel...')
  const promises: Promise<string | null>[] = [
    tryOmniHuman(imageUrl, audioUrl),
    tryKlingAvatar(imageUrl, audioUrl),
  ]
  if (sourceVideoUrl) promises.push(tryMuseTalk(sourceVideoUrl, audioUrl))

  const [omniUrl, klingUrl, museTalkUrl = null] = await Promise.all(promises)

  const results: { omnihuman?: string; kling?: string; musetalk?: string } = {}

  if (omniUrl) {
    console.log('\n⬇️  Downloading OmniHuman result...')
    const rawPath = join(opts.outDir, 'omnihuman_raw.mp4')
    await downloadAndSave(omniUrl, rawPath)
    const logoPath = join(opts.outDir, 'omnihuman_logo.mp4')
    await addLogo(rawPath, logoPath)
    results.omnihuman = logoPath
  }

  if (klingUrl) {
    console.log('\n⬇️  Downloading Kling Avatar result...')
    const rawPath = join(opts.outDir, 'kling_avatar_raw.mp4')
    await downloadAndSave(klingUrl, rawPath)
    const logoPath = join(opts.outDir, 'kling_avatar_logo.mp4')
    await addLogo(rawPath, logoPath)
    results.kling = logoPath
  }

  if (museTalkUrl) {
    console.log('\n⬇️  Downloading MuseTalk result...')
    const rawPath = join(opts.outDir, 'musetalk_raw.mp4')
    await downloadAndSave(museTalkUrl, rawPath)
    const logoPath = join(opts.outDir, 'musetalk_logo.mp4')
    await addLogo(rawPath, logoPath)
    results.musetalk = logoPath
  }

  return results
}

// CLI entrypoint
if (process.argv[1]?.includes('avatar-produce')) {
  const briefId = process.argv[2] ?? 'rec0kxOAXZNsJvmwO'
  const outDir = join(ROOT, 'output', briefId)

  const imagePath = existsSync(join(ROOT, 'remotion/public/mike_realistic.png'))
    ? join(ROOT, 'remotion/public/mike_realistic.png')
    : join(ROOT, 'remotion/public/mike_svg_4.png')

  const audioPath = join(outDir, 'narration.mp3')
  if (!existsSync(audioPath)) {
    console.error(`Missing narration.mp3 at ${audioPath}`)
    process.exit(1)
  }

  // Pass Veo3 stitched video for MuseTalk (lip sync on real motion)
  const sourceVideoPath = join(outDir, 'veo3_stitched.mp4')

  console.log('\n🎬 Avatar Video Producer — One-Pass Audio-Driven Animation')
  console.log(`   Portrait:     ${imagePath}`)
  console.log(`   Audio:        ${audioPath}`)
  console.log(`   Source video: ${sourceVideoPath}`)
  console.log(`   Models:       OmniHuman (ByteDance) + Kling Avatar v2 Pro + MuseTalk (on Veo3)\n`)

  const results = await produceAvatarVideo({ briefId, imagePath, audioPath, outDir, sourceVideoPath })

  console.log('\n\n🎉 Done! Results:')
  if (results.omnihuman) console.log(`  OmniHuman:   ${results.omnihuman}`)
  if (results.kling)     console.log(`  Kling Avatar: ${results.kling}`)
  if (results.musetalk)  console.log(`  MuseTalk:     ${results.musetalk}`)
  if (!results.omnihuman && !results.kling && !results.musetalk) {
    console.log('  ⚠ All models failed — check FAL_KEY and model availability')
  }
}
