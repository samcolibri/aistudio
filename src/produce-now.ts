#!/usr/bin/env node
/**
 * Standalone production — no Temporal/Docker needed.
 *
 * tsx src/produce-now.ts --rank 6     # Pinterest: From High School to RN
 * tsx src/produce-now.ts --rank 1     # TikTok: 9 Classes (needs Veo3 + Fish Audio)
 * tsx src/produce-now.ts --rank 5     # YouTube
 * tsx src/produce-now.ts --rank 26    # Instagram
 */
import 'dotenv/config'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import chalk from 'chalk'
import { fetchBriefByRank, fetchCreativeApprovedBriefs, setProductionStatus } from './client/airtable.js'
import { generateImage, generateVideo } from './client/google-ai.js'
import { synthesize, VOICE_IDS } from './client/fish-audio.js'
import { getStyleContext } from './indexer/query-assets.js'
import type { ContentBrief } from './types/brief.js'
import { splitIntoVeoScenes } from './utils/text.js'
import { getPersona } from './personas/index.js'

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'

const args = process.argv.slice(2)
const rankIdx = args.indexOf('--rank')
const rank = rankIdx >= 0 ? parseInt(args[rankIdx + 1]) : 0
const dryRun = args.includes('--dry')

async function log(msg: string) { console.log(msg) }

async function main() {
  console.log(chalk.bold('\n  NurseForge — Standalone Producer\n'))

  const brief = rank
    ? await fetchBriefByRank(rank)
    : (await fetchCreativeApprovedBriefs())[0]

  if (!brief) { console.error('No brief found'); process.exit(1) }

  console.log(`  ${chalk.bold('#' + brief.rank)} ${brief.title}`)
  console.log(`  Channel: ${chalk.cyan(brief.channel)} | Persona: ${brief.personaId} | Score: ${chalk.green(String(brief.score))}`)
  console.log(`  Hook: ${chalk.italic(brief.hook.slice(0, 80))}`)
  console.log()

  if (dryRun) { showPlan(brief); return }

  const outDir = join(OUTPUT_DIR, brief.airtableId)
  await mkdir(outDir, { recursive: true })

  await setProductionStatus(brief.airtableId, 'Producing').catch(() => {})

  switch (brief.channel) {
    case 'pinterest':  await producePinterest(brief, outDir); break
    case 'instagram':  await produceInstagram(brief, outDir); break
    case 'tiktok':     await produceTikTok(brief, outDir);    break
    case 'youtube':    await produceYouTube(brief, outDir);   break
    default: console.error(`Unknown channel: ${brief.channel}`)
  }
}

// ── Pinterest ──────────────────────────────────────────────────────────────────
async function producePinterest(brief: ContentBrief, outDir: string) {
  const dir = join(outDir, 'pinterest')
  await mkdir(dir, { recursive: true })

  // Load style context
  let styleRef = ''
  try {
    const ctx = await getStyleContext({ channel: 'pinterest', topic: brief.title })
    if (ctx.topAssets.length > 0) {
      styleRef = `Reference style: ${ctx.veo3StyleGuide.slice(0, 150)}`
      console.log(chalk.dim(`  Style: ${ctx.topAssets.length} Pinterest reference assets loaded`))
    }
  } catch {}

  const prompt = [
    `Pinterest educational pin for nursing students.`,
    `Title: "${brief.title}"`,
    `Key message: "${brief.hook}"`,
    `Content: ${brief.contentPreview.slice(0, 600)}`,
    `Vertical 2:3 format. Bold headline at top, infographic-style layout, text-forward.`,
    `SimpleNursing brand: teal #00709c, light blue #75c7e6, pink/red accent #fc3467, near-black #282323.`,
    `Professional nursing education aesthetic. High contrast, mobile-optimized, save-worthy.`,
    styleRef,
    `NO watermarks, NO logos, NO URLs. Clean educational design.`,
  ].filter(Boolean).join(' ')

  console.log(`  [1/1] Generating Pinterest pin with Imagen4 Ultra...`)
  console.log(chalk.dim(`  Prompt: ${prompt.slice(0, 120)}...`))

  const buf = await generateImage({ prompt, aspectRatio: '2:3' })
  const outPath = join(dir, 'pin.png')
  await writeFile(outPath, buf)

  console.log(chalk.green(`\n  ✅ Pinterest pin saved → ${outPath}`))
  console.log(`  Size: ${(buf.length / 1024).toFixed(0)}KB`)
  console.log(chalk.dim(`\n  Open: open "${outPath}"`))

  await setProductionStatus(brief.airtableId, 'Review Ready').catch(() => {})
}

