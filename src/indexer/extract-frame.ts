import { createWriteStream } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import ffmpegStatic from 'ffmpeg-static'
import Ffmpeg from 'fluent-ffmpeg'

if (ffmpegStatic) Ffmpeg.setFfmpegPath(ffmpegStatic)

export async function extractFrameBase64(videoPath: string): Promise<string> {
  const tmp = join(tmpdir(), `frame_${Date.now()}.png`)
  await new Promise<void>((resolve, reject) => {
    Ffmpeg(videoPath)
      .seekInput(1)          // 1 second in (skip black frame at 0)
      .frames(1)
      .output(tmp)
      .outputOptions(['-vf', 'scale=640:-1'])  // 640px wide, keep AR
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
  const { readFile, unlink } = await import('fs/promises')
  const buf = await readFile(tmp)
  await unlink(tmp).catch(() => {})
  return buf.toString('base64')
}

export async function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number; durationSec: number }> {
  return new Promise((resolve, reject) => {
    Ffmpeg.ffprobe(videoPath, (err, meta) => {
      if (err) return reject(err)
      const vs = meta.streams.find(s => s.codec_type === 'video')
      resolve({
        width: vs?.width ?? 0,
        height: vs?.height ?? 0,
        durationSec: parseFloat(String(meta.format.duration ?? '0')),
      })
    })
  })
}
