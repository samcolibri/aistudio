// FFmpeg composer — stitches Veo3 clips + overlays Remotion branding + mixes voice
import { Context } from '@temporalio/activity'
import ffmpegStatic from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'
import { existsSync } from 'fs'
import { ensureDir } from '../utils/fs.js'
import path from 'path'

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic)

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'

export interface ComposeInput {
  briefId: string
  channel: 'youtube' | 'tiktok'
  veo3ClipPaths: string[]       // raw Veo3 clips to stitch
  remotionBrandingPath?: string  // optional Remotion MP4 overlay
  narrationPath?: string         // Fish Audio narration to mix in
  aspectRatio: '16:9' | '9:16'
}

export interface ComposeOutput {
  localPath: string
  durationSec: number
}

export async function composeVideoActivity(input: ComposeInput): Promise<ComposeOutput> {
  const { briefId, channel, veo3ClipPaths, remotionBrandingPath, narrationPath, aspectRatio } = input
  const logger = Context.current().log

  const dir = path.join(OUTPUT_DIR, briefId, 'final')
  await ensureDir(dir)

  const validClips = veo3ClipPaths.filter(p => existsSync(p))
  if (validClips.length === 0) throw new Error(`No valid Veo3 clips for ${briefId}`)

  logger.info(`[Compose] Stitching ${validClips.length} Veo3 clips`, { channel })

  // Step 1: Stitch Veo3 clips
  const stitchedPath = path.join(dir, 'stitched.mp4')
  const durationSec = await concatClips(validClips, stitchedPath, dir)

  let workingPath = stitchedPath

  // Step 2: Overlay Remotion branding if available (alpha blend)
  if (remotionBrandingPath && existsSync(remotionBrandingPath)) {
    logger.info(`[Compose] Overlaying Remotion branding`)
    const brandedPath = path.join(dir, 'branded.mp4')
    await overlayBranding(workingPath, remotionBrandingPath, brandedPath)
    workingPath = brandedPath
  }

  // Step 3: Mix in voice narration
  if (narrationPath && existsSync(narrationPath)) {
    logger.info(`[Compose] Mixing Fish Audio narration`)
    const withVoicePath = path.join(dir, 'with_voice.mp4')
    await mixNarration(workingPath, narrationPath, withVoicePath)
    workingPath = withVoicePath
  }

  // Step 4: Final output — ensure correct aspect ratio
  const finalPath = path.join(dir, `${channel}_final.mp4`)
  await normalizeAspect(workingPath, finalPath, aspectRatio)

  logger.info(`[Compose] Done — ${durationSec}s → ${finalPath}`)
  return { localPath: finalPath, durationSec }
}

function concatClips(clips: string[], outputPath: string, tmpDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = ffmpeg()
    clips.forEach(c => proc.addInput(c))
    proc
      .on('error', reject)
      .on('end', () => {
        ffmpeg.ffprobe(outputPath, (err, meta) => {
          resolve(err ? clips.length * 8 : Math.round(meta.format.duration ?? 0))
        })
      })
      .mergeToFile(outputPath, tmpDir)
  })
}

// Remotion overlay as a subtitle/branding layer (alpha composite)
function overlayBranding(videoPath: string, brandingPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .addInput(videoPath)
      .addInput(brandingPath)
      .complexFilter([
        // Scale branding to match video dimensions, then overlay with alpha blend
        '[1:v]scale=iw:ih,format=rgba,colorchannelmixer=aa=0.85[brand]',
        '[0:v][brand]overlay=0:0:shortest=1[v]',
      ])
      .outputOptions(['-map [v]', '-map 0:a?', '-c:v libx264', '-c:a aac', '-shortest'])
      .output(outputPath)
      .on('error', reject)
      .on('end', resolve)
      .run()
  })
}

// Mix voice narration: narration at 100%, ambient background at 10%
function mixNarration(videoPath: string, narrationPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .addInput(videoPath)
      .addInput(narrationPath)
      .complexFilter([
        // If video has original audio (Veo3 native audio), keep at 10% as ambient
        '[0:a]volume=0.10[ambient]',
        '[1:a]volume=1.0[narration]',
        '[ambient][narration]amix=inputs=2:duration=first:dropout_transition=1[aout]',
      ])
      .outputOptions(['-map 0:v', '-map [aout]', '-c:v copy', '-c:a aac', '-shortest'])
      .output(outputPath)
      .on('error', reject)
      .on('end', resolve)
      .run()
  })
}

function normalizeAspect(inputPath: string, outputPath: string, ratio: '16:9' | '9:16'): Promise<void> {
  const { w, h } = ratio === '16:9' ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 }
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilter(`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`)
      .outputOptions(['-c:a copy'])
      .output(outputPath)
      .on('error', reject)
      .on('end', resolve)
      .run()
  })
}
