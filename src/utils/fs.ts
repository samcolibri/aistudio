import { createWriteStream, mkdirSync } from 'fs'
import { mkdir } from 'fs/promises'
import fetch from 'node-fetch'
import path from 'path'

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function downloadFile(url: string, localPath: string): Promise<void> {
  await ensureDir(path.dirname(localPath))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(localPath)
    res.body!.pipe(stream)
    stream.on('finish', resolve)
    stream.on('error', reject)
  })
}
