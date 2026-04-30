import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'

const BUCKET     = process.env.R2_BUCKET      ?? 'simplenursing-aistudio'
const PUBLIC_URL = process.env.R2_PUBLIC_URL  ?? 'https://studio.simplenursing.dev'

function client(): S3Client {
  const endpoint        = process.env.R2_ENDPOINT
  const accessKeyId     = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured')
  }
  return new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } })
}

export async function uploadToR2(opts: {
  localPath: string
  key: string
  contentType: string
}): Promise<string> {
  const { size } = await stat(opts.localPath)
  await client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: opts.key,
    Body: createReadStream(opts.localPath),
    ContentType: opts.contentType,
    ContentLength: size,
    CacheControl: 'public, max-age=31536000',
  }))
  return `${PUBLIC_URL}/${opts.key}`
}

export function r2Key(briefId: string, filename: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${date}/${briefId}/${filename}`
}
