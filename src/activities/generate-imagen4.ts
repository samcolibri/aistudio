// Imagen 4 Ultra — for Instagram carousels, Pinterest pins, YouTube thumbnails
import { Context } from '@temporalio/activity'
import { generateImage } from '../client/google-ai.js'
import { ensureDir, writeFile } from '../utils/fs.js'
import path from 'path'

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'

// Brand-aware image prompt builder
function buildImagePrompt(opts: {
  content: string
  channel: 'instagram' | 'pinterest' | 'thumbnail'
  slideIndex?: number
  totalSlides?: number
}): string {
  const brandStyle = 'SimpleNursing brand colors: teal #00709c, light blue #75c7e6, pink #fc3467, dark background. Professional nursing education aesthetic.'

  switch (opts.channel) {
    case 'instagram':
      return [
        `Instagram educational carousel slide ${opts.slideIndex ?? 1} of ${opts.totalSlides ?? 7}.`,
        `Content: "${opts.content.slice(0, 500)}"`,
        'Clean minimal square 1:1 format. Bold readable text overlay.',
        brandStyle,
        'High contrast, mobile-optimized, save-worthy visual.',
      ].join(' ')

    case 'pinterest':
      return [
        `Pinterest educational pin for nursing students.`,
        `"${opts.content.slice(0, 800)}"`,
        'Vertical 2:3 format. Keyword-rich headline, infographic style.',
        brandStyle,
        'Pinterest-optimized visual, high contrast, text-forward layout.',
      ].join(' ')

    case 'thumbnail':
      return [
        `YouTube thumbnail for nursing education video.`,
        `Topic: "${opts.content.slice(0, 200)}"`,
        'High contrast, bold text, professional, 16:9 format.',
        brandStyle,
        'Eye-catching, click-worthy, not clickbait. Clear and educational.',
      ].join(' ')
  }
}

export async function generateInstagramSlidesActivity(input: {
  briefId: string
  contentPreview: string
  title: string
}): Promise<{ localPaths: string[]; costUsd: number }> {
  const { briefId, contentPreview, title } = input
  const logger = Context.current().log

  const slides = splitIntoSlides(contentPreview)
  const dir = path.join(OUTPUT_DIR, briefId, 'instagram')
  await ensureDir(dir)

  logger.info(`[Imagen4] Generating ${slides.length} Instagram slides for ${briefId}`)

  const localPaths: string[] = []
  // Imagen4 cost: ~$0.04 per image for Ultra
  const costPerImage = 0.04

  for (let i = 0; i < slides.length; i++) {
    const prompt = buildImagePrompt({
      content: slides[i],
      channel: 'instagram',
      slideIndex: i + 1,
      totalSlides: slides.length,
    })
    try {
      const buf = await generateImage({ prompt, aspectRatio: '1:1' })
      const localPath = path.join(dir, `slide_${String(i + 1).padStart(2, '0')}.png`)
      await writeFile(localPath, buf)
      localPaths.push(localPath)
      logger.info(`[Imagen4] Slide ${i + 1}/${slides.length} done — ${(buf.length / 1024).toFixed(0)}KB`)
    } catch (err) {
      logger.error(`[Imagen4] Slide ${i + 1} failed`, { err: String(err) })
    }
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 1000))
  }

  return { localPaths, costUsd: localPaths.length * costPerImage }
}

export async function generatePinterestPinActivity(input: {
  briefId: string
  contentPreview: string
  title: string
}): Promise<{ localPath: string; costUsd: number }> {
  const { briefId, contentPreview, title } = input
  const logger = Context.current().log

  const dir = path.join(OUTPUT_DIR, briefId, 'pinterest')
  await ensureDir(dir)

  const prompt = buildImagePrompt({ content: contentPreview, channel: 'pinterest' })
  logger.info(`[Imagen4] Generating Pinterest pin for ${briefId}`)

  const buf = await generateImage({ prompt, aspectRatio: '2:3' })
  const localPath = path.join(dir, 'pin.png')
  await writeFile(localPath, buf)

  return { localPath, costUsd: 0.04 }
}

export async function generateYouTubeThumbnailActivity(input: {
  briefId: string
  title: string
}): Promise<{ localPath: string; costUsd: number }> {
  const { briefId, title } = input
  const logger = Context.current().log

  const dir = path.join(OUTPUT_DIR, briefId)
  await ensureDir(dir)

  const prompt = buildImagePrompt({ content: title, channel: 'thumbnail' })
  const buf = await generateImage({ prompt, aspectRatio: '16:9' })
  const localPath = path.join(dir, 'thumbnail.png')
  await writeFile(localPath, buf)

  return { localPath, costUsd: 0.04 }
}

function splitIntoSlides(content: string): string[] {
  // Try to split by SLIDE markers first (V8 engine sometimes adds these)
  const byMarker = content.split(/\[?SLIDE\s*\d+[^\]]*\]?/i).filter(s => s.trim().length > 20)
  if (byMarker.length >= 3) return byMarker.slice(0, 8).map(s => s.trim())

  // Fall back to paragraph split
  const byPara = content.split(/\n\n+/).filter(s => s.trim().length > 30)
  if (byPara.length >= 2) return byPara.slice(0, 8)

  // Last resort: sentence chunks
  const sentences = content.match(/[^.!?]+[.!?]+/g) ?? [content]
  const slides: string[] = []
  let chunk = ''
  for (const s of sentences) {
    if (chunk.length + s.length > 300 && chunk.length > 0) {
      slides.push(chunk.trim())
      chunk = ''
    }
    chunk += ' ' + s
  }
  if (chunk.trim()) slides.push(chunk.trim())
  return slides.slice(0, 8)
}