// ── Instagram ──────────────────────────────────────────────────────────────────
async function produceInstagram(brief: ContentBrief, outDir: string) {
  const dir = join(outDir, 'instagram')
  await mkdir(dir, { recursive: true })

  let styleRef = ''
  try {
    const ctx = await getStyleContext({ channel: 'instagram', topic: brief.title })
    if (ctx.topAssets.length > 0) styleRef = ctx.veo3StyleGuide.slice(0, 120)
  } catch {}

  // Split content into slides
  const content = brief.contentPreview
  const slides = splitCarousel(content, brief.hook)
  console.log(`  Generating ${slides.length} Instagram carousel slides...\n`)

  const paths: string[] = []
  for (let i = 0; i < slides.length; i++) {
    const prompt = [
      `Instagram educational carousel slide ${i + 1} of ${slides.length} for nursing students.`,
      i === 0 ? `COVER SLIDE. Hook: "${brief.hook}"` : `Content: "${slides[i].slice(0, 400)}"`,
      `Square 1:1 format. Bold readable text. Slide number ${i+1}/${slides.length} visible.`,
      `SimpleNursing brand: teal #00709c, light blue #75c7e6, pink accent #fc3467.`,
      `Clean minimal layout, high contrast, save-worthy. Educational nursing content.`,
      styleRef,
    ].filter(Boolean).join(' ')

    process.stdout.write(`  [${i+1}/${slides.length}] Generating slide ${i+1}...`)
    const buf = await generateImage({ prompt, aspectRatio: '1:1' })
    const p = join(dir, `slide_${String(i+1).padStart(2,'0')}.png`)
    await writeFile(p, buf)
    paths.push(p)
    console.log(chalk.green(` ✓ ${(buf.length/1024).toFixed(0)}KB`))
    await new Promise(r => setTimeout(r, 800))
  }

  console.log(chalk.green(`\n  ✅ ${paths.length} Instagram slides saved → ${dir}`))
  console.log(chalk.dim(`\n  Open: open "${dir}"`))
  await setProductionStatus(brief.airtableId, 'Review Ready').catch(() => {})
}

// ── TikTok ─────────────────────────────────────────────────────────────────────
async function produceTikTok(brief: ContentBrief, outDir: string) {
  const dir = join(outDir, 'tiktok')
  await mkdir(dir, { recursive: true })
  const persona = getPersona(brief.personaId as any)

  // Voice
  console.log(`  [1/3] Fish Audio — generating Nurse Mike narration...`)
  let voicePath = ''
  try {
    const voiceId = VOICE_IDS[brief.personaId as keyof typeof VOICE_IDS] ?? VOICE_IDS['nurse-mike']
    const script = brief.contentPreview.replace(/\[[^\]]+\]/g, '').trim()
    const result = await synthesize({ text: script.slice(0, 3000), referenceId: voiceId, format: 'mp3' })
    voicePath = join(dir, 'narration.mp3')
    await writeFile(voicePath, result.audio)
    console.log(chalk.green(`  ✓ Voice: ${result.durationSec}s, $${result.costUsd.toFixed(4)}`))
  } catch (err) {
    const msg = String(err)
    if (msg.includes('402') || msg.includes('balance') || msg.includes('Balance')) {
      console.log(chalk.yellow(`  ⚠ Fish Audio needs credits → https://fish.audio/go-api/`))
      console.log(chalk.dim('    Continuing without voice — generating Veo3 clips only'))
    } else {
      console.log(chalk.red(`  ✗ Voice failed: ${msg.slice(0, 100)}`))
    }
  }

  // Style context
  let styleRef = ''
  try {
    const ctx = await getStyleContext({ channel: 'tiktok', topic: brief.title })
    if (ctx.topAssets.length > 0) styleRef = ctx.veo3StyleGuide.slice(0, 200)
  } catch {}

  // Veo3 clips
  console.log(`\n  [2/3] Veo3 — generating TikTok clips...`)
  const script = brief.contentPreview.replace(/\[[^\]]+\]/g, '').trim()
  const scenes = splitIntoVeoScenes(script, 25).slice(0, 4)
  const clipPaths: string[] = []

  for (let i = 0; i < scenes.length; i++) {
    const gesture = inferGesture(scenes[i])
    const prompt = [
      persona.veo3Description,
      `He speaks directly to camera: "${scenes[i]}"`,
      gesture,
      `High energy TikTok-native delivery, vertical 9:16 framing.`,
      styleRef ? `Style: ${styleRef.slice(0, 150)}` : '',
      `Photorealistic, broadcast quality, sharp focus.`,
    ].filter(Boolean).join(' ')

    process.stdout.write(`  [clip ${i+1}/${scenes.length}] Generating Veo3 (8s)...`)
    try {
      const buf = await generateVideo({ prompt, aspectRatio: '9:16', durationSeconds: 8 })
      const p = join(dir, `clip_${String(i+1).padStart(2,'0')}.mp4`)
      await writeFile(p, buf)
      clipPaths.push(p)
      console.log(chalk.green(` ✓ ${(buf.length/1024/1024).toFixed(1)}MB`))
    } catch (err) {
      console.log(chalk.red(` ✗ ${String(err).slice(0, 80)}`))
    }
    await new Promise(r => setTimeout(r, 2000))
  }

  // Summary
  console.log()
  const produced = [voicePath, ...clipPaths].filter(Boolean)
  if (produced.length > 0) {
    console.log(chalk.green(`  ✅ TikTok assets saved → ${dir}`))
    produced.forEach(p => console.log(`    → ${p.replace(OUTPUT_DIR + '/', '')}`))
    console.log(chalk.dim('\n  Next: start Docker + npm start for full Remotion composition'))
  } else {
    console.log(chalk.red('  No assets produced — check API keys'))
  }
  await setProductionStatus(brief.airtableId, 'Review Ready').catch(() => {})
}

