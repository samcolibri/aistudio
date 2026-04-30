// Fish Audio S2 Pro voice synthesis — Nurse Mike narration
import { Context } from '@temporalio/activity'
import { synthesize, VOICE_IDS } from '../client/fish-audio.js'
import { getPersona } from '../personas/index.js'
import { ensureDir, writeFile } from '../utils/fs.js'
import { splitIntoVoiceChunks } from '../utils/text.js'
import path from 'path'
import type { PersonaId } from '../types/brief.js'

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'

export interface GenerateVoiceInput {
  briefId: string
  personaId: PersonaId
  script: string
  channel: 'youtube' | 'tiktok'
}

export interface GenerateVoiceOutput {
  narrationPath: string    // full narration as single mp3
  chunkPaths: string[]     // individual chunks for lip-sync pairing
  durationSec: number
  costUsd: number
}

export async function generateVoiceActivity(input: GenerateVoiceInput): Promise<GenerateVoiceOutput> {
  const { briefId, personaId, script, channel } = input
  const logger = Context.current().log
  const persona = getPersona(personaId)

  // TikTok: slightly faster pacing
  const speed = channel === 'tiktok' ? 1.1 : 1.0

  const dir = path.join(OUTPUT_DIR, briefId, 'voice')
  await ensureDir(dir)

  logger.info(`[Voice] Fish Audio — ${briefId}`, {
    persona: persona.name, chars: script.length, channel,
  })

  // Generate full narration as one file
  const result = await synthesize({
    text: script,
    referenceId: persona.voiceId,
    speed,
    format: 'mp3',
    bitrate: 128,
  })

  const narrationPath = path.join(dir, 'narration.mp3')
  await writeFile(narrationPath, result.audio)

  // Also split into chunks for scene-by-scene Veo3 pairing
  // (chunks align with splitIntoVeoScenes output)
  const chunks = splitIntoVoiceChunks(script)
  const chunkPaths: string[] = []
  let totalDuration = result.durationSec

  if (chunks.length > 1) {
    for (let i = 0; i < chunks.length; i++) {
      const chunkResult = await synthesize({
        text: chunks[i],
        referenceId: persona.voiceId,
        speed,
      })
      const chunkPath = path.join(dir, `chunk_${String(i + 1).padStart(2, '0')}.mp3`)
      await writeFile(chunkPath, chunkResult.audio)
      chunkPaths.push(chunkPath)
    }
  } else {
    chunkPaths.push(narrationPath)
  }

  logger.info(`[Voice] Done — ${result.durationSec}s, $${result.costUsd.toFixed(4)}`)

  return {
    narrationPath,
    chunkPaths,
    durationSec: result.durationSec,
    costUsd: result.costUsd,
  }
}
