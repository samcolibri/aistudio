import { Context } from '@temporalio/activity'
import { generateLipSync } from '../client/glio.js'
import { downloadFile, ensureDir } from '../utils/fs.js'
import path from 'path'
import type { GenerateLipSyncInput, GenerateLipSyncOutput } from '../types/workflow.js'

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'
const MAX_KLING_DURATION = 12  // Kling Avatar Pro max per clip

export async function generateLipSyncActivity(input: GenerateLipSyncInput): Promise<GenerateLipSyncOutput> {
  const { briefId, imageUrl, audioUrl, sceneId, durationSec } = input
  const logger = Context.current().log

  const dir = path.join(OUTPUT_DIR, briefId, 'scenes', sceneId)
  await ensureDir(dir)
  const localPath = path.join(dir, 'clip.mp4')

  const clampedDuration = Math.min(durationSec ?? MAX_KLING_DURATION, MAX_KLING_DURATION)

  logger.info(`[LipSync] Kling Avatar Pro — ${briefId}/${sceneId}`, {
    durationSec: clampedDuration,
    imageUrl: imageUrl.slice(0, 60),
  })

  const result = await generateLipSync({
    imageUrl,
    audioUrl,
    visualPrompt: 'character speaking directly to camera, professional, clear face visible',
    durationSec: clampedDuration,
  })

  await downloadFile(result.url, localPath)

  logger.info(`[LipSync] Done — $${result.costUsd.toFixed(4)}`, { sceneId })

  return {
    url: result.url,
    localPath,
    costUsd: result.costUsd,
  }
}
