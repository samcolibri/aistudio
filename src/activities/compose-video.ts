import { Context } from '@temporalio/activity'
import ffmpegStatic from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'
import { createWriteStream, existsSync } from 'fs'
import { ensureDir } from '../utils/fs.js'
import path from 'path'
import type { ComposeVideoInput, ComposeVideoOutput } from '../types/workflow.js'

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic)

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'

const ASPECT_SETTINGS = {
  '16:9': { width: 1920, height: 1080, scale: 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2' },
  '9:16': { width: 1080, height: 1920, scale: 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2' },
}

function concat(clips: string[], outputPath: string, tmpDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = ffmpeg()
    clips.forEach(c => proc.addInput(c))
    proc
      .on('error', reject)
      .on('end', () => {
        // Get duration
        ffmpeg.ffprobe(outputPath, (err, meta) => {
          resolve(err ? 0 : Math.round(meta.format.duration ?? 0))
        })
      })
      .mergeToFile(outputPath, tmpDir)
  })
}

function mixAudio(videoPath: string, musicPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .addInput(videoPath)
      .addInput(musicPath)
      .complexFilter([
        '[1:a]volume=0.15[bg]',  // music at 15% volume
        '[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]',
      ])
      .outputOptions(['-map 0:v', '-map [aout]', '-c:v copy', '-shortest', '-c:a aac'])
      .output(outputPath)
      .on('error', reject)
      .on('end', resolve)
      .run()
  })
}

export async function composeVideoActivity(input: ComposeVideoInput): Promise<ComposeVideoOutput> {
  const { briefId, channel, clipPaths, musicPath, aspectRatio } = input
  const logger = Context.current().log

  const dir = path.join(OUTPUT_DIR, briefId, 'final')
  await ensureDir(dir)

  const existing = clipPaths.filter(p => existsSync(p))
  if (existing.length === 0) throw new Error(`No valid clips found for ${briefId}`)

  logger.info(`[Compose] Assembling ${existing.length} clips for ${briefId}`, { aspectRatio, channel })

  const concatPath = path.join(dir, 'concat.mp4')
  const durationSec = await concat(existing, concatPath, dir)

  let finalPath = concatPath

  if (musicPath && existsSync(musicPath)) {
    finalPath = path.join(dir, 'final.mp4')
    await mixAudio(concatPath, musicPath, finalPath)
    logger.info(`[Compose] Music mixed in`)
  }

  logger.info(`[Compose] Done — ${durationSec}s`)

  return { localPath: finalPath, durationSec }
}
