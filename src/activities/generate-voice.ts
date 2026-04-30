import { Context } from '@temporalio/activity'
import fetch from 'node-fetch'
import fs from 'fs/promises'
import path from 'path'
import { generateVoiceElevenLabs } from '../client/glio.js'
import { getPersona } from '../personas/index.js'
import { downloadFile, ensureDir } from '../utils/fs.js'
import { splitIntoSceneChunks } from '../utils/text.js'
import type { GenerateVoiceInput, GenerateVoiceOutput } from '../types/workflow.js'

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'
const FISH_AUDIO_KEY = process.env.FISH_AUDIO_API_KEY

async function synthesizeWithFishAudio(opts: {
  text: string
  referenceId: string
}): Promise<{ buffer: Buffer; durationSec: number }> {
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FISH_AUDIO_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: opts.text,
      reference_id: opts.referenceId,
      format: 'mp3',
      mp3_bitrate: 128,
      normalize: true,
      latency: 'normal',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Fish Audio error ${res.status}: ${err}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  // Estimate duration from file size (128kbps mp3 ≈ 16KB/s)
  const durationSec = Math.round((buffer.length / 1024) / 16)
  return { buffer, durationSec }
}

export async function generateVoiceActivity(input: GenerateVoiceInput): Promise<GenerateVoiceOutput> {
  const { briefId, text, voiceId, channel } = input
  const logger = Context.current().log

  const dir = path.join(OUTPUT_DIR, briefId, 'voice')
  await ensureDir(dir)
  const localPath = path.join(dir, 'narration.mp3')

  let durationSec = 0
  let costUsd = 0

  if (FISH_AUDIO_KEY) {
    // Fish Audio S2 Pro — $15/M chars, best quality for Nurse Mike
    logger.info(`[Voice] Fish Audio synthesis for ${briefId}`, { chars: text.length, channel })
    const { buffer, durationSec: dur } = await synthesizeWithFishAudio({
      text,
      referenceId: voiceId,
    })
    await fs.writeFile(localPath, buffer)
    durationSec = dur
    costUsd = (text.length / 1_000_000) * 15
    logger.info(`[Voice] Fish Audio done — ${durationSec}s, $${costUsd.toFixed(4)}`)
  } else {
    // ElevenLabs via Glio as fallback
    logger.info(`[Voice] ElevenLabs (Glio) synthesis for ${briefId}`, { chars: text.length })
    const result = await generateVoiceElevenLabs({
      text,
      voice: voiceId,
      stability: 0.5,
      similarityBoost: 0.75,
      speed: input.speed ?? 1.0,
    })
    await downloadFile(result.url, localPath)
    durationSec = result.duration ?? Math.round(text.length / 16)
    costUsd = result.costUsd
    logger.info(`[Voice] ElevenLabs done — $${costUsd.toFixed(4)}`)
  }

  return {
    url: `file://${localPath}`,
    localPath,
    durationSec,
    costUsd,
  }
}

export { splitIntoSceneChunks }
