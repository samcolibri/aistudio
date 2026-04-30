import { Context } from '@temporalio/activity'
import { uploadToR2, r2Key } from '../client/r2.js'
import { existsSync } from 'fs'
import path from 'path'

export async function uploadAllOutputsActivity(input: {
  briefId: string
  channel: string
  paths: Array<{ localPath: string; filename: string; contentType: string }>
}): Promise<string[]> {
  const logger = Context.current().log
  const urls: string[] = []

  for (const item of input.paths) {
    if (!existsSync(item.localPath)) {
      logger.warn(`[R2] File not found, skipping: ${item.localPath}`)
      continue
    }
    const key = r2Key(input.briefId, item.filename)
    const url = await uploadToR2({ localPath: item.localPath, key, contentType: item.contentType })
    urls.push(url)
    logger.info(`[R2] Uploaded → ${url}`)
  }

  return urls
}
