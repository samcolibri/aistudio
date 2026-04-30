// Glio.io unified AI API client — TypeScript port of astudio/src/glio.js
import fetch from 'node-fetch'

const BASE = 'https://api.glio.io'
const POLL_INTERVAL_MS = 12_000
const MAX_POLLS = 75  // ~15 min max per job

function headers(): Record<string, string> {
  const key = process.env.GLIO_API_KEY
  if (!key) throw new Error('GLIO_API_KEY not set')
  return { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function retry<T>(fn: () => Promise<T>, attempts: number, delayMs: number): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === attempts - 1) throw err
      await sleep(delayMs)
    }
  }
  throw new Error('retry exhausted')
}

export interface GlioResult {
  url: string
  urls: string[]
  duration?: number
  costUsd: number
  modelSlug: string
}

async function createJob(model: string, params: Record<string, unknown>): Promise<string> {
  return retry(async () => {
    const res = await fetch(`${BASE}/v1/jobs`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model, params }),
    })
    const data = await res.json() as any
    if (!res.ok) throw new Error(`Glio createJob [${model}] ${res.status}: ${data.error || data.detail || JSON.stringify(data)}`)
    if (!data.id) throw new Error(`Glio createJob [${model}] no id returned`)
    return data.id as string
  }, 3, 3000)
}

async function pollJob(
  jobId: string,
  onTick?: (status: string, tick: number, costUsd?: number) => void
): Promise<GlioResult> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS)
    let data: any
    try {
      const res = await fetch(`${BASE}/v1/jobs/${jobId}`, { headers: headers() })
      if (res.status === 429) { await sleep(30_000); continue }
      if (!res.ok) throw new Error(`poll ${res.status}`)
      data = await res.json()
    } catch {
      onTick?.('network-retry', i)
      continue
    }

    onTick?.(data.status, i, data.cost_usd)

    if (data.status === 'completed') {
      const fr = data.final_result || {}
      const url: string = fr.url || (Array.isArray(fr.urls) && fr.urls[0])
      if (!url) throw new Error(`Job ${jobId} completed but no url: ${JSON.stringify(fr)}`)
      return {
        url,
        urls: fr.urls || [url],
        duration: fr.duration,
        costUsd: Number(data.cost_usd || 0),
        modelSlug: data.model_slug || '',
      }
    }
    if (data.status === 'failed') {
      throw new Error(`Job ${jobId} failed: ${JSON.stringify(data.final_result || data)}`)
    }
  }
  throw new Error(`Job ${jobId} timed out after ${((MAX_POLLS * POLL_INTERVAL_MS) / 60000).toFixed(0)} min`)
}

export async function generate(
  model: string,
  params: Record<string, unknown>,
  onTick?: (status: string, tick: number, costUsd?: number) => void
): Promise<GlioResult> {
  const jobId = await createJob(model, params)
  return pollJob(jobId, onTick)
}

// ── Typed wrappers per model ──────────────────────────────────────────────────

export async function generateImage(opts: {
  prompt: string
  aspectRatio?: '3:4' | '16:9' | '9:16' | '1:1' | '2:3'
  resolution?: '1K' | '2K' | '4K'
}): Promise<GlioResult> {
  return generate('flux-2-pro-t2i', {
    prompt: opts.prompt,
    aspect_ratio: opts.aspectRatio ?? '3:4',
    resolution: opts.resolution ?? '1K',
  })
}

export async function generateVoiceElevenLabs(opts: {
  text: string
  voice?: string
  stability?: number
  similarityBoost?: number
  speed?: number
}): Promise<GlioResult> {
  return generate('elevenlabs-tts-multilingual', {
    prompt: opts.text,
    voice: opts.voice ?? 'Rachel',
    stability: opts.stability ?? 0.5,
    similarity_boost: opts.similarityBoost ?? 0.75,
    style: 0.1,
    speed: opts.speed ?? 1.0,
  })
}

export async function generateLipSync(opts: {
  imageUrl: string
  audioUrl: string
  visualPrompt?: string
  durationSec?: number
}): Promise<GlioResult> {
  return generate('kling-avatar-pro', {
    image_url: opts.imageUrl,
    audio_url: opts.audioUrl,
    prompt: opts.visualPrompt ?? '',
    duration: Math.min(opts.durationSec ?? 10, 12),
  })
}

export async function generateMusic(opts: {
  prompt: string
  instrumental?: boolean
}): Promise<GlioResult> {
  return generate('suno', {
    prompt: opts.prompt,
    instrumental: opts.instrumental ?? true,
    variant: 'V4_5',
  })
}
