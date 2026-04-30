/**
 * Production Orchestrator
 *
 * Takes a ContentBrief → full parallel production → Remotion manifest JSON
 *
 * Steps:
 *  1. Claude analyzes script → ProductionManifest (scene plan + Manim code)
 *  2. Parallel: voice TTS, Manim renders, background generation
 *  3. Writes manifest.json to output dir
 *  4. Invokes Remotion render
 */
import 'dotenv/config'
import { mkdir, writeFile, readFile, copyFile } from 'fs/promises'
import { join } from 'path'
import { existsSync as existsS } from 'fs'
import { spawn } from 'child_process'
import chalk from 'chalk'
import type { ContentBrief } from '../types/brief.js'
import { analyzeScript, type ProductionManifest, type ManimScene } from './analyze-script.js'
import { synthesize, synthesizeScenes, VOICE_IDS } from '../client/fish-audio.js'
import { generateVideo } from '../client/google-ai.js'
import { setProductionStatus } from '../client/airtable.js'
import { generateSceneTalkingHeads } from '../client/talking-head.js'

const ROOT = process.cwd()
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? join(ROOT, 'output')
const MANIM_BIN = existsS('/Users/anmolsam/.local/bin/manim') ? '/Users/anmolsam/.local/bin/manim' : 'manim'
const TSX_BIN = join(ROOT, 'node_modules/.bin/tsx')

type LogFn = (level: 'info' | 'success' | 'warn' | 'error', msg: string) => void

// ── Manim renderer ────────────────────────────────────────────────────────────
async function renderManimScene(scene: ManimScene, outDir: string, log: LogFn): Promise<string> {
  const scriptPath = join(outDir, `manim_${scene.sceneIndex}.py`)
  await writeFile(scriptPath, scene.pythonCode)
  const outputFile = `manim_scene_${scene.sceneIndex}`

  return new Promise((resolve, reject) => {
    log('info', `  🎬 Manim scene ${scene.sceneIndex}: "${scene.topic}"`)
    const child = spawn(MANIM_BIN, [
      '-ql', '--output_file', outputFile, scriptPath, 'MainScene',
    ], { cwd: outDir, env: process.env })

    child.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim()
      if (line.includes('Rendered') || line.includes('INFO')) log('info', `    Manim: ${line}`)
    })
    child.on('close', (code) => {
      if (code !== 0) { reject(new Error(`Manim exited ${code}`)); return }
      // Manim outputs to media/videos/<scriptname>/480p15/<outputFile>.mp4
      const baseName = scriptPath.replace(/\.py$/, '').split('/').pop()!
      const videoPath = join(outDir, 'media', 'videos', baseName, '480p15', `${outputFile}.mp4`)
      resolve(videoPath)
    })
  })
}

// ── Voice synthesis ───────────────────────────────────────────────────────────
async function synthesizeVoice(
  text: string, personaId: string, outDir: string, log: LogFn
): Promise<string | null> {
  log('info', `  🎙 Synthesizing full narration (custom voice: ${VOICE_IDS['nurse-mike'].slice(0, 8)}...)`)
  try {
    const voiceId = VOICE_IDS[personaId as keyof typeof VOICE_IDS] ?? VOICE_IDS['nurse-mike']
    const result = await synthesize({ text: text.slice(0, 3000), referenceId: voiceId, format: 'mp3', bitrate: 192 })
    const voicePath = join(outDir, 'narration.mp3')
    await writeFile(voicePath, result.audio)
    log('success', `  ✅ Voice: ${result.durationSec}s — narration.mp3`)
    return voicePath
  } catch (err) {
    log('warn', `  ⚠ Voice skipped: ${String(err).slice(0, 80)}`)
    return null
  }
}

// ── Per-scene audio + talking head generation ─────────────────────────────────
async function generateTalkingHeads(
  scenes: ProductionManifest['scenes'],
  personaId: string,
  outDir: string,
  log: LogFn
): Promise<Record<number, string>> {
  const hasFal = !!process.env.FAL_KEY

  if (!hasFal) {
    log('warn', '  ⚠ FAL_KEY not set — skipping talking head (static character used)')
    return {}
  }

  log('info', '  🎭 Generating per-scene audio for talking head...')
  const sceneAudio = await synthesizeScenes(
    scenes.map(s => ({ index: s.index, text: s.text })),
    personaId,
    outDir,
  )
  log('success', `  ✅ Per-scene audio: ${Object.keys(sceneAudio).length} clips`)

  // mike_realistic.png = Flux Pro generated photorealistic face (SadTalker requires real face)
  const characterPath = existsS(join(ROOT, 'remotion', 'public', 'mike_realistic.png'))
    ? join(ROOT, 'remotion', 'public', 'mike_realistic.png')
    : join(ROOT, 'remotion', 'public', 'mike_svg_4.png')

  log('info', '  🎭 Generating talking head clips (SadTalker via fal.ai)...')
  const talkingHeads = await generateSceneTalkingHeads({
    scenes: scenes.map(s => ({ index: s.index, audioPath: sceneAudio[s.index] ?? null })),
    characterImagePath: characterPath,
    outDir,
    log: log as any,
  })
  log('success', `  ✅ Talking heads: ${Object.keys(talkingHeads).length}/${scenes.length} scenes`)
  return talkingHeads
}

