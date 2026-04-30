// Fish Audio S2 Pro — $15/M chars, best quality for Nurse Mike
// Blind test winner 2026 over ElevenLabs ($165/M)
import fetch from 'node-fetch'

const API_BASE = 'https://api.fish.audio/v1'

function key() {
  const k = process.env.FISH_AUDIO_API_KEY
  if (!k) throw new Error('FISH_AUDIO_API_KEY not set')
  return k
}

// Voice IDs — reference clones trained on actual recordings
export const VOICE_IDS = {
  'nurse-mike':   process.env.FISH_AUDIO_MIKE_ID   ?? 'nurse_mike_v2',
  'nurse-alison': process.env.FISH_AUDIO_ALISON_ID ?? 'nurse_alison_v1',
  'jordan':       process.env.FISH_AUDIO_JORDAN_ID ?? 'jordan_v1',
  'priya':        process.env.FISH_AUDIO_PRIYA_ID  ?? 'priya_v1',
  'aaliyah':      process.env.FISH_AUDIO_AALIYAH_ID ?? 'aaliyah_v1',
  'dana':         process.env.FISH_AUDIO_DANA_ID   ?? 'dana_v1',
} as const

interface TTSOpts {
  text: string
  referenceId: string
  speed?: number       // 0.5–2.0, default 1.0
  format?: 'mp3' | 'wav'
  bitrate?: 128 | 192 | 256
}

interface TTSResult {
  audio: Buffer
  durationSec: number  // estimated from file size
  costUsd: number      // $15/M chars
}

export async function synthesize(opts: TTSOpts): Promise<TTSResult> {
  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: opts.text,
      reference_id: opts.referenceId,
      format: opts.format ?? 'mp3',
      mp3_bitrate: opts.bitrate ?? 128,
      normalize: true,
      latency: 'normal',
      ...(opts.speed && opts.speed !== 1.0 ? { speed: opts.speed } : {}),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Fish Audio error ${res.status}: ${err.slice(0, 400)}`)
  }

  const audio = Buffer.from(await res.arrayBuffer())
  // 128kbps mp3 ≈ 16 KB/s
  const durationSec = Math.round((audio.length / 1024) / 16)
  const costUsd = (opts.text.length / 1_000_000) * 15

  return { audio, durationSec, costUsd }
}

export function estimateCost(text: string): number {
  return (text.length / 1_000_000) * 15
}
