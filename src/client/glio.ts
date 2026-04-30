/**
 * Glio.io — unified API for 111+ AI models
 * API: https://api.glio.io/v1/jobs
 * Auth: Bearer token (GLIO_API_KEY)
 *
 * Async job flow:
 *   POST /v1/jobs       → { id }
 *   GET  /v1/jobs/{id}  → { status, output } (poll until status=completed)
 */
export interface GlioJobInput {
  model: string          // e.g. "flux-pro", "kling-v1", "elevenlabs-tts"
  type: 'image' | 'video' | 'audio' | 'text'
  prompt?: string
  text?: string          // for TTS
  image_url?: string     // for image-to-video
  aspect_ratio?: string
  duration?: number
  [key: string]: any     // model-specific params
}

export async function glioGenerate(input: GlioJobInput): Promise<Buffer> {
  const key = process.env.GLIO_API_KEY
  if (!key) throw new Error('GLIO_API_KEY not set — paste it in Settings')

  // Create job
  const createRes = await fetch('https://api.glio.io/v1/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  if (!createRes.ok) throw new Error(`Glio create job ${createRes.status}: ${await createRes.text()}`)
  const { id } = await createRes.json() as any

  // Poll for completion
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const poll = await fetch(`https://api.glio.io/v1/jobs/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const result = await poll.json() as any
    if (result.status === 'completed') {
      const url = result.output?.url ?? result.output?.image_url ?? result.output?.video_url ?? result.output?.audio_url
      if (!url) throw new Error('Glio: no output URL')
      const res = await fetch(url)
      return Buffer.from(await res.arrayBuffer())
    }
    if (result.status === 'failed') throw new Error(`Glio job failed: ${result.error}`)
  }
  throw new Error('Glio: timed out (10 min)')
}

export async function checkGlio(): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const key = process.env.GLIO_API_KEY
  if (!key) return { ok: false, error: 'Set GLIO_API_KEY in Settings' }
  const res = await fetch('https://api.glio.io/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  }).catch(() => null)
  if (!res?.ok) return { ok: false, error: `HTTP ${res?.status ?? 'unreachable'}` }
  const data = await res.json() as any
  const models = (data.models ?? data.data ?? []).map((m: any) => m.id ?? m.name).slice(0, 10)
  return { ok: true, models }
}