// ── Background generation ─────────────────────────────────────────────────────
async function generateBackgrounds(
  manifest: ProductionManifest, outDir: string, log: LogFn
): Promise<Record<number, string>> {
  const paths: Record<number, string> = {}
  const veo3Scenes = manifest.scenes.filter(s => s.bgType === 'veo3_clip' && s.bgPrompt)

  for (const scene of veo3Scenes.slice(0, 3)) {
    log('info', `  🎬 Veo3 background for scene ${scene.index}...`)
    try {
      const ar = manifest.resolution.width > manifest.resolution.height ? '16:9' : '9:16'
      const buf = await generateVideo({ prompt: scene.bgPrompt, aspectRatio: ar, durationSeconds: 8 })
      const p = join(outDir, `bg_${scene.index}.mp4`)
      await writeFile(p, buf)
      paths[scene.index] = p
      log('success', `  ✅ Background scene ${scene.index}: ${(buf.length/1024/1024).toFixed(1)}MB`)
    } catch (err) {
      log('warn', `  ⚠ Bg scene ${scene.index} skipped: ${String(err).slice(0, 60)}`)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  return paths
}

// ── Copy assets to remotion/public so Remotion can serve them ────────────────
async function stageAssetsForRemotion(
  manimPaths: (string | null)[],
  manimScenes: ManimScene[],
  briefId: string,
  log: LogFn
): Promise<Record<number, string>> {
  const remotionPublic = join(ROOT, 'remotion', 'public')
  const manimPublic = join(remotionPublic, 'manim', briefId)
  await mkdir(manimPublic, { recursive: true })

  const staged: Record<number, string> = {}
  for (let i = 0; i < manimScenes.length; i++) {
    const src = manimPaths[i]
    if (!src || !existsS(src)) continue
    const dest = join(manimPublic, `scene_${manimScenes[i].sceneIndex}.mp4`)
    await copyFile(src, dest)
    // Path relative to remotion/public for staticFile()
    staged[manimScenes[i].sceneIndex] = `manim/${briefId}/scene_${manimScenes[i].sceneIndex}.mp4`
    log('info', `  📁 Staged Manim scene ${manimScenes[i].sceneIndex} → remotion/public`)
  }
  return staged
}

// ── Remotion render ───────────────────────────────────────────────────────────
async function renderWithRemotion(
  props: Record<string, any>, channel: string, outPath: string, log: LogFn
): Promise<void> {
  const compositionMap: Record<string, string> = {
    tiktok: 'NurseForgeProductionTikTok',
    youtube: 'NurseForgeProduction',
    instagram: 'NurseForgeProduction',
    pinterest: 'NurseForgeProduction',
  }
  const compositionId = compositionMap[channel] ?? 'NurseForgeProduction'

  log('info', `  🎞 Remotion rendering "${compositionId}"...`)
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      [
        'node_modules/@remotion/cli/remotion-cli.js',
        'render',
        'remotion/src/Root.tsx',
        compositionId,
        '--output', outPath,
        '--props', JSON.stringify(props),
      ],
      { cwd: ROOT, env: process.env, stdio: 'pipe' }
    )
    child.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim()
      if (line && (line.includes('Frame') || line.includes('Rendered') || line.includes('Encoding'))) {
        log('info', `    ${line}`)
      }
    })
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Remotion exited ${code}`)))
  })
}

// ── Main orchestrator ─────────────────────────────────────────────────────────
export async function orchestrate(brief: ContentBrief, log: LogFn = (_, m) => console.log(m)) {
  const outDir = join(OUTPUT_DIR, brief.airtableId)
  await mkdir(outDir, { recursive: true })

  log('info', `\n🎬 Orchestrating production: "${brief.title}" [${brief.channel}]`)
  await setProductionStatus(brief.airtableId, 'Producing').catch(() => {})

  // ── Step 1: Analyze script ──────────────────────────────────────────────
  log('info', '\n📋 Step 1/5 — Claude analyzing script...')
  let manifest: ProductionManifest
  try {
    manifest = await analyzeScript(brief)
    log('success', `  ✅ ${manifest.scenes.length} scenes, ${manifest.manimScenes.length} diagrams, ${manifest.totalDurationSec}s`)
    await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  } catch (err) {
    log('error', `  ✗ Script analysis failed: ${err}`)
    throw err
  }

  // ── Step 2: Parallel generation ─────────────────────────────────────────
  log('info', '\n⚡ Step 2/5 — Parallel generation (voice + diagrams + backgrounds)...')

  // Step 2a: Full narration + Manim + backgrounds in parallel (Manim/BG don't use Fish Audio)
  const [voicePath, manimPaths, bgPaths] = await Promise.all([
    synthesizeVoice(manifest.voice, brief.personaId, outDir, log),
    Promise.all(manifest.manimScenes.map(scene =>
      renderManimScene(scene, outDir, log).catch(err => {
        log('warn', `  ⚠ Manim scene ${scene.sceneIndex}: ${String(err).slice(0, 60)}`)
        return null
      })
    )),
    generateBackgrounds(manifest, outDir, log),
  ])

  // Step 2b: Talking heads — sequential Fish Audio per scene, then parallel SadTalker
  // Done after narration to avoid Fish Audio 429 rate limiting
  log('info', '\n🎭 Step 2b/5 — Talking head generation (per-scene audio + SadTalker)...')
  const talkingHeads = await generateTalkingHeads(manifest.scenes, brief.personaId, outDir, log)

  // ── Step 3: Stage assets + build Remotion props ─────────────────────────
  log('info', '\n🗺 Step 3/5 — Staging assets for Remotion...')
  const stagedManimVideos = await stageAssetsForRemotion(manimPaths, manifest.manimScenes, brief.airtableId, log)

  // Stage talking head clips into remotion/public too
  const stagedTalkingHeads: Record<number, string> = {}
  const thPublic = join(ROOT, 'remotion', 'public', 'talking-heads', brief.airtableId)
  if (Object.keys(talkingHeads).length > 0) {
    await mkdir(thPublic, { recursive: true })
    for (const [idx, srcPath] of Object.entries(talkingHeads)) {
      const destName = `scene_${idx}.mp4`
      await copyFile(srcPath, join(thPublic, destName))
      stagedTalkingHeads[Number(idx)] = `talking-heads/${brief.airtableId}/${destName}`
    }
    log('success', `  ✅ Staged ${Object.keys(stagedTalkingHeads).length} talking head clips`)
  }

  // Stage narration to remotion/public so Remotion can serve it as staticFile()
  let stagedVoicePath: string | null = null
  if (voicePath) {
    const narrationPublic = join(ROOT, 'remotion', 'public', 'narration')
    await mkdir(narrationPublic, { recursive: true })
    const narrationDest = join(narrationPublic, `${brief.airtableId}.mp3`)
    await copyFile(voicePath, narrationDest)
    stagedVoicePath = `narration/${brief.airtableId}.mp3`
    log('info', `  📁 Staged narration → remotion/public`)
  }

  const remotionProps = {
    manifest,
    assets: {
      voicePath: stagedVoicePath,
      manimVideos: stagedManimVideos,
      backgroundVideos: bgPaths,
      talkingHeadVideos: stagedTalkingHeads,
    },
  }
  const assetMapPath = join(outDir, 'asset-map.json')
  await writeFile(assetMapPath, JSON.stringify(remotionProps, null, 2))
  log('success', `  ✅ Asset map → ${assetMapPath}`)

  // ── Step 4: Remotion render ─────────────────────────────────────────────
  log('info', '\n🎞 Step 4/5 — Remotion rendering...')
  const videoOut = join(outDir, `${brief.channel}_final.mp4`)
  try {
    await renderWithRemotion(remotionProps, brief.channel, videoOut, log)
    log('success', `  ✅ Video → ${videoOut}`)
  } catch (err) {
    log('warn', `  ⚠ Remotion render failed (assets still available): ${String(err).slice(0, 80)}`)
  }

  // ── Step 5: Update Airtable ─────────────────────────────────────────────
  log('info', '\n📤 Step 5/5 — Updating Airtable...')
  await setProductionStatus(brief.airtableId, 'Review Ready').catch(() => {})
  log('success', `\n🎉 Production complete!`)
  log('info', `  Output dir: ${outDir}`)
  log('info', `  Manifest:   ${outDir}/manifest.json`)
  if (voicePath) log('info', `  Voice:      ${voicePath}`)
  log('info', `  Diagrams:   ${manimPaths.filter(Boolean).length}/${manifest.manimScenes.length} rendered`)

  return { outDir, manifest, voicePath, manimPaths, videoOut }
}
