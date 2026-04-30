import { readFile } from 'fs/promises'
import fetch from 'node-fetch'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'

export interface AssetAnalysis {
  title: string
  category: 'music_video' | 'tutorial_video' | 'short_form' | 'carousel' | 'thumbnail' | 'story' | 'product' | 'youtube_long_form' | 'membership_video'
  channel: 'youtube' | 'tiktok' | 'instagram' | 'pinterest' | 'story' | 'membership' | 'unknown'
  format: '16:9' | '9:16' | '1:1' | '2:3' | '4:5' | 'unknown'
  persona: string
  topic: string
  brandColors: boolean
  colorPalette: string[]
  visualStyle: string
  animationStyle: 'poster_overlay' | 'talking_head' | 'music_video' | 'quiz_reveal' | 'story_overlay' | 'product_shot' | 'static' | 'none'
  hookText: string
  copywritingStyle: string
  brandConsistency: number
  qualityScore: number
  whatWorks: string[]
  veo3Prompt: string
  tags: string[]
}

const ANALYSIS_PROMPT = `You are analyzing SimpleNursing content assets to build a style guide for an AI content generation system. SimpleNursing is a nursing education brand.

Brand colors: #75c7e6 (light blue), #00709c (medium blue), #005374 (dark blue), #fc3467 (pink/red), #62d070 (green), #fad74f (yellow), #282323 (near black)

Analyze this asset and respond with ONLY valid JSON matching this schema exactly:
{
  "title": "descriptive title of this content",
  "category": "music_video|tutorial_video|short_form|carousel|thumbnail|story|product|youtube_long_form|membership_video",
  "channel": "youtube|tiktok|instagram|pinterest|story|membership|unknown",
  "format": "16:9|9:16|1:1|2:3|4:5|unknown",
  "persona": "describe person/character visible, or 'none'",
  "topic": "nursing topic covered (e.g. 'electrolytes', 'pharmacology', 'NCLEX prep')",
  "brandColors": true/false (are brand colors present?),
  "colorPalette": ["#hex1", "#hex2"] (2-4 dominant colors),
  "visualStyle": "one sentence describing the visual aesthetic",
  "animationStyle": "poster_overlay|talking_head|music_video|quiz_reveal|story_overlay|product_shot|static|none",
  "hookText": "any visible text hook or title on screen (empty string if none)",
  "copywritingStyle": "describe text/caption style (punchy, educational, list-based, etc.)",
  "brandConsistency": 8 (1-10, how well it matches SN brand),
  "qualityScore": 8 (1-10 production quality),
  "whatWorks": ["specific thing 1", "specific thing 2"] (2-3 elements that make this engaging),
  "veo3Prompt": "if this were a video, write the Veo3 prompt style that would recreate this visual (focus on lighting, framing, energy, background)",
  "tags": ["tag1", "tag2"] (5-8 searchable tags: topic, style, format, mood)
}`

export async function analyzeAssetVision(
  opts: { imagePath?: string; base64?: string; mediaType: string; filename: string }
): Promise<AssetAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  let imageData: string
  if (opts.base64) {
    imageData = opts.base64
  } else if (opts.imagePath) {
    const buf = await readFile(opts.imagePath)
    imageData = buf.toString('base64')
  } else {
    throw new Error('imagePath or base64 required')
  }

  // Retry with exponential backoff for rate limits
  let data: { content: Array<{ type: string; text: string }> }
  for (let attempt = 0; attempt <= 4; attempt++) {
    const resp = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: opts.mediaType, data: imageData },
            },
            {
              type: 'text',
              text: `Filename: ${opts.filename}\n\n${ANALYSIS_PROMPT}`,
            },
          ],
        }],
      }),
    })

    if (resp.ok) {
      data = await resp.json() as { content: Array<{ type: string; text: string }> }
      break
    }

    const errText = await resp.text()
    if (resp.status === 429 && attempt < 4) {
      const waitMs = Math.min(60_000 * Math.pow(2, attempt), 120_000)
      process.stdout.write(`\n  [rate limit] waiting ${waitMs / 1000}s before retry ${attempt + 1}...`)
      await new Promise(r => setTimeout(r, waitMs))
      continue
    }
    throw new Error(`Claude Vision API error ${resp.status}: ${errText}`)
  }
  data = data!
  const text = data.content[0]?.text ?? ''

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/)
  const jsonStr = jsonMatch?.[1] ?? text
  return JSON.parse(jsonStr.trim()) as AssetAnalysis
}