// ── YouTube ────────────────────────────────────────────────────────────────────
async function produceYouTube(brief: ContentBrief, outDir: string) {
  const dir = join(outDir, 'youtube')
  await mkdir(dir, { recursive: true })
  const persona = getPersona(brief.personaId as any)

  // Thumbnail first (fast)
  console.log(`  [1/3] Imagen4 — generating YouTube thumbnail...`)
  const thumbPrompt = [
    `YouTube thumbnail for nursing education video: "${brief.title}"`,
    `Nurse Mike character — ${persona.veo3Description.slice(0, 100)}`,
    `Bold text overlay. 16:9 format. High contrast, click-worthy, professional.`,
    `SimpleNursing brand: teal #00709c, light blue #75c7e6, pink #fc3467.`,
  ].join(' ')
  const thumbBuf = await generateImage({ prompt: thumbPrompt, aspectRatio: '16:9' })
  const thumbPath = join(dir, 'thumbnail.png')
  await writeFile(thumbPath, thumbBuf)
  console.log(chalk.green(`  ✓ Thumbnail → ${thumbPath}`))

  // Voice + clips (same as TikTok but 16:9)
  await produceTikTok({ ...brief, channel: 'tiktok' as any }, outDir)
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function splitCarousel(content: string, hook: string): string[] {
  const byMarker = content.split(/\[?SLIDE\s*\d+[^\]]*\]?/i).filter(s => s.trim().length > 20)
  if (byMarker.length >= 3) return [hook, ...byMarker.slice(0, 7)]

  const byPara = content.split(/\n\n+/).filter(s => s.trim().length > 30)
  if (byPara.length >= 2) return [hook, ...byPara.slice(0, 7)]

  return [hook, content.slice(0, 300)]
}

function inferGesture(text: string): string {
  const t = text.toLowerCase()
  if (/first|second|third|\d/.test(t)) return 'Counts on fingers.'
  if (/important|critical|must|need/.test(t)) return 'Points at camera.'
  if (/quiz|link|follow|subscribe/.test(t)) return 'Finger guns at camera, smiling.'
  if (/listen|nobody|wish|honest/.test(t)) return 'Leans toward camera.'
  return 'Confident natural delivery.'
}

function showPlan(brief: ContentBrief) {
  const plans: Record<string, string[]> = {
    pinterest: ['Imagen4 Ultra → 2:3 pin (1008×1512)', 'Style from asset library'],
    instagram: ['Imagen4 Ultra → 4-8 slides (1080×1080)', 'Style from asset library'],
    tiktok:    ['Fish Audio → voice MP3', 'Veo3 → 4 clips × 8s (9:16)', 'FFmpeg compose'],
    youtube:   ['Imagen4 → thumbnail', 'Fish Audio → voice', 'Veo3 → 4 clips × 8s (16:9)'],
  }
  console.log(`  Plan for ${chalk.cyan(brief.channel.toUpperCase())}:`)
  ;(plans[brief.channel] ?? ['unknown']).forEach(s => console.log(`    • ${s}`))
}

main().catch(err => {
  console.error(chalk.red('\nFatal:'), err.message)
  process.exit(1)
})
