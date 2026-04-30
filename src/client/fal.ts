/**
 * fal.ai client — access to 100+ AI models via one API
 * Install: npm install @fal-ai/client
 * Env: FAL_KEY
 *
 * Key models:
 *  Images: fal-ai/flux-pro/v1.1-ultra
 *  Video:  fal-ai/kling-video/v2/standard/text-to-video
 *          fal-ai/veo3           (Google Veo3 via fal)
 *          fal-ai/seedance-1.0/text-to-video
 *  Speech: fal-ai/minimax-speech (MiniMax)
 *          fal-ai/chatterbox/text-to-speech
 */
import { fal } from '@fal-ai/client'

function init() {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not set')
  fal.config({ credentials: key })
}

// ── Image generation ──────────────────────────────────────────────────────────
export async function generateFalImage(opts: {
  prompt: string
  model?: string
  aspectRatio?: '1:1' | '2:3' | '9:16' | '16:9' | '4:5'
}): Promise<Buffer> {
  init()
  const model = opts.model ?? 'fal-ai/flux-pro/v1.1-ultra'
  const result = await fal.subscribe(model, {
    input: {
      prompt: opts.prompt,
      aspect_ratio: opts.aspectRatio ?? '2:3',
      output_format: 'png',
      num_images: 1,
    },
  }) as any
  const imageUrl = result.images?.[0]?.url ?? result.data?.images?.[0]?.url
  if (!imageUrl) throw new Error(`fal.ai: no image URL in response`)
  const res = await fetch(imageUrl)
  return Buffer.from(await res.arrayBuffer())
}

// ── Video generation ──────────────────────────────────────────────────────────
export async function generateFalVideo(opts: {
  prompt: string
  model?: string
  aspectRatio?: '9:16' | '16:9' | '1:1'
  duration?: 5 | 10
  imageUrl?: string  // for image-to-video (e.g. Kling with reference frame)
}): Promise<Buffer> {
  init()
  const model = opts.model ?? 'fal-ai/kling-video/v2/standard/text-to-video'
  const input: Record<string, any> = {
    prompt: opts.prompt,
    aspect_ratio: opts.aspectRatio ?? '9:16',
    duration: opts.duration ?? 5,
  }
  if (opts.imageUrl) input.image_url = opts.imageUrl

  const result = await fal.subscribe(model, { input }) as any
  const videoUrl = result.video?.url ?? result.data?.video?.url ?? result.videos?.[0]?.url
  if (!videoUrl) throw new Error(`fal.ai: no video URL in response`)
  const res = await fetch(videoUrl)
  return Buffer.from(await res.arrayBuffer())
}

// ── Speech synthesis ──────────────────────────────────────────────────────────
export async function generateFalSpeech(opts: {
  text: string
  model?: string
  voiceId?: string
}): Promise<Buffer> {
  init()
  const model = opts.model ?? 'fal-ai/minimax-speech'
  const result = await fal.subscribe(model, {
    input: {
      text: opts.text,
      voice_id: opts.voiceId ?? 'Friendly_Person',
    },
  }) as any
  const audioUrl = result.audio?.url ?? result.data?.audio?.url
  if (!audioUrl) throw new Error(`fal.ai: no audio URL in response`)
  const res = await fetch(audioUrl)
  return Buffer.from(await res.arrayBuffer())
}

// ── Image-to-video with character reference ───────────────────────────────────
// Use this to feed Nurse Mike's character to Kling for consistent appearance
export async function characterToVideo(opts: {
  characterImagePath: string  // local path to Mike SVG/PNG
  prompt: string
  aspectRatio?: '9:16' | '16:9'
}): Promise<Buffer> {
  init()
  // Upload the character image to fal storage first
  const { createReadStream } = await import('fs')
  const imageFile = createReadStream(opts.characterImagePath)
  const uploaded = await fal.storage.upload(imageFile as any)

  return generateFalVideo({
    model: 'fal-ai/kling-video/v2/standard/image-to-video',
    prompt: opts.prompt,
    aspectRatio: opts.aspectRatio ?? '9:16',
    imageUrl: uploaded,
  })
}
