// Google AI client — Veo 3 video + Imagen 4 Ultra image generation
// TypeScript port of nova-gtm/generate_final.py + generate_mike_veo3.py
import fetch from 'node-fetch'

const GOOGLE_KEY = () => {
  const k = process.env.GOOGLE_AI_KEY
  if (!k) throw new Error('GOOGLE_AI_KEY not set')
  return k
}

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
export const VEO_MODEL    = 'veo-3.0-generate-001'
export const IMAGEN_MODEL = 'imagen-4.0-ultra-generate-001'

// ── Nurse Mike character description — used consistently across ALL Veo3 prompts ──
export const MIKE_CHARACTER = [
  'Nurse Mike: a Black male nurse in his mid-30s, wearing light blue scrubs,',
  'short natural hair, warm confident smile, clean simple background with soft',
  'teal-blue studio lighting. Professional educational YouTube talking-head style.',
  'Camera is at eye level, medium close-up framing showing face and chest.',
  'Natural realistic skin, sharp focus, cinematic quality.',
].join(' ')

// ── Veo 3 (video) ──────────────────────────────────────────────────────────────

interface VeoStartOpts {
  prompt: string
  aspectRatio: '16:9' | '9:16'
  durationSeconds?: number
}

export async function veoStart(opts: VeoStartOpts): Promise<string> {
  const url = `${GOOGLE_BASE}/${VEO_MODEL}:predictLongRunning?key=${GOOGLE_KEY()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt }],
      parameters: {
        aspectRatio: opts.aspectRatio,
        durationSeconds: opts.durationSeconds ?? 8,
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Veo3 start error ${res.status}: ${err.slice(0, 400)}`)
  }
  const data = await res.json() as any
  const opName: string = data.name
  if (!opName) throw new Error('Veo3 returned no operation name')
  return opName
}

export async function veoPoll(opName: string, maxWaitMs = 360_000): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${GOOGLE_KEY()}`
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await sleep(8000)
    const res = await fetch(url)
    const data = await res.json() as any
    if (data.done) {
      const samples = data.response?.generateVideoResponse?.generatedSamples ?? []
      if (samples.length === 0) throw new Error('Veo3 completed but no samples returned')
      const uri: string = samples[0].video?.uri
      if (!uri) throw new Error('Veo3 sample has no uri')
      const dlUrl = uri.includes('key=') ? uri : `${uri}&key=${GOOGLE_KEY()}`
      const dl = await fetch(dlUrl)
      if (!dl.ok) throw new Error(`Veo3 download error ${dl.status}`)
      return Buffer.from(await dl.arrayBuffer())
    }
    if (data.error) throw new Error(`Veo3 error: ${data.error.message}`)
  }
  throw new Error(`Veo3 timed out after ${maxWaitMs / 1000}s`)
}

export async function generateVideo(opts: VeoStartOpts): Promise<Buffer> {
  const op = await veoStart(opts)
  return veoPoll(op)
}

// ── Imagen 4 Ultra (image) ─────────────────────────────────────────────────────

interface ImagenOpts {
  prompt: string
  aspectRatio: '1:1' | '3:4' | '16:9' | '9:16' | '2:3'
}

export async function generateImage(opts: ImagenOpts): Promise<Buffer> {
  const url = `${GOOGLE_BASE}/${IMAGEN_MODEL}:predict?key=${GOOGLE_KEY()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: opts.aspectRatio,
        outputMimeType: 'image/png',
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Imagen4 error ${res.status}: ${err.slice(0, 300)}`)
  }
  const data = await res.json() as any
  const preds = data.predictions ?? []
  if (preds.length === 0) throw new Error('Imagen4: no predictions returned')
  const b64: string = preds[0].bytesBase64Encoded
  if (!b64) throw new Error('Imagen4: no base64 data in response')
  return Buffer.from(b64, 'base64')
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
