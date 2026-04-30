// Remotion renderer — renders brand-styled React compositions to MP4
// Uses the existing NurseMikeYouTube.tsx, TikTok.tsx, Instagram.tsx, Pinterest.tsx
// compositions copied from nova-gtm/remotion/
import { Context } from '@temporalio/activity'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import path from 'path'
import { ensureDir } from '../utils/fs.js'
import type { ContentBrief } from '../types/brief.js'

const OUTPUT_DIR  = process.env.OUTPUT_DIR ?? './output'
const REMOTION_DIR = path.join(process.cwd(), 'remotion')

// Composition IDs matching remotion/src/Root.tsx
const COMPOSITION_MAP: Record<string, string> = {
  'youtube':   'NurseMikeYouTube',
  'tiktok':    'NursingVideoTikTok',
  'instagram': 'Instagram',
  'pinterest': 'Pinterest',
}

export interface RenderRemotionInput {
  briefId: string
  brief: Pick<ContentBrief, 'title' | 'hook' | 'channel' | 'contentPreview' | 'keyword'>
  voiceAudioPath?: string   // path to Fish Audio narration — overlaid on render
}

export interface RenderRemotionOutput {
  localPath: string
  durationSec: number
}

// Build props matching what each Remotion composition expects
function buildCompositionProps(brief: RenderRemotionInput['brief']): Record<string, unknown> {
  const sentences = brief.contentPreview
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15)

  const beats = groupIntoBeat(sentences)

  return {
    hookLine:   brief.hook || brief.title,
    hookSubline: `Keyword: ${brief.keyword}`,
    beats,
    ctaLine:    'simplenursing.com/quiz',
    stat:       extractStat(brief.contentPreview) ?? `#1 nursing education platform`,
  }
}

function groupIntoBeat(sentences: string[]): Array<{ label: string; lines: string[] }> {
  const chunkSize = Math.ceil(sentences.length / 3)
  const beats = []
  for (let i = 0; i < sentences.length; i += chunkSize) {
    const chunk = sentences.slice(i, i + chunkSize)
    beats.push({
      label: chunk[0]?.split(' ').slice(0, 4).join(' ').toUpperCase() ?? 'KEY POINT',
      lines: chunk.map(s => s.toUpperCase()),
    })
  }
  return beats.slice(0, 3)
}

function extractStat(text: string): string | null {
  const m = text.match(/\d+[\d,]*%|\d+[\d,]*\s*(out of|million|thousand|students|nurses)/i)
  return m ? m[0] : null
}

export async function renderRemotionActivity(input: RenderRemotionInput): Promise<RenderRemotionOutput> {
  const { briefId, brief } = input
  const logger = Context.current().log

  const compositionId = COMPOSITION_MAP[brief.channel]
  if (!compositionId) throw new Error(`No Remotion composition for channel: ${brief.channel}`)

  const dir = path.join(OUTPUT_DIR, briefId, 'remotion')
  await ensureDir(dir)
  const outputPath = path.join(dir, `${brief.channel}_branded.mp4`)

  logger.info(`[Remotion] Rendering ${compositionId} for ${briefId}`)

  // Bundle the Remotion project
  const bundleDir = await bundle({
    entryPoint: path.join(REMOTION_DIR, 'src', 'Root.tsx'),
    onProgress: (p) => {
      if (p % 25 === 0) logger.info(`[Remotion] Bundle ${p}%`)
    },
  })

  const inputProps = buildCompositionProps(brief)

  const composition = await selectComposition({
    serveUrl: bundleDir,
    id: compositionId,
    inputProps,
  })

  await renderMedia({
    composition,
    serveUrl: bundleDir,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100)
      if (pct % 10 === 0) logger.info(`[Remotion] Render ${pct}%`)
    },
  })

  const durationSec = Math.round(composition.durationInFrames / composition.fps)
  logger.info(`[Remotion] Done — ${durationSec}s at ${outputPath}`)

  return { localPath: outputPath, durationSec }
}
