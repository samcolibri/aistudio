// Veo 3 activity — generates photorealistic video clips via Google AI
// Each clip = 8 seconds max. Full videos = multiple clips stitched by compose-video
import { Context } from '@temporalio/activity'
import { generateVideo } from '../client/google-ai.js'
import { ensureDir, writeFile } from '../utils/fs.js'
import { splitIntoVeoScenes } from '../utils/text.js'
import path from 'path'
import type { PersonaId } from '../types/brief.js'
import { getPersona } from '../personas/index.js'
import { getStyleContext } from '../indexer/query-assets.js'

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'

// Build a Veo3 prompt enriched with style context from indexed assets
async function buildVeo3Prompt(opts: {
  character: string
  dialogue: string
  channel: string
  topic?: string
}): Promise<string> {
  const gestureHints = inferGesture(opts.dialogue)

  // Load learned style context from asset library (non-blocking — defaults gracefully)
  let styleNote = ''
  try {
    const ctx = await getStyleContext({ channel: opts.channel, topic: opts.topic })
    if (ctx.topAssets.length > 0) {
      styleNote = ctx.veo3StyleGuide
    }
  } catch { /* manifest not built yet — use defaults */ }

  return [
    opts.character,
    `He/she speaks directly to camera:`,
    `"${opts.dialogue}"`,
    gestureHints,
    opts.channel === 'tiktok'
      ? 'High energy, fast TikTok-native delivery, vertical 9:16 framing.'
      : 'Conversational YouTube teaching style, horizontal 16:9 framing.',
    styleNote ? `Style reference: ${styleNote.slice(0, 200)}` : '',
    'Photorealistic, broadcast quality, natural skin, sharp focus.',
  ].filter(Boolean).join(' ')
}

function inferGesture(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('first') || t.includes('second') || t.includes('third') || /\d/.test(t)) {
    return 'Counts on fingers as they list items.'
  }
  if (t.includes('important') || t.includes('critical') || t.includes('must')) {
    return 'Points authoritatively at camera for emphasis.'
  }
  if (t.includes('quiz') || t.includes('link') || t.includes('simplenursing')) {
    return 'Points finger guns at camera warmly, smiling.'
  }
  if (t.includes('listen') || t.includes('nobody') || t.includes('wish')) {
    return 'Leans slightly forward toward camera.'
  }
  return 'Expressive face, confident natural delivery.'
}

export interface Veo3ClipInput {
  briefId: string
  personaId: PersonaId
  sceneId: string
  dialogue: string
  channel: 'youtube' | 'tiktok'
}

export interface Veo3ClipOutput {
  sceneId: string
  localPath: string
  durationSec: number
}

export async function generateVeo3ClipActivity(input: Veo3ClipInput): Promise<Veo3ClipOutput> {
  const { briefId, personaId, sceneId, dialogue, channel } = input
  const logger = Context.current().log
  const persona = getPersona(personaId)
  const aspectRatio = channel === 'tiktok' ? '9:16' : '16:9'

  const prompt = await buildVeo3Prompt({
    character: persona.veo3Description,
    dialogue,
    channel,
  })

  logger.info(`[Veo3] Generating clip ${sceneId} for ${briefId}`, {
    chars: dialogue.length,
    aspect: aspectRatio,
  })

  const dir = path.join(OUTPUT_DIR, briefId, 'veo3')
  await ensureDir(dir)
  const localPath = path.join(dir, `clip_${sceneId}.mp4`)

  const video = await generateVideo({ prompt, aspectRatio, durationSeconds: 8 })
  await writeFile(localPath, video)

  logger.info(`[Veo3] Clip ${sceneId} done — ${(video.length / 1024).toFixed(0)}KB`)

  return { sceneId, localPath, durationSec: 8 }
}

// Convenience: split full script into scene clips for a brief
export async function generateAllVeo3ClipsActivity(input: {
  briefId: string
  personaId: PersonaId
  script: string
  channel: 'youtube' | 'tiktok'
}): Promise<Veo3ClipOutput[]> {
  const { briefId, personaId, script, channel } = input
  const logger = Context.current().log
  const scenes = splitIntoVeoScenes(script)
  logger.info(`[Veo3] Generating ${scenes.length} clips for ${briefId}`)

  const results: Veo3ClipOutput[] = []
  for (let i = 0; i < scenes.length; i++) {
    const sceneId = String(i + 1).padStart(2, '0')
    try {
      const clip = await generateVeo3ClipActivity({ briefId, personaId, sceneId, dialogue: scenes[i], channel })
      results.push(clip)
    } catch (err) {
      logger.error(`[Veo3] Clip ${sceneId} failed — skipping`, { err: String(err) })
    }
  }
  return results
}
