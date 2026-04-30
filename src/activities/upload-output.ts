import { Context } from '@temporalio/activity'
import { uploadToR2, buildKey } from '../client/r2.js'
import type { UploadOutputInput, UploadOutputOutput } from '../types/workflow.js'

export async function uploadOutputActivity(input: UploadOutputInput): Promise<UploadOutputOutput> {
  const { briefId, channel, localPath, contentType } = input
  const logger = Context.current().log

  const ext = contentType === 'video/mp4' ? 'mp4' : contentType === 'image/png' ? 'png' : 'jpg'
  const key = buildKey(briefId, `${channel}_final.${ext}`)

  logger.info(`[Upload] Uploading to R2 — ${key}`)
  const result = await uploadToR2({ localPath, key, contentType })
  logger.info(`[Upload] Done — ${result.url}`)

  return result
}
