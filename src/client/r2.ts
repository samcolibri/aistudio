import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import path from 'path'

const R2_BUCKET = process.env.R2_BUCKET ?? 'simplenursing-aistudio'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? 'https://studio.simplenursing.dev'

function getClient(): S3Client {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
  }
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export async function uploadToR2(opts: {
  localPath: string
  key: string
  contentType: 'video/mp4' | 'image/jpeg' | 'image/png'
}): Promise<{ url: string; key: string }> {
  const client = getClient()
  const stats = await stat(opts.localPath)
  const stream = createReadStream(opts.localPath)

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: opts.key,
    Body: stream,
    ContentType: opts.contentType,
    ContentLength: stats.size,
    CacheControl: 'public, max-age=31536000',
  }))

  return {
    url: `${R2_PUBLIC_URL}/${opts.key}`,
    key: opts.key,
  }
}

export function buildKey(briefId: string, filename: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${date}/${briefId}/${filename}`
}
