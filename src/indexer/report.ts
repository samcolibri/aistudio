import type { AssetRecord } from './index.js'

export function generateLearningReport(assets: AssetRecord[]): string {
  const analyzed = assets.filter(a => a.analysis)
  const total = assets.length
  const lines: string[] = []

  lines.push('═══════════════════════════════════════════════════════════════')
  lines.push('  SIMPLENURSING AI STUDIO — ASSET LEARNING REPORT')
  lines.push(`  ${new Date().toISOString().slice(0, 10)} | ${analyzed.length}/${total} assets analyzed`)
  lines.push('═══════════════════════════════════════════════════════════════')
  lines.push('')

  // ── INVENTORY ──────────────────────────────────────────────────────────
  lines.push('■ ASSET INVENTORY')
  const byCat = groupBy(analyzed, a => a.analysis!.category)
  for (const [cat, items] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`   ${pad(cat, 20)} ${items.length} assets`)
  }
  lines.push('')

  lines.push('■ BY CHANNEL')
  const byChan = groupBy(analyzed, a => a.analysis!.channel)
  for (const [ch, items] of Object.entries(byChan).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`   ${pad(ch, 20)} ${items.length} assets`)
  }
  lines.push('')

  lines.push('■ BY FORMAT')
  const byFmt = groupBy(analyzed, a => a.analysis!.format)
  for (const [fmt, items] of Object.entries(byFmt).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`   ${pad(fmt, 20)} ${items.length} assets`)
  }
  lines.push('')

  // ── BRAND CONSISTENCY ──────────────────────────────────────────────────
  const brandScores = analyzed.map(a => a.analysis!.brandConsistency).filter(Boolean)
  const avgBrand = brandScores.reduce((s, v) => s + v, 0) / (brandScores.length || 1)
  const qualScores = analyzed.map(a => a.analysis!.qualityScore).filter(Boolean)
  const avgQual = qualScores.reduce((s, v) => s + v, 0) / (qualScores.length || 1)
  const brandYes = analyzed.filter(a => a.analysis!.brandColors).length

  lines.push('■ BRAND HEALTH')
  lines.push(`   Brand color usage:     ${brandYes}/${analyzed.length} assets (${Math.round(brandYes/analyzed.length*100)}%)`)
  lines.push(`   Avg brand consistency: ${avgBrand.toFixed(1)}/10`)
  lines.push(`   Avg production quality: ${avgQual.toFixed(1)}/10`)
  lines.push('')

  // ── TOP PERFORMING STYLES ──────────────────────────────────────────────
  lines.push('■ TOP STYLE PATTERNS (what works)')
  const allWhatWorks = analyzed.flatMap(a => a.analysis!.whatWorks ?? [])
  const wwFreq = frequency(allWhatWorks.map(w => w.toLowerCase().slice(0, 60)))
  for (const [item, count] of wwFreq.slice(0, 10)) {
    lines.push(`   [${count}x] ${item}`)
  }
  lines.push('')

  // ── ANIMATION STYLES ──────────────────────────────────────────────────
  lines.push('■ ANIMATION / VISUAL STYLES')
  const byAnim = groupBy(analyzed, a => a.analysis!.animationStyle)
  for (const [anim, items] of Object.entries(byAnim).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`   ${pad(anim, 22)} ${items.length}x`)
  }
  lines.push('')

  // ── VEO3 STYLE FINGERPRINT (per channel) ──────────────────────────────
  lines.push('■ VEO3 PROMPT STYLE FINGERPRINT (by channel)')
  for (const [ch, items] of Object.entries(byChan)) {
    const withVeo = items.filter(a => a.analysis!.veo3Prompt?.length > 20)
    if (withVeo.length === 0) continue
    lines.push(`\n  ── ${ch.toUpperCase()} ──`)
    // Show unique style elements
    const styles = withVeo.map(a => a.analysis!.veo3Prompt).slice(0, 3)
    for (const s of styles) {
      lines.push(`   • ${s.slice(0, 120)}`)
    }
  }
  lines.push('')

  // ── TOPIC MAP ─────────────────────────────────────────────────────────
  lines.push('■ CONTENT TOPIC COVERAGE')
  const topicFreq = frequency(analyzed.map(a => a.analysis!.topic))
  for (const [topic, count] of topicFreq.slice(0, 15)) {
    lines.push(`   [${count}x] ${topic}`)
  }
  lines.push('')

  // ── TOP TAGS ──────────────────────────────────────────────────────────
  lines.push('■ TOP SEARCHABLE TAGS')
  const tagFreq = frequency(analyzed.flatMap(a => a.analysis!.tags ?? []))
  lines.push('   ' + tagFreq.slice(0, 20).map(([t, c]) => `${t}(${c})`).join(' · '))
  lines.push('')

  // ── GAPS ──────────────────────────────────────────────────────────────
  lines.push('■ IDENTIFIED GAPS')
  const hasPersona = analyzed.filter(a => a.analysis!.persona && a.analysis!.persona !== 'none').length
  if (hasPersona / analyzed.length < 0.3) {
    lines.push('   ⚠ Most content has no identifiable persona — Nurse Mike underused')
  }
  const tiktokCount = byChan['tiktok']?.length ?? 0
  const ytCount = byChan['youtube']?.length ?? 0
  if (tiktokCount < ytCount * 0.5) {
    lines.push('   ⚠ TikTok content gap — ratio is low vs YouTube')
  }
  const lowBrand = analyzed.filter(a => a.analysis!.brandConsistency < 6)
  if (lowBrand.length > 0) {
    lines.push(`   ⚠ ${lowBrand.length} assets with brand consistency < 6/10`)
  }
  const topics = analyzed.map(a => a.analysis!.topic.toLowerCase())
  const missingTopics = ['pharmacology', 'cardiac', 'nclex'].filter(
    t => !topics.some(tp => tp.includes(t))
  )
  if (missingTopics.length > 0) {
    lines.push(`   ⚠ Underrepresented topics: ${missingTopics.join(', ')}`)
  }
  lines.push('')

  lines.push('■ RECOMMENDED VEO3 STYLE GUIDE (for NurseForge)')
  lines.push(`   • Talking head: "${bestVeo3Prompt(byChan['tiktok'] ?? [], 'talking_head')}"`)
  lines.push(`   • YouTube hook: "${bestVeo3Prompt(byChan['youtube'] ?? [], 'talking_head')}"`)
  lines.push(`   • Use brand color #fad74f for lower-thirds, #fc3467 for accent text`)
  lines.push(`   • Music videos: bold font overlays, fast cuts, student relatable energy`)
  lines.push('')

  lines.push('═══════════════════════════════════════════════════════════════')
  lines.push('  Manifest saved to .asset-manifest.json')
  lines.push('  Run: tsx src/indexer/index.ts search "<query>" to find assets')
  lines.push('═══════════════════════════════════════════════════════════════')

  return lines.join('\n')
}

function groupBy<T>(arr: T[], fn: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of arr) {
    const key = fn(item) ?? 'unknown'
    ;(out[key] ??= []).push(item)
  }
  return out
}

function frequency(arr: string[]): [string, number][] {
  const map: Record<string, number> = {}
  for (const s of arr) map[s] = (map[s] ?? 0) + 1
  return Object.entries(map).sort((a, b) => b[1] - a[1])
}

function pad(s: string, n: number) {
  return s.padEnd(n, ' ')
}

function bestVeo3Prompt(items: AssetRecord[], animStyle: string): string {
  const match = items.find(a => a.analysis?.animationStyle === animStyle)
  return match?.analysis?.veo3Prompt?.slice(0, 100) ?? 'soft teal studio lighting, eye level, medium close-up'
}
