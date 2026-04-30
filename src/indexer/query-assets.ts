/**
 * Loaded by NurseForgeWorkflow before generating content.
 * Reads .asset-manifest.json (no external service needed) and returns
 * the most relevant style context for the given channel + topic.
 */
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { AssetRecord } from './index.js'

const MANIFEST_PATH = join(process.cwd(), '.asset-manifest.json')

interface StyleContext {
  channel: string
  topAssets: AssetRecord[]
  veo3StyleGuide: string
  brandPatterns: string[]
  topicExamples: AssetRecord[]
  averageQuality: number
  recommendedFormat: string
  hookExamples: string[]
}

async function loadManifest(): Promise<AssetRecord[]> {
  if (!existsSync(MANIFEST_PATH)) return []
  const raw = await readFile(MANIFEST_PATH, 'utf8')
  const manifest = JSON.parse(raw) as { assets: AssetRecord[] }
  return manifest.assets.filter(a => a.analysis)
}

export async function getStyleContext(opts: {
  channel: string
  topic?: string
  limit?: number
}): Promise<StyleContext> {
  const assets = await loadManifest()
  const { channel, topic, limit = 5 } = opts

  // Filter by channel (fuzzy — 'tiktok' matches 'short_form' too)
  const channelAssets = assets.filter(a => {
    const an = a.analysis!
    return an.channel === channel ||
      (channel === 'tiktok' && (an.format === '9:16' || an.category === 'short_form')) ||
      (channel === 'youtube' && (an.format === '16:9' || an.channel === 'membership'))
  })

  // Sort by quality + brand consistency
  const sorted = channelAssets.sort(
    (a, b) => (b.analysis!.qualityScore + b.analysis!.brandConsistency)
             - (a.analysis!.qualityScore + a.analysis!.brandConsistency)
  )

  const topAssets = sorted.slice(0, limit)

  // Topic-specific examples
  const topicExamples = topic
    ? assets.filter(a =>
        a.analysis!.topic.toLowerCase().includes(topic.toLowerCase()) ||
        (a.analysis!.tags ?? []).some(t => t.toLowerCase().includes(topic.toLowerCase()))
      ).slice(0, 3)
    : []

  // Aggregate style patterns
  const veo3Prompts = topAssets
    .map(a => a.analysis!.veo3Prompt)
    .filter(p => p && p.length > 20)

  const veo3StyleGuide = veo3Prompts.length > 0
    ? `Based on ${topAssets.length} top ${channel} assets: ${summarizeVeo3(veo3Prompts)}`
    : `No ${channel} reference assets found — use default Nurse Mike character description`

  const brandPatterns = dedupe(
    topAssets.flatMap(a => a.analysis!.whatWorks ?? [])
  ).slice(0, 6)

  const avgQuality = topAssets.length > 0
    ? topAssets.reduce((s, a) => s + a.analysis!.qualityScore, 0) / topAssets.length
    : 0

  const hookExamples = topAssets
    .map(a => a.analysis!.hookText)
    .filter(h => h && h.length > 5)
    .slice(0, 5)

  const formatCounts: Record<string, number> = {}
  for (const a of channelAssets) {
    const f = a.analysis!.format
    formatCounts[f] = (formatCounts[f] ?? 0) + 1
  }
  const recommendedFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '9:16'

  return {
    channel,
    topAssets,
    veo3StyleGuide,
    brandPatterns,
    topicExamples,
    averageQuality: Math.round(avgQuality * 10) / 10,
    recommendedFormat,
    hookExamples,
  }
}

export function styleContextToString(ctx: StyleContext): string {
  const lines = [
    `ASSET LIBRARY STYLE CONTEXT — ${ctx.channel.toUpperCase()}`,
    `Format: ${ctx.recommendedFormat} | Avg quality reference: ${ctx.averageQuality}/10`,
    '',
    `VEO3 STYLE: ${ctx.veo3StyleGuide}`,
    '',
    'WHAT WORKS in existing content:',
    ...ctx.brandPatterns.map(p => `  • ${p}`),
  ]

  if (ctx.hookExamples.length > 0) {
    lines.push('', 'HOOK EXAMPLES from existing content:')
    ctx.hookExamples.forEach(h => lines.push(`  • "${h}"`))
  }

  if (ctx.topicExamples.length > 0) {
    lines.push('', 'SIMILAR TOPIC REFERENCES:')
    ctx.topicExamples.forEach(a =>
      lines.push(`  • ${a.analysis!.title} [${a.analysis!.animationStyle}]`)
    )
  }

  return lines.join('\n')
}

function summarizeVeo3(prompts: string[]): string {
  // Extract the most common descriptors across all prompts
  const words = prompts.join(' ').toLowerCase()
  const keyTerms = [
    'studio lighting', 'teal', 'soft', 'cinematic', 'eye level', 'close-up',
    'warm', 'clean background', 'scrubs', 'direct camera', 'energy',
    'bold text', 'poster', 'animated', 'music',
  ]
  const present = keyTerms.filter(t => words.includes(t))
  return prompts[0].slice(0, 150) + (present.length > 2 ? ` [common: ${present.slice(0, 4).join(', ')}]` : '')
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)]
}
