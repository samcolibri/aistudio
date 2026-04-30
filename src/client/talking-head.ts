/**
 * Talking Head — lip-synced character video via fal.ai SadTalker
 *
 * Takes a portrait image + audio clip → returns MP4 of the character talking
 * with realistic lip sync, head movement, blink.
 *
 * fal-ai/sadtalker docs: https://fal.ai/models/fal-ai/sadtalker
 */
import { fal } from '@fal-ai/client'
import { writeFile } from 'fs/promises'
import { join } from 'path'

// Cache the uploaded image URL so we don't re-upload the same portrait for every scene
const _imageUploadCache = new Map<string, string>()

function init() {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not set — add it in Settings')
  fal.config({ credentials: key })
}

export interface TalkingHeadOpts {
  /** Local path or public HTTPS URL to portrait image (PNG/JPG) */
  imageUrl: string
  /** Local path or public HTTPS URL to audio clip (MP3/WAV) */
  audioUrl: string
  /** 256 or 512 — 512 is higher quality, slower */
  resolution?: 256 | 512
  /** Expression scale 0.5-3.0. Higher = more expressive. Default 1.5 */
  expressionScale?: number
}

export interface TalkingHeadResult {
  videoUrl: string
  videoBuf: Buffer
}

export async function generateTalkingHead(opts: TalkingHeadOpts): Promise<TalkingHeadResult> {
  init()

  let imageUrl = opts.imageUrl
  let audioUrl = opts.audioUrl

  // Upload local files to fal storage using Blob (Node v25 fetch requires Blob, not streams)
  if (!imageUrl.startsWith('http')) {
    if (_imageUploadCache.has(imageUrl)) {
      imageUrl = _imageUploadCache.get(imageUrl)!
    } else {
      const { readFile } = await import('fs/promises')
      const buf = await readFile(imageUrl)
      const blob = new Blob([buf], { type: 'image/png' })
      imageUrl = await fal.storage.upload(blob as any)
      _imageUploadCache.set(opts.imageUrl, imageUrl)
    }
  }
  if (!audioUrl.startsWith('http')) {
    const { readFile } = await import('fs/promises')
    const buf = await readFile(audioUrl)
    const blob = new Blob([buf], { type: 'audio/mpeg' })
    audioUrl = await fal.storage.upload(blob as any)
  }

  const input = {
    source_image_url: imageUrl,
    driven_audio_url: audioUrl,
    face_model_resolution: `${opts.resolution ?? 512}` as '256' | '512',
    expression_scale: opts.expressionScale ?? 1.5,
    face_enhancer: 'gfpgan',
    preprocess: 'crop',
  }

  // Retry up to 3 times on 500 errors (transient fal.ai server failures)
  let lastErr: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await fal.subscribe('fal-ai/sadtalker', {
        input, pollInterval: 3000, logs: false,
      }) as any
      const videoUrl = result.video?.url ?? result.data?.video?.url
      if (!videoUrl) throw new Error('SadTalker: no video URL in response')
      const res = await fetch(videoUrl)
      const videoBuf = Buffer.from(await res.arrayBuffer())
      return { videoUrl, videoBuf }
    } catch (err: any) {
      lastErr = err
      const is500 = err?.status === 500 || err?.message?.includes('500')
      if (!is500 || attempt === 3) throw err
      await new Promise(r => setTimeout(r, 4000 * attempt))
    }
  }
  throw lastErr
}

/**
 * Generate talking head clips for every scene in the manifest.
 * Runs scenes in parallel (up to 3 concurrent fal jobs).
 */
export async function generateSceneTalkingHeads(opts: {
  scenes: Array<{ index: number; audioPath: string | null }>
  characterImagePath: string   // Mike portrait PNG
  outDir: string
  log: (level: string, msg: string) => void
}): Promise<Record<number, string>> {
  const results: Record<number, string> = {}
  const { scenes, characterImagePath, outDir, log } = opts

  const validScenes = scenes.filter(s => s.audioPath)

  // Process 3 at a time to avoid fal rate limits
  for (let i = 0; i < validScenes.length; i += 3) {
    const batch = validScenes.slice(i, i + 3)
    log('info', `  🎭 Talking head batch ${i+1}-${Math.min(i+3, validScenes.length)}/${validScenes.length}...`)

    await Promise.all(batch.map(async (scene) => {
      try {
        const { videoBuf } = await generateTalkingHead({
          imageUrl: characterImagePath,
          audioUrl: scene.audioPath!,
          resolution: 512,
          expressionScale: 1.5,
        })
        const videoPath = join(outDir, `talking_head_${scene.index}.mp4`)
        await writeFile(videoPath, videoBuf)
        results[scene.index] = videoPath
        log('success', `  ✅ Talking head scene ${scene.index}: ${(videoBuf.length/1024/1024).toFixed(1)}MB`)
      } catch (err) {
        log('warn', `  ⚠ Talking head scene ${scene.index} failed: ${String(err).slice(0, 80)}`)
      }
    }))
  }

  return results
}

export async function checkSadTalker(): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.FAL_KEY
  if (!key) return { ok: false, error: 'FAL_KEY not set — add in Settings' }
  return { ok: true }
}
