import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'

const OUT = join(process.cwd(), 'output/rec0kxOAXZNsJvmwO')
const LOGO = join(process.cwd(), 'remotion/public/simplenursing-logo.png')

fal.config({ credentials: process.env.FAL_KEY! })

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'pipe' })
    child.stderr?.on('data', () => {})
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))
  })
}

async function main() {
  console.log('📤 Uploading portrait + audio...')
  const [imgBuf, audBuf] = await Promise.all([
    readFile(join(process.cwd(), 'remotion/public/mike_realistic.png')),
    readFile(join(OUT, 'narration.mp3')),
  ])
  const [imageUrl, audioUrl] = await Promise.all([
    fal.storage.upload(new Blob([imgBuf], { type: 'image/png' }) as any),
    fal.storage.upload(new Blob([audBuf], { type: 'audio/mpeg' }) as any),
  ])
  console.log('  ✅ Uploaded')

  // v1.5 model ID + 720p to handle 31.8s audio (720p supports up to 60s)
  // Use queue pattern to avoid fetch timeout on long jobs
  console.log('\n🤖 OmniHuman v1.5 (720p, up to 60s audio)...')
  const MODEL = 'fal-ai/bytedance/omnihuman/v1.5'
  const { request_id } = await fal.queue.submit(MODEL, {
    input: { image_url: imageUrl, audio_url: audioUrl, resolution: '720p' },
  })
  console.log(`  Queued: ${request_id}`)

  const deadline = Date.now() + 10 * 60 * 1000
  let status: any
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000))
    status = await fal.queue.status(MODEL, { requestId: request_id, logs: false })
    process.stdout.write('.')
    if (status.status === 'COMPLETED') break
    if (status.status === 'FAILED') throw new Error('OmniHuman job failed')
  }
  if (status?.status !== 'COMPLETED') throw new Error('OmniHuman timed out')
  console.log('')

  const res2 = await fal.queue.result(MODEL, { requestId: request_id }) as any
  const url: string = res2.video?.url ?? res2.data?.video?.url ?? res2.output?.video?.url
  if (!url) throw new Error('No URL: ' + JSON.stringify(res2).slice(0, 300))
  console.log(`  ✅ ${url.slice(0, 60)}...`)

  console.log('⬇️  Downloading...')
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const raw = join(OUT, 'omnihuman_raw.mp4')
  await writeFile(raw, buf)
  console.log(`  ✅ ${raw} (${(buf.length/1024/1024).toFixed(1)}MB)`)

  console.log('🏷  Adding SimpleNursing logo...')
  const out = join(OUT, 'omnihuman_logo.mp4')
  await ffmpeg(['-y', '-i', raw, '-i', LOGO,
    '-filter_complex', '[1:v]scale=200:-1[logo];[0:v][logo]overlay=28:28:format=auto',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'copy', out])
  console.log(`  ✅ ${out}`)
  console.log('\n🎉 OmniHuman done!')
}

main().catch(console.error)
