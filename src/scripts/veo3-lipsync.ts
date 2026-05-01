/**
 * Apply sync-lipsync to the Veo3 stitched video using Fish Audio narration.
 * Produces: veo3_lipsync_logo.mp4 (synced mouth + SimpleNursing logo)
 *
 * Run: npx tsx src/scripts/veo3-lipsync.ts
 */
import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'

const ROOT = process.cwd()
const BRIEF_ID = 'rec0kxOAXZNsJvmwO'
const OUT_DIR = join(ROOT, 'output', BRIEF_ID)
const LOGO = join(ROOT, 'remotion/public/simplenursing-logo.png')

const log = (msg: string) => console.log(msg)

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'pipe' })
    child.stderr?.on('data', () => {})
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
  })
}

async function main() {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not set')
  fal.config({ credentials: key })

  const videoPath = join(OUT_DIR, 'veo3_stitched.mp4')
  const audioPath = join(OUT_DIR, 'narration.mp3')

  log('\n📤 Uploading Veo3 stitched video to fal storage...')
  const videoBuf = await readFile(videoPath)
  const videoBlob = new Blob([videoBuf], { type: 'video/mp4' })
  const videoUrl = await fal.storage.upload(videoBlob as any)
  log(`  ✅ Video URL: ${videoUrl.slice(0, 60)}...`)

  log('📤 Uploading narration audio...')
  const audioBuf = await readFile(audioPath)
  const audioBlob = new Blob([audioBuf], { type: 'audio/mpeg' })
  const audioUrl = await fal.storage.upload(audioBlob as any)
  log(`  ✅ Audio URL: ${audioUrl.slice(0, 60)}...`)

  log('\n🎙 Running sync-lipsync on full 30s Veo3 video...')
  log('   (This may take 2-3 minutes for a 30s 1080p video)')

  const result = await fal.subscribe('fal-ai/sync-lipsync', {
    input: {
      video_url: videoUrl,
      audio_url: audioUrl,
      model: 'lipsync-1.9.0-beta',
      sync_mode: 'bounce',
      output_format: 'mp4',
    },
    pollInterval: 5000,
    logs: false,
    onQueueUpdate: (update: any) => {
      if (update.status) process.stdout.write('.')
    },
  }) as any
  console.log('')

  const url: string = result.video?.url ?? result.data?.video?.url ?? result.output?.video?.url
  if (!url) throw new Error('sync-lipsync: no URL — ' + JSON.stringify(result).slice(0, 300))
  log(`  ✅ Lip-synced video URL: ${url.slice(0, 60)}...`)

  log('\n⬇️  Downloading lip-synced video...')
  const res = await fetch(url)
  const syncedBuf = Buffer.from(await res.arrayBuffer())
  const syncedPath = join(OUT_DIR, 'veo3_synced.mp4')
  await writeFile(syncedPath, syncedBuf)
  log(`  ✅ Saved: ${syncedPath} (${(syncedBuf.length/1024/1024).toFixed(1)}MB)`)

  log('\n🏷  Adding SimpleNursing logo overlay...')
  const finalPath = join(OUT_DIR, 'veo3_lipsync_logo.mp4')
  await ffmpeg([
    '-y',
    '-i', syncedPath,
    '-i', LOGO,
    '-filter_complex', '[1:v]scale=200:-1[logo];[0:v][logo]overlay=28:28:format=auto',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'copy',
    finalPath,
  ])
  log(`  ✅ Final with logo: ${finalPath}`)

  log('\n🎉 Done! Veo3 + lip-sync + logo ready.')
  log(`   Open: ${finalPath}`)
}

main().catch(console.error)
