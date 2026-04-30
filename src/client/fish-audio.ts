// Fish Audio S2 Pro — $15/M chars, best quality for Nurse Mike
// Custom voice: acad7d8ab15243fcbc94559940918e36 (cloned from Sam's video 2026-04-30)
import fetch from 'node-fetch'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const API_BASE = 'https://api.fish.audio/v1'

function key() {
  const k = process.env.FISH_AUDIO_API_KEY
  if (!k) throw new Error('FISH_AUDIO_API_KEY not set')
  return k
}

// Voice IDs — Fish Audio model IDs (verified working 2026-04-30)
// PRIMARY: Sam's custom voice cloned from video — use this for ALL SimpleNursing content
export const VOICE_IDS = {
  'nurse-mike':   process.env.FISH_AUDIO_MIKE_ID   ?? 'acad7d8ab15243fcbc94559940918e36', // SAM'S CUSTOM VOICE — cloned from video
  'nurse-alison': process.env.FISH_AUDIO_ALISON_ID ?? '91635604486d4968939f2ae967c9fa2d', // USA Male Common (educational)
  'jordan':       process.env.FISH_AUDIO_JORDAN_ID ?? 'b86c46f504b54aec91cb489b05f3cb45', // Arthur - Energetic Narrator
  'priya':        process.env.FISH_AUDIO_PRIYA_ID  ?? 'e686ae649ee44f219a108aacba206c1a', // Calm Storyteller
  'aaliyah':      process.env.FISH_AUDIO_AALIYAH_ID ?? '078eaa5208ca42a1909d2e6fac9c93f7', // Alex American Young
  'dana':         process.env.FISH_AUDIO_DANA_ID   ?? '7d4e8a6444a442eb819c69981fdb8315', // Tech Male
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
  durationSec: number
  costUsd: number
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
      mp3_bitrate: opts.bitrate ?? 192,
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
  const durationSec = Math.round((audio.length / 1024) / 24)  // 192kbps ≈ 24KB/s
  const costUsd = (opts.text.length / 1_000_000) * 15

  return { audio, durationSec, costUsd }
}

/**
 * Synthesize per-scene audio clips — one MP3 per scene.
 * Used to feed into SadTalker for per-scene talking head generation.
 */
export async function synthesizeScenes(
  scenes: Array<{ index: number; text: string }>,
  personaId: string,
  outDir: string,
): Promise<Record<number, string>> {
  const voiceId = VOICE_IDS[personaId as keyof typeof VOICE_IDS] ?? VOICE_IDS['nurse-mike']
  const results: Record<number, string> = {}

  // Sequential with small delay to avoid Fish Audio 429 rate limiting
  for (const scene of scenes) {
    if (!scene.text.trim()) continue
    try {
      const result = await synthesize({
        text: scene.text.slice(0, 500),
        referenceId: voiceId,
        format: 'mp3',
        bitrate: 192,
      })
      const audioPath = join(outDir, `scene_audio_${scene.index}.mp3`)
      await writeFile(audioPath, result.audio)
      results[scene.index] = audioPath
    } catch (err) {
      console.warn(`Scene ${scene.index} audio failed: ${err}`)
    }
    await new Promise(r => setTimeout(r, 800)) // 800ms between calls
  }

  return results
}

export function estimateCost(text: string): number {
  return (text.length / 1_000_000) * 15
}
