/**
 * Talking Head — Kling v2 motion video + sync-lipsync audio sync
 *
 * Per scene pipeline:
 *  1. fal-ai/kling-video/v2/master/image-to-video
 *     → generates realistic 5s video with natural head motion, gestures, expressions
 *  2. fal-ai/sync-lipsync
 *     → syncs audio (per-scene MP3) to the Kling video lips
 *  3. Download result MP4 — ready to embed in Remotion
 *
 * This produces professional-quality talking head video with real motion,
 * not just a static photo with moving lips.
 */
import { fal } from '@fal-ai/client'
import { writeFile, readFile } from 'fs/promises'
import { join } from 'path'

// Shared character prompt — consistent across all scenes
const BASE_PROMPT = [
  'A Black male nurse in his mid-30s wearing light blue scrubs speaking directly to camera.',
  'Natural head movement, confident friendly expression, light hand gestures while explaining.',
  'Soft teal-blue studio background, professional healthcare educator style.',
  'Smooth motion, eye contact with viewer, warm and engaging delivery.',
].join(' ')

const NEGATIVE_PROMPT = 'blur, distort, low quality, jitter, watermark, text, subtitle'

function init() {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not set — add it in Settings')
  fal.config({ credentials: key })
}

// Cache the uploaded image URL so we don't re-upload for every scene
let _uploadedImageUrl: string | null = null

async function uploadImage(imagePath: string): Promise<string> {
  if (_uploadedImageUrl) return _uploadedImageUrl
  const buf = await readFile(imagePath)
  const blob = new Blob([buf], { type: 'image/png' })
  _uploadedImageUrl = await fal.storage.upload(blob as any)
  return _uploadedImageUrl
}

async function retryable<T>(fn: () => Promise<T>, attempts = 3, delayMs = 5000): Promise<T> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try { return await fn() }
    catch (err: any) {
      lastErr = err
      const retryable = err?.status === 500 || err?.status === 429 || String(err).includes('500')
      if (!retryable || i === attempts) throw err
      await new Promise(r => setTimeout(r, delayMs * i))
    }
  }
  throw lastErr
}

/**
 * Step 1: Kling image-to-video — generate realistic motion video from portrait
 */
async function klingMotionVideo(imageUrl: string, scenePose?: string): Promise<string> {
  const prompt = scenePose
    ? `${BASE_PROMPT} ${scenePose}`
    : BASE_PROMPT

  // Use fal.queue directly for long-running Kling jobs (avoids fetch timeout)
  const requestId = await retryable(async () => {
    const { request_id } = await fal.queue.submit('fal-ai/kling-video/v2/master/image-to-video', {
      input: { image_url: imageUrl, prompt, negative_prompt: NEGATIVE_PROMPT, duration: '5', cfg_scale: 0.5 },
    })
    return request_id
  })

  // Poll until done (max 5 minutes)
  const deadline = Date.now() + 5 * 60 * 1000
  let result: any
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000))
    const status = await fal.queue.status('fal-ai/kling-video/v2/master/image-to-video', { requestId, logs: false })
    if (status.status === 'COMPLETED') {
      result = await fal.queue.result('fal-ai/kling-video/v2/master/image-to-video', { requestId })
      break
    }
    if (status.status === 'FAILED') throw new Error('Kling generation failed')
  }
  if (!result) throw new Error('Kling timed out after 5 minutes')

  const url: string = result.video?.url ?? result.data?.video?.url
  if (!url) throw new Error('Kling: no video URL — ' + JSON.stringify(result).slice(0, 200))
  return url
}

/**
 * Step 2: sync-lipsync — apply audio lip sync to the Kling motion video
 */
async function syncLipsync(videoUrl: string, audioPath: string): Promise<Buffer> {
  const audioBuf = await readFile(audioPath)
  const audioBlob = new Blob([audioBuf], { type: 'audio/mpeg' })
  const audioUrl = await fal.storage.upload(audioBlob as any)

  const result = await retryable(() => fal.subscribe('fal-ai/sync-lipsync', {
    input: {
      video_url: videoUrl,
      audio_url: audioUrl,
      model: 'lipsync-1.9.0-beta',
      sync_mode: 'bounce',
      output_format: 'mp4',
    },
    pollInterval: 3000,
    logs: false,
  }) as Promise<any>)

  const url: string = result.video?.url ?? result.data?.video?.url ?? result.output?.video?.url
  if (!url) throw new Error('sync-lipsync: no video URL — ' + JSON.stringify(result).slice(0, 200))

  const res = await fetch(url)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Generate lip-synced talking head clips for all scenes.
 * Runs 2 at a time (Kling is slow, avoid hitting rate limits).
 */
export async function generateSceneTalkingHeads(opts: {
  scenes: Array<{ index: number; audioPath: string | null }>
  characterImagePath: string
  outDir: string
  log: (level: string, msg: string) => void
}): Promise<Record<number, string>> {
  init()
  const results: Record<number, string> = {}
  const { scenes, characterImagePath, outDir, log } = opts
  const validScenes = scenes.filter(s => s.audioPath)

  // Upload the reference image once
  log('info', '  📤 Uploading character reference image...')
  const imageUrl = await uploadImage(characterImagePath)
  log('info', `  ✅ Image URL: ${imageUrl.slice(0, 60)}...`)

  // Process 2 at a time
  for (let i = 0; i < validScenes.length; i += 2) {
    const batch = validScenes.slice(i, i + 2)
    log('info', `  🎬 Batch ${Math.floor(i/2)+1}: scenes [${batch.map(s=>s.index).join(',')}] — Kling + sync-lipsync...`)

    await Promise.all(batch.map(async scene => {
      try {
        // Step 1: Kling motion video (~60-120s per call)
        log('info', `    Scene ${scene.index}: generating motion video (Kling v2)...`)
        const klingVideoUrl = await klingMotionVideo(imageUrl)
        log('info', `    Scene ${scene.index}: Kling done → applying lip sync...`)

        // Step 2: sync-lipsync
        const videoBuf = await syncLipsync(klingVideoUrl, scene.audioPath!)
        const videoPath = join(outDir, `talking_head_${scene.index}.mp4`)
        await writeFile(videoPath, videoBuf)
        results[scene.index] = videoPath
        log('success', `  ✅ Scene ${scene.index}: ${(videoBuf.length/1024/1024).toFixed(1)}MB`)
      } catch (err) {
        log('warn', `  ⚠ Scene ${scene.index} failed: ${String(err).slice(0, 120)}`)
      }
    }))
  }

  return results
}

export async function checkSadTalker(): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.FAL_KEY
  if (!key) return { ok: false, error: 'FAL_KEY not set' }
  return { ok: true }
}
