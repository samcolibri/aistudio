/**
 * Script Analyzer — Claude reads a brief and produces a full production plan
 *
 * Output: ProductionManifest — everything Remotion + pipeline needs to make the video
 *
 * Usage:
 *   const manifest = await analyzeScript(brief)
 *   → manifest.scenes[]   — per-scene: text, timing, mikePose, bgType, diagramCode
 *   → manifest.manimScenes — Manim Python code per diagram scene
 *   → manifest.voice       — full narration text
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ContentBrief } from '../types/brief.js'

const client = new Anthropic()

export type MikePose = 'talking' | 'pointing' | 'open_arms' | 'celebrate' | 'sad' | 'idle'
export type BgType = 'animated_dark' | 'veo3_clip' | 'imagen4_still' | 'manim_fullscreen'

export interface SceneSpec {
  index: number
  startSec: number
  durationSec: number
  text: string              // what Mike says / what caption shows
  mikePose: MikePose        // which of 8 SVG poses to use
  bgType: BgType            // how to generate background
  bgPrompt: string          // prompt for Veo3/Imagen4 if needed
  showDiagram: boolean      // overlay Manim diagram?
  diagramTopic: string      // if showDiagram, what to animate
  diagramPosition: 'left' | 'right' | 'center' | 'fullscreen'
  textStyle: 'hook' | 'fact' | 'list' | 'cta'
  emphasis: string[]        // words to highlight in bold
}

export interface ProductionManifest {
  briefId: string
  channel: string
  title: string
  totalDurationSec: number
  fps: number
  resolution: { width: number; height: number }
  voice: string             // full narration text for TTS
  scenes: SceneSpec[]
  manimScenes: ManimScene[]
  thumbnail: { prompt: string }
}

export interface ManimScene {
  sceneIndex: number
  topic: string
  pythonCode: string        // full Manim Python scene
  durationSec: number
}

const CHANNEL_RESOLUTION: Record<string, { width: number; height: number }> = {
  tiktok:    { width: 1080, height: 1920 },
  instagram: { width: 1080, height: 1080 },
  youtube:   { width: 1920, height: 1080 },
  pinterest: { width: 1008, height: 1512 },
}

export async function analyzeScript(brief: ContentBrief): Promise<ProductionManifest> {
  const resolution = CHANNEL_RESOLUTION[brief.channel] ?? { width: 1080, height: 1920 }
  const isShortForm = brief.channel === 'tiktok' || brief.channel === 'instagram'
  const targetDuration = isShortForm ? 30 : 90

  const systemPrompt = `You are a video production director specializing in educational nursing content.
You analyze scripts and produce precise, structured production manifests for AI video generation.
SimpleNursing brand: teal #00709c, blue #75c7e6, pink #fc3467, yellow #fad74f, dark bg #06080f.
The presenter is "Nurse Mike" — a 2D cartoon character with 8 SVG poses: talking, pointing, open_arms, celebrate, sad, idle, pose7, pose8.
Manim is used for animated diagrams (drug mechanisms, anatomy, clinical reasoning steps).
Always respond with valid JSON only. No markdown, no explanation — just the JSON object.`

  const userPrompt = `Analyze this ${brief.channel} content brief and produce a production manifest.

BRIEF:
Title: ${brief.title}
Hook: ${brief.hook}
Channel: ${brief.channel}
Target duration: ${targetDuration} seconds
Script/Content:
${brief.contentPreview.slice(0, 2000)}

REQUIREMENTS:
- Split into ${isShortForm ? '4-8' : '8-15'} scenes
- Each scene: 3-8 seconds
- Identify 1-3 moments where a Manim diagram would help (drug mechanism, body system, clinical step)
- For each diagram scene, write complete working Manim Python code
- Background: use 'veo3_clip' for action/lifestyle shots, 'animated_dark' for talking-head, 'manim_fullscreen' for pure diagram
- Mike poses should match content energy: celebrate for exciting facts, pointing for lists, talking for narration
- Write full narration text as one continuous string (what gets sent to TTS)

RESPOND WITH THIS EXACT JSON STRUCTURE:
{
  "briefId": "${brief.airtableId}",
  "channel": "${brief.channel}",
  "title": "${brief.title}",
  "totalDurationSec": <number>,
  "fps": 30,
  "resolution": { "width": ${resolution.width}, "height": ${resolution.height} },
  "voice": "<full narration text, one string, ~${Math.round(targetDuration * 2.5)} words>",
  "scenes": [
    {
      "index": 0,
      "startSec": 0,
      "durationSec": 5,
      "text": "<caption text>",
      "mikePose": "talking",
      "bgType": "animated_dark",
      "bgPrompt": "<if veo3_clip or imagen4_still: describe the background scene>",
      "showDiagram": false,
      "diagramTopic": "",
      "diagramPosition": "right",
      "textStyle": "hook",
      "emphasis": ["<word1>", "<word2>"]
    }
  ],
  "manimScenes": [
    {
      "sceneIndex": <which scene index shows this>,
      "topic": "<diagram topic>",
      "durationSec": 6,
      "pythonCode": "<complete Manim Python code for this scene, using SimpleNursing colors: SN_TEAL='#00709c', SN_BLUE='#75c7e6', SN_PINK='#fc3467', SN_YELLOW='#fad74f'>"
    }
  ],
  "thumbnail": {
    "prompt": "<Imagen4/Flux prompt for YouTube thumbnail or Pinterest pin>"
  }
}`

  const msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = (msg.content[0] as any).text.trim()
  // Strip markdown code fences if model adds them
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(json) as ProductionManifest
}
