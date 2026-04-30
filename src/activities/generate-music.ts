import { Context } from '@temporalio/activity'
import { generateMusic } from '../client/glio.js'
import { downloadFile, ensureDir } from '../utils/fs.js'
import path from 'path'
import type { GenerateMusicInput, GenerateMusicOutput } from '../types/workflow.js'

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'

export async function generateMusicActivity(input: GenerateMusicInput): Promise<GenerateMusicOutput> {
  const { briefId, prompt } = input
  const logger = Context.current().log

  const dir = path.join(OUTPUT_DIR, briefId)
  await ensureDir(dir)
  const localPath = path.join(dir, 'music.mp3')

  logger.info(`[Music] Suno generation for ${briefId}`, { prompt: prompt.slice(0, 80) })

  const result = await generateMusic({ prompt, instrumental: true })
  await downloadFile(result.url, localPath)

  logger.info(`[Music] Done — $${result.costUsd.toFixed(4)}`)

  return {
    url: result.url,
    localPath,
    costUsd: result.costUsd,
  }
}
