#!/usr/bin/env node
/**
 * SimpleNursing AI Studio — Production Dashboard (localhost:3004)
 *
 * tsx src/dashboard/server.ts
 *
 * API surface:
 *  GET  /api/briefs                  → Chad Airtable creative-approved briefs
 *  GET  /api/assets                  → local asset manifest (83 indexed assets)
 *  GET  /api/api-health              → live status for all connected AI APIs
 *  GET  /api/env                     → current .env keys (values masked)
 *  POST /api/env                     → save a key to .env
 *  POST /api/produce                 → trigger production for a brief (SSE log)
 *  GET  /api/produce/:id/stream      → SSE real-time production log
 *  POST /api/voice-preview           → synthesize short voice clip → base64 mp3
 *  POST /api/manim                   → render a Manim diagram → video path
 *  GET  /api/manim/:id/stream        → SSE manim render log
 *  GET  /api/local-asset             → serve a local asset file by absPath
 *  GET  /api/output                  → list output/ folder contents
 *  GET  /                            → React SPA
 */
import 'dotenv/config'
import http from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { readFile as readFileAsync, writeFile } from 'fs/promises'
import { join, extname, basename, relative } from 'path'
import { fetchCreativeApprovedBriefs, fetchBriefByRank } from '../client/airtable.js'
import { generateImage } from '../client/google-ai.js'
import { recordChoice, saveSession, getStats, getBestModels } from '../client/ab-preferences.js'
import type { ContentBrief } from '../types/brief.js'

const ASSETS_DIR = process.env.ASSETS_DIR ?? '/Users/anmolsam/Downloads/aistudio-assets'

const PORT = parseInt(process.env.DASHBOARD_PORT ?? '3004')
const ROOT = process.cwd()
const ENV_PATH = join(ROOT, '.env')
const OUTPUT_DIR = join(ROOT, 'output')

// ── Env management ────────────────────────────────────────────────────────────
function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {}
  const lines = readFileSync(ENV_PATH, 'utf8').split('\n')
  const result: Record<string, string> = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    result[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return result
}

function saveEnvKey(key: string, value: string) {
  const content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : ''
  const lines = content.split('\n')
  const idx = lines.findIndex(l => l.startsWith(key + '='))
  const newLine = `${key}=${value}`
  if (idx >= 0) lines[idx] = newLine
  else lines.push(newLine)
  writeFileSync(ENV_PATH, lines.join('\n'))
  process.env[key] = value
}

function maskEnv(env: Record<string, string>): Record<string, { masked: string; set: boolean }> {
  const result: Record<string, { masked: string; set: boolean }> = {}
  for (const [k, v] of Object.entries(env)) {
    const set = v.length > 0
    const masked = set ? v.slice(0, 6) + '••••••' + v.slice(-4) : ''
    result[k] = { masked, set }
  }
  return result
}

// ── In-memory streaming logs ──────────────────────────────────────────────────
type LogEntry = { ts: string; level: 'info' | 'warn' | 'error' | 'success'; msg: string }
const sessionLogs = new Map<string, LogEntry[]>()
const sseClients = new Map<string, http.ServerResponse[]>()

function pushLog(sessionId: string, level: LogEntry['level'], msg: string) {
  const entry: LogEntry = { ts: new Date().toISOString(), level, msg }
  if (!sessionLogs.has(sessionId)) sessionLogs.set(sessionId, [])
  sessionLogs.get(sessionId)!.push(entry)
  const clients = sseClients.get(sessionId) ?? []
  const data = `data: ${JSON.stringify(entry)}\n\n`
  clients.forEach(res => { try { res.write(data) } catch {} })
}

function sseEnd(sessionId: string) {
  const clients = sseClients.get(sessionId) ?? []
  clients.forEach(res => { try { res.write('data: {"done":true}\n\n'); res.end() } catch {} })
  sseClients.delete(sessionId)
}

function spawnLogged(sessionId: string, cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise(resolve => {
    const { spawn } = require('child_process')
    const child = spawn(cmd, args, { cwd, env: { ...process.env } })
    const strip = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, '').trim()
    child.stdout?.on('data', (d: Buffer) => {
      strip(d.toString()).split('\n').filter(Boolean).forEach(line => {
        const level: LogEntry['level'] = /✅|✓|success/i.test(line) ? 'success'
          : /✗|error|fatal/i.test(line) ? 'error'
          : /⚠|warn/i.test(line) ? 'warn' : 'info'
        pushLog(sessionId, level, line)
      })
    })
    child.stderr?.on('data', (d: Buffer) => {
      strip(d.toString()).split('\n').filter(Boolean).forEach(l => pushLog(sessionId, 'error', l))
    })
    child.on('close', (code: number) => resolve(code ?? 0))
  })
}

// ── API checks ────────────────────────────────────────────────────────────────
async function checkGoogle() {
  const key = process.env.GOOGLE_AI_KEY
  if (!key) return { ok: false, error: 'GOOGLE_AI_KEY not set' }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json() as any
  const models = (data.models ?? []).map((m: any) => m.name as string)
  return { ok: true, hasVeo: models.some(m => m.includes('veo')), hasImagen: models.some(m => m.includes('imagen')) }
}

async function checkFishAudio() {
  const key = process.env.FISH_AUDIO_API_KEY
  if (!key) return { ok: false, error: 'FISH_AUDIO_API_KEY not set' }
  const res = await fetch('https://api.fish.audio/v1/wallet/balance', {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (res.status === 401) return { ok: false, error: 'Invalid API key' }
  // 402 = valid key, insufficient balance
  if (res.status === 402) return { ok: false, keyValid: true, needsCredits: true, error: 'Add credits at fish.audio/go-api' }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json() as any
  const balance = data.balance ?? 0
  return { ok: balance > 0, balance, needsCredits: balance <= 0 }
}

async function checkAirtable() {
  const key = process.env.AIRTABLE_API_KEY
  if (!key) return { ok: false, error: 'AIRTABLE_API_KEY not set' }
  const res = await fetch('https://api.airtable.com/v0/appLFh438nLooz6u7/tbl5P3J8agdY4gNtT?maxRecords=1', {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true }
}

async function checkRunway() {
  const key = process.env.RUNWAY_API_KEY
  if (!key) return { ok: false, error: 'Set RUNWAY_API_KEY in Settings' }
  const res = await fetch('https://api.dev.runwayml.com/v1/models', {
    headers: { Authorization: `Bearer ${key}`, 'X-Runway-Version': '2024-11-06' }
  })
  return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` }
}

async function checkElevenLabs() {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return { ok: false, error: 'Set ELEVENLABS_API_KEY in Settings' }
  const res = await fetch('https://api.elevenlabs.io/v1/user', {
    headers: { 'xi-api-key': key }
  })
  return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` }
}

async function checkKling() {
  const key = process.env.KLING_API_KEY
  if (!key) return { ok: false, error: 'Set KLING_API_KEY in Settings' }
  const res = await fetch('https://api.klingai.com/v1/account/costs', {
    headers: { Authorization: `Bearer ${key}` }
  }).catch(() => null)
  return { ok: !!res?.ok, error: res?.ok ? undefined : 'Check KLING_API_KEY' }
}

async function checkFlux() {
  const key = process.env.FLUX_API_KEY ?? process.env.BFL_API_KEY
  if (!key) return { ok: false, error: 'Set FLUX_API_KEY in Settings' }
  const res = await fetch('https://api.bfl.ai/v1/models', {
    headers: { 'x-key': key }
  }).catch(() => null)
  return { ok: !!res?.ok, error: res?.ok ? undefined : 'Check FLUX_API_KEY' }
}

async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { ok: false, error: 'Set OPENAI_API_KEY in Settings' }
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` }
  }).catch(() => null)
  return { ok: !!res?.ok, error: res?.ok ? undefined : 'Check OPENAI_API_KEY' }
}

// ── Browse local assets folder ─────────────────────────────────────────────────
function browseAssets(dir: string = ASSETS_DIR) {
  const VIDEO_EXT = new Set(['.mp4','.mov','.avi','.mkv','.webm'])
  const IMAGE_EXT = new Set(['.png','.jpg','.jpeg','.svg','.gif','.webp'])

  function walk(d: string): any[] {
    const items: any[] = []
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const full = join(d, entry.name)
        if (entry.isDirectory()) {
          items.push({ name: entry.name, type: 'folder', path: full, children: walk(full) })
        } else {
          const ext = extname(entry.name).toLowerCase()
          const mediaType = VIDEO_EXT.has(ext) ? 'video' : IMAGE_EXT.has(ext) ? 'image' : null
          if (!mediaType) continue
          const st = statSync(full)
          items.push({ name: entry.name, type: mediaType, path: full, size: st.size, ext })
        }
      }
    } catch {}
    return items
  }
  return { root: ASSETS_DIR, tree: walk(dir) }
}

// ── A/B image generation ──────────────────────────────────────────────────────
async function handleGenerateAB(body: { brief: ContentBrief; prompt?: string }) {
  const { brief } = body
  const sessionId = `ab_${Date.now()}`

  const prompt = body.prompt ?? [
    `Pinterest educational pin for nursing students.`,
    `Title: "${brief.title}"`,
    `Key message: "${brief.hook}"`,
    `Vertical 2:3 format. Bold headline, infographic-style layout, text-forward.`,
    `SimpleNursing brand: teal #00709c, light blue #75c7e6, pink accent #fc3467.`,
    `Professional nursing education. High contrast, mobile-optimized, save-worthy.`,
    `NO watermarks, NO logos, NO URLs.`,
  ].join(' ')

  const models = getBestModels(3)

  // Run all models in parallel — each returns base64 or error
  const results = await Promise.all(models.map(async (model) => {
    const start = Date.now()
    try {
      let buf: Buffer
      if (model === 'imagen4') {
        buf = await generateImage({ prompt, aspectRatio: '2:3' })
      } else if (model === 'flux-pro') {
        const { generateFlux } = await import('../client/flux.js')
        buf = await generateFlux({ prompt, aspectRatio: '2:3' })
      } else {
        const { generateDalle } = await import('../client/openai-image.js')
        buf = await generateDalle({ prompt, size: '1024x1792' })
      }
      return { model, imageB64: buf.toString('base64'), durationMs: Date.now() - start }
    } catch (err) {
      return { model, imageB64: '', durationMs: Date.now() - start, error: String(err) }
    }
  }))

  saveSession({
    sessionId,
    briefId: brief.airtableId,
    channel: brief.channel,
    prompt,
    results,
    createdAt: new Date().toISOString(),
  })

  return { sessionId, results: results.map(r => ({ ...r, imageB64: r.imageB64.slice(0, 50) !== '' ? r.imageB64 : '' })) }
}

function handleAbChoice(body: { sessionId: string; winner: string }) {
  recordChoice(body.sessionId, body.winner as any)
  return { ok: true, stats: getStats() }
}

async function checkManim() {
  const { execSync } = await import('child_process')
  for (const cmd of ['manim', '/Users/anmolsam/.local/bin/manim']) {
    try {
      const v = execSync(`${cmd} --version 2>&1`, { timeout: 5000 }).toString().trim()
      return { ok: true, version: v.split('\n')[0] }
    } catch {}
  }
  return { ok: false, error: 'manim not installed — run: uv tool install manim' }
}

// ── Voice preview ─────────────────────────────────────────────────────────────
async function handleVoicePreview(body: { text: string; voiceId?: string }) {
  const key = process.env.FISH_AUDIO_API_KEY
  if (!key) throw new Error('FISH_AUDIO_API_KEY not set')

  const referenceId = body.voiceId ?? '5b58f42b6fc5420f95c4b65ef9d69655'
  const text = body.text.slice(0, 200)

  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, reference_id: referenceId, format: 'mp3', latency: 'normal' }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Fish Audio ${res.status}: ${err.slice(0, 200)}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return { audio: buf.toString('base64'), format: 'mp3', bytes: buf.length }
}

// ── Manim diagram render ──────────────────────────────────────────────────────
async function handleManimRender(body: { topic: string; style?: string; scene?: string }) {
  const sessionId = `manim_${Date.now()}`
  sessionLogs.set(sessionId, [])
  const outDir = join(ROOT, 'output', 'manim')
  mkdirSync(outDir, { recursive: true })

  const scriptPath = join(outDir, `scene_${sessionId}.py`)
  const scene = body.scene ?? generateManimScene(body.topic, body.style ?? 'educational')
  await writeFile(scriptPath, scene)

  ;(async () => {
    pushLog(sessionId, 'info', `🎬 Rendering Manim scene: "${body.topic}"`)
    pushLog(sessionId, 'info', `Script saved → ${scriptPath}`)
    const manimBin = existsSync('/Users/anmolsam/.local/bin/manim') ? '/Users/anmolsam/.local/bin/manim' : 'manim'
    const code = await spawnLogged(
      sessionId,
      manimBin,
      ['-pql', '--output_file', `${sessionId}.mp4`, scriptPath, 'MainScene'],
      outDir
    )
    if (code === 0) {
      const videoPath = join(outDir, 'media', 'videos', `scene_${sessionId}`, '480p15', `${sessionId}.mp4`)
      pushLog(sessionId, 'success', `✅ Manim render complete`)
      pushLog(sessionId, 'info', `Video → ${videoPath}`)
    } else {
      pushLog(sessionId, 'error', `Manim exited with code ${code}`)
    }
    sseEnd(sessionId)
  })()

  return { sessionId, scriptPath }
}

function generateManimScene(topic: string, style: string): string {
  return `from manim import *

class MainScene(Scene):
    def construct(self):
        # SimpleNursing brand colors
        SN_TEAL   = "#00709c"
        SN_BLUE   = "#75c7e6"
        SN_PINK   = "#fc3467"
        SN_YELLOW = "#fad74f"

        title = Text("${topic.replace(/"/g, '\\"')}", font_size=48, color=SN_YELLOW)
        title.to_edge(UP, buff=0.5)
        self.play(Write(title), run_time=1.5)

        # Content area
        bg = RoundedRectangle(width=10, height=5, corner_radius=0.3,
                              fill_color=SN_TEAL, fill_opacity=0.15,
                              stroke_color=SN_TEAL, stroke_width=2)
        bg.shift(DOWN * 0.5)
        self.play(Create(bg))

        content = Text(
            "SimpleNursing Educational Content\\n${style}",
            font_size=32, color=WHITE, line_spacing=1.4
        )
        self.play(Write(content), run_time=2)
        self.wait(2)
`
}

// ── Output listing ────────────────────────────────────────────────────────────
function listOutput() {
  if (!existsSync(OUTPUT_DIR)) return []
  const items: any[] = []
  for (const entry of readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = join(OUTPUT_DIR, entry.name)
      for (const f of readdirSync(sub, { withFileTypes: true })) {
        if (!f.isDirectory()) {
          const full = join(sub, f.name)
          const st = statSync(full)
          items.push({ folder: entry.name, file: f.name, path: full, size: st.size, mtime: st.mtime })
        }
      }
    }
  }
  return items.sort((a, b) => b.mtime - a.mtime).slice(0, 50)
}

// ── Produce trigger ───────────────────────────────────────────────────────────
async function triggerProduction(body: { rank?: number }) {
  const sessionId = `prod_${Date.now()}`
  sessionLogs.set(sessionId, [])

  ;(async () => {
    try {
      pushLog(sessionId, 'info', '🎬 Production session started')
      const args = ['src/produce-now.ts']
      if (body.rank) args.push('--rank', String(body.rank))
      const code = await spawnLogged(sessionId, join(ROOT, 'node_modules/.bin/tsx'), args, ROOT)
      if (code === 0) pushLog(sessionId, 'success', '\n🎉 Done! Check output/ folder.')
      else pushLog(sessionId, 'error', `Producer exited with code ${code}`)
    } catch (err) {
      pushLog(sessionId, 'error', `Fatal: ${String(err)}`)
    }
    sseEnd(sessionId)
  })()

  return { sessionId }
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const path = url.pathname

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  try {
    if (path === '/api/briefs' && req.method === 'GET') {
      return json(res, await fetchCreativeApprovedBriefs())
    }
    if (path === '/api/assets' && req.method === 'GET') {
      const mp = join(ROOT, '.asset-manifest.json')
      if (!existsSync(mp)) return json(res, { assets: [], total: 0 })
      const m = JSON.parse(await readFileAsync(mp, 'utf8'))
      const assets = m.assets.filter((a: any) => a.analysis)
      return json(res, { assets, total: assets.length, indexedAt: m.indexedAt })
    }
    if (path === '/api/api-health' && req.method === 'GET') {
      const checks = await Promise.allSettled([
        checkGoogle(), checkFishAudio(), checkAirtable(), checkRunway(),
        checkElevenLabs(), checkKling(), checkManim(), checkFlux(), checkOpenAI(),
      ])
      const pick = (r: PromiseSettledResult<any>) =>
        r.status === 'fulfilled' ? r.value : { ok: false, error: String((r as any).reason) }
      return json(res, {
        google: pick(checks[0]), fishAudio: pick(checks[1]), airtable: pick(checks[2]),
        runway: pick(checks[3]), elevenlabs: pick(checks[4]), kling: pick(checks[5]),
        manim: pick(checks[6]), flux: pick(checks[7]), openai: pick(checks[8]),
      })
    }
    if (path === '/api/browse-assets' && req.method === 'GET') {
      return json(res, browseAssets())
    }
    if (path === '/api/generate-ab' && req.method === 'POST') {
      const body = await readBody(req)
      return json(res, await handleGenerateAB(body))
    }
    if (path === '/api/ab-choice' && req.method === 'POST') {
      const body = await readBody(req)
      return json(res, handleAbChoice(body))
    }
    if (path === '/api/ab-stats' && req.method === 'GET') {
      return json(res, { stats: getStats(), bestModels: getBestModels(2) })
    }
    if (path === '/api/env' && req.method === 'GET') {
      return json(res, maskEnv(readEnv()))
    }
    if (path === '/api/env' && req.method === 'POST') {
      const body = await readBody(req)
      if (!body.key || typeof body.value !== 'string') return error(res, 400, 'key and value required')
      saveEnvKey(body.key, body.value)
      return json(res, { ok: true })
    }
    if (path === '/api/produce' && req.method === 'POST') {
      const body = await readBody(req)
      return json(res, await triggerProduction(body))
    }
    if (path === '/api/voice-preview' && req.method === 'POST') {
      const body = await readBody(req)
      return json(res, await handleVoicePreview(body))
    }
    if (path === '/api/manim' && req.method === 'POST') {
      const body = await readBody(req)
      return json(res, await handleManimRender(body))
    }
    if (path === '/api/output' && req.method === 'GET') {
      return json(res, listOutput())
    }
    if (path === '/api/local-asset' && req.method === 'GET') {
      const assetPath = url.searchParams.get('path') ?? ''
      if (!assetPath || !existsSync(assetPath)) return error(res, 404, 'not found')
      const ext = extname(assetPath).toLowerCase()
      const mime: Record<string, string> = {
        '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
        '.svg':'image/svg+xml','.mp4':'video/mp4','.mp3':'audio/mpeg','.webm':'video/webm'
      }
      res.writeHead(200, { 'Content-Type': mime[ext] ?? 'application/octet-stream' })
      const { createReadStream } = await import('fs')
      createReadStream(assetPath).pipe(res)
      return
    }

    // SSE streams
    const sseMatch = path.match(/^\/api\/(produce|manim)\/([^/]+)\/stream$/)
    if (sseMatch && req.method === 'GET') {
      const sessionId = sseMatch[2]
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      const buffered = sessionLogs.get(sessionId) ?? []
      buffered.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`))
      if (!sseClients.has(sessionId)) sseClients.set(sessionId, [])
      sseClients.get(sessionId)!.push(res)
      req.on('close', () => {
        const clients = sseClients.get(sessionId) ?? []
        const idx = clients.indexOf(res)
        if (idx >= 0) clients.splice(idx, 1)
      })
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(getSPA())
  } catch (err) {
    console.error(err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: String(err) }))
  }
})

function json(res: http.ServerResponse, data: unknown) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}
function error(res: http.ServerResponse, code: number, msg: string) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: msg }))
}
async function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', c => data += c)
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
    req.on('error', reject)
  })
}

server.listen(PORT, () => {
  console.log(`\n  🎬 AI Studio Dashboard → http://localhost:${PORT}`)
  console.log(`  📺 Remotion Preview  → http://localhost:3003`)
  console.log(`  📋 Airtable briefs + assets + voice + Manim + Settings\n`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// SPA — React via CDN (no build step)
// ═══════════════════════════════════════════════════════════════════════════════
function getSPA(): string { return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SimpleNursing AI Studio</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{sn:{teal:'#00709c',blue:'#75c7e6',pink:'#fc3467',yellow:'#fad74f',dark:'#282323',navy:'#005374'}}}}}</script>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>
  body{background:#0f1117;color:#e2e8f0;font-family:'Inter',system-ui,sans-serif}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#1a1f2e}::-webkit-scrollbar-thumb{background:#2d3748;border-radius:3px}
  .log-info{color:#94a3b8}.log-success{color:#4ade80}.log-warn{color:#fbbf24}.log-error{color:#f87171}
  .pulse{animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .card{background:#1a1f2e;border:1px solid #2d3748;border-radius:12px;padding:16px;transition:border-color .2s}
  .card:hover{border-color:#00709c}
  .btn{font-weight:700;padding:8px 18px;border-radius:10px;transition:all .15s;cursor:pointer;border:none;font-size:13px}
  .btn-teal{background:#00709c;color:#fff}.btn-teal:hover{background:#0088bb}
  .btn-pink{background:#fc3467;color:#fff}.btn-pink:hover{background:#e02558}
  .btn-ghost{background:#2d3748;color:#e2e8f0}.btn-ghost:hover{background:#3d4a5e}
  input,textarea,select{background:#1a1f2e;border:1px solid #2d3748;border-radius:8px;color:#e2e8f0;padding:8px 12px;width:100%;font-size:13px;outline:none}
  input:focus,textarea:focus{border-color:#00709c}
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const {useState,useEffect,useRef,useCallback,useMemo}=React;

const api={
  get:(p)=>fetch(p).then(r=>r.json()),
  post:(p,b)=>fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()),
};

// ── Channel pill ──────────────────────────────────────────────────────────────
const CH={pinterest:'bg-red-600',instagram:'bg-purple-600',tiktok:'bg-neutral-700 border border-gray-500',youtube:'bg-red-800'};
function ChBadge({ch}){return <span className={\`\${CH[ch]??'bg-gray-600'} text-white text-xs font-bold px-2 py-0.5 rounded uppercase\`}>{ch}</span>}

// ── API health dot ─────────────────────────────────────────────────────────────
function Dot({ok}){return <span className={\`inline-block w-2.5 h-2.5 rounded-full mr-2 \${ok?'bg-green-400':'bg-red-500'}\`}/>}

// ── SSE log stream ─────────────────────────────────────────────────────────────
function useSSE(sessionId){
  const [logs,setLogs]=useState([]);
  const [done,setDone]=useState(false);
  const bottomRef=useRef(null);
  useEffect(()=>{
    if(!sessionId)return;
    setLogs([]);setDone(false);
    const es=new EventSource(\`/api/produce/\${sessionId}/stream\`);
    es.onmessage=e=>{const d=JSON.parse(e.data);if(d.done){setDone(true);es.close();}else setLogs(p=>[...p,d]);};
    es.onerror=()=>es.close();
    return ()=>es.close();
  },[sessionId]);
  useEffect(()=>bottomRef.current?.scrollIntoView({behavior:'smooth'}),[logs]);
  return {logs,done,bottomRef};
}

// ── Log Modal ─────────────────────────────────────────────────────────────────
function LogModal({sessionId,title,onClose}){
  const {logs,done,bottomRef}=useSSE(sessionId);
  return(
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-600 rounded-2xl w-full max-w-3xl h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold">{title||'Production Log'}</span>
            {!done&&<span className="text-xs text-yellow-400 pulse">● running</span>}
            {done&&<span className="text-xs text-green-400">● done</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-px">
          {logs.map((l,i)=><div key={i} className={\`log-\${l.level}\`}>{l.msg}</div>)}
          <div ref={bottomRef}/>
        </div>
        {done&&<div className="p-4 border-t border-gray-700 flex gap-3">
          <a href="http://localhost:3003" target="_blank" className="btn btn-teal text-sm">📺 Open Remotion Studio</a>
          <button onClick={onClose} className="btn btn-ghost text-sm">Close</button>
        </div>}
      </div>
    </div>
  );
}

// ── Brief Card ─────────────────────────────────────────────────────────────────
function BriefCard({brief,onSelect,selected}){
  return(
    <div onClick={()=>onSelect(brief)}
      className={\`card cursor-pointer \${selected?'border-sn-teal bg-sn-navy/30':''}\`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-sn-yellow font-bold text-sm">#{brief.rank}</span>
        <ChBadge ch={brief.channel}/>
        <span className="text-green-400 text-xs font-semibold ml-auto">Score {brief.score}</span>
      </div>
      <div className="text-white font-semibold text-sm leading-tight mb-1">{brief.title}</div>
      <div className="text-gray-400 text-xs line-clamp-2">{brief.hook}</div>
    </div>
  );
}

// ── Voice Preview ──────────────────────────────────────────────────────────────
function VoicePanel({brief}){
  const [text,setText]=useState(brief?.hook||'');
  const [loading,setLoading]=useState(false);
  const [audioSrc,setAudioSrc]=useState('');
  const [err,setErr]=useState('');
  useEffect(()=>setText(brief?.hook||''),[brief]);

  async function preview(){
    setLoading(true);setErr('');setAudioSrc('');
    try{
      const r=await api.post('/api/voice-preview',{text:text.slice(0,200)});
      if(r.error)throw new Error(r.error);
      setAudioSrc(\`data:audio/mp3;base64,\${r.audio}\`);
    }catch(e){setErr(String(e));}
    setLoading(false);
  }
  return(
    <div className="space-y-3">
      <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Voice Preview — Nurse Mike</div>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={4}
        placeholder="Type or paste text to hear Nurse Mike speak..." className="text-sm resize-none"/>
      <div className="flex gap-2 items-center">
        <button onClick={preview} disabled={loading||!text} className="btn btn-teal">
          {loading?'Generating...':'🎙 Preview Voice'}
        </button>
        <span className="text-gray-500 text-xs">{text.length}/200 chars</span>
      </div>
      {err&&<div className="text-red-400 text-xs">{err}</div>}
      {audioSrc&&<div>
        <div className="text-gray-400 text-xs mb-1">▶ Click to play</div>
        <audio controls src={audioSrc} className="w-full"/>
      </div>}
    </div>
  );
}

// ── Manim Panel ────────────────────────────────────────────────────────────────
function ManimPanel({brief}){
  const [topic,setTopic]=useState(brief?.title||'');
  const [sessionId,setSessionId]=useState('');
  const [loading,setLoading]=useState(false);
  const [customScript,setCustomScript]=useState('');
  const [showScript,setShowScript]=useState(false);
  useEffect(()=>setTopic(brief?.title||''),[brief]);

  async function renderManim(){
    setLoading(true);
    const body={topic,style:'educational nursing diagram'};
    if(customScript)body.scene=customScript;
    const r=await api.post('/api/manim',body);
    setSessionId(r.sessionId);
    setLoading(false);
  }
  return(
    <div className="space-y-3">
      <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Manim Animated Diagrams</div>
      <div className="text-gray-500 text-xs">Generate mathematical/educational animations like 3Blue1Brown for nursing content.</div>
      <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Diagram topic e.g. 'How ACE Inhibitors work'"/>
      <div className="flex gap-2">
        <button onClick={renderManim} disabled={loading||!topic} className="btn btn-teal">
          {loading?'Rendering...':'🎬 Render Diagram'}
        </button>
        <button onClick={()=>setShowScript(!showScript)} className="btn btn-ghost">
          {showScript?'Hide':'Custom Python'}
        </button>
      </div>
      {showScript&&<textarea value={customScript} onChange={e=>setCustomScript(e.target.value)}
        rows={8} placeholder="Paste custom Manim Python scene here..." className="font-mono text-xs"/>}
      {sessionId&&<LogModal sessionId={sessionId} title="Manim Render" onClose={()=>setSessionId('')}/>}
    </div>
  );
}

// ── Settings Panel ─────────────────────────────────────────────────────────────
const API_KEYS=[
  // Image generation (A/B tested for Pinterest)
  {key:'GOOGLE_AI_KEY',label:'Google AI — Imagen4 + Veo3',hint:'aistudio.google.com → API keys',tag:'images+video'},
  {key:'FLUX_API_KEY',label:'Flux Pro 1.1 Ultra (BFL)',hint:'api.bfl.ai — best for Pinterest',tag:'images'},
  {key:'OPENAI_API_KEY',label:'OpenAI DALL-E 3 HD',hint:'platform.openai.com/api-keys',tag:'images'},
  // Video generation
  {key:'KLING_API_KEY',label:'Kling AI — text-to-video',hint:'klingai.com/api',tag:'video'},
  {key:'RUNWAY_API_KEY',label:'Runway Gen-3 Alpha',hint:'app.runwayml.com',tag:'video'},
  {key:'LUMA_API_KEY',label:'Luma Dream Machine',hint:'lumalabs.ai/api',tag:'video'},
  // Voice
  {key:'FISH_AUDIO_API_KEY',label:'Fish Audio — Nurse Mike voice',hint:'fish.audio/go-api — needs $2 credits',tag:'voice'},
  {key:'ELEVENLABS_API_KEY',label:'ElevenLabs (alt voice)',hint:'elevenlabs.io/app/api',tag:'voice'},
  // Platform
  {key:'ANTHROPIC_API_KEY',label:'Claude — script analysis',hint:'console.anthropic.com',tag:'AI'},
  {key:'AIRTABLE_API_KEY',label:'Airtable — Chad briefs',hint:'airtable.com/create/tokens',tag:'data'},
];

function SettingsPanel(){
  const [envData,setEnvData]=useState({});
  const [editing,setEditing]=useState({});
  const [saving,setSaving]=useState('');
  useEffect(()=>{api.get('/api/env').then(setEnvData);},[]);

  async function save(key){
    setSaving(key);
    await api.post('/api/env',{key,value:editing[key]??''});
    const fresh=await api.get('/api/env');
    setEnvData(fresh);
    setEditing(e=>({...e,[key]:undefined}));
    setSaving('');
  }
  return(
    <div className="space-y-3">
      <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">API Keys — saved to .env</div>
      {API_KEYS.map(({key,label,hint})=>{
        const info=envData[key];
        const isEditing=editing[key]!==undefined;
        return(
          <div key={key} className="card">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <div className="text-white text-sm font-semibold">{label}</div>
                <div className="text-gray-500 text-xs">{hint}</div>
              </div>
              <span className={\`text-xs font-bold px-2 py-0.5 rounded-full \${info?.set?'bg-green-900 text-green-300':'bg-red-900 text-red-300'}\`}>
                {info?.set?'SET':'MISSING'}
              </span>
            </div>
            {info?.set&&!isEditing&&(
              <div className="flex items-center gap-2 mt-2">
                <code className="text-gray-400 text-xs bg-gray-800 px-2 py-1 rounded flex-1">{info.masked}</code>
                <button onClick={()=>setEditing(e=>({...e,[key]:''}))} className="btn btn-ghost text-xs py-1 px-3">Update</button>
              </div>
            )}
            {(!info?.set||isEditing)&&(
              <div className="flex gap-2 mt-2">
                <input type="password" value={editing[key]??''} onChange={e=>setEditing(v=>({...v,[key]:e.target.value}))}
                  placeholder={\`Paste \${key}...\`} className="text-xs flex-1"/>
                <button onClick={()=>save(key)} disabled={saving===key} className="btn btn-teal text-xs py-1 px-3">
                  {saving===key?'Saving...':'Save'}
                </button>
                {isEditing&&<button onClick={()=>setEditing(e=>({...e,[key]:undefined}))} className="btn btn-ghost text-xs py-1 px-3">✕</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── API Health ─────────────────────────────────────────────────────────────────
function HealthPanel({health,loading}){
  if(loading)return <div className="text-gray-400 text-sm pulse">Checking APIs...</div>;
  const services=[
    {id:'google',label:'Google AI',tag:'Images+Video',sub:health?.google?.ok?'Veo3 ✓  Imagen4 ✓':'Add billing — aistudio.google.com'},
    {id:'fishAudio',label:'Fish Audio',tag:'Voice',sub:health?.fishAudio?.ok?'Voice ready':health?.fishAudio?.keyValid?'⚠ Add credits fish.audio/go-api':'Add FISH_AUDIO_API_KEY'},
    {id:'flux',label:'Flux Pro',tag:'Images',sub:health?.flux?.ok?'BFL API ready':'Add FLUX_API_KEY in Settings'},
    {id:'openai',label:'DALL-E 3',tag:'Images',sub:health?.openai?.ok?'OpenAI ready':'Add OPENAI_API_KEY in Settings'},
    {id:'airtable',label:'Airtable',tag:'Briefs',sub:health?.airtable?.ok?'Chad briefs connected':'Check AIRTABLE_API_KEY'},
    {id:'runway',label:'Runway',tag:'Video',sub:health?.runway?.ok?'Gen-3 Alpha':'Add RUNWAY_API_KEY'},
    {id:'kling',label:'Kling AI',tag:'Video',sub:health?.kling?.ok?'Ready':'Add KLING_API_KEY'},
    {id:'elevenlabs',label:'ElevenLabs',tag:'Voice',sub:health?.elevenlabs?.ok?'Voice ready':'Add ELEVENLABS_API_KEY'},
    {id:'manim',label:'Manim',tag:'Diagrams',sub:health?.manim?.ok?'v0.20.1 ready':'uv tool install manim'},
  ];
  return(
    <div className="space-y-2">
      {services.map(s=>(
        <div key={s.id} className="card flex items-center gap-2 py-2">
          <Dot ok={health?.[s.id]?.ok}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-semibold">{s.label}</span>
              <span className="text-gray-500 text-xs bg-gray-700 px-1.5 rounded">{s.tag}</span>
            </div>
            <div className="text-gray-400 text-xs truncate">{s.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Asset Grid ─────────────────────────────────────────────────────────────────
function FolderTree({nodes,depth=0}){
  const [expanded,setExpanded]=useState({});
  if(!nodes?.length)return null;
  return nodes.map((n,i)=>{
    if(n.type==='folder') return(
      <div key={i}>
        <div onClick={()=>setExpanded(e=>({...e,[n.path]:!e[n.path]}))}
          className="flex items-center gap-1.5 cursor-pointer hover:text-white text-gray-300 py-0.5 text-xs"
          style={{paddingLeft:depth*12+4}}>
          <span>{expanded[n.path]?'▾':'▸'}</span>
          <span>📁</span>
          <span className="font-medium">{n.name}</span>
          <span className="text-gray-600 ml-auto">{(n.children||[]).filter(c=>c.type!=='folder').length}</span>
        </div>
        {expanded[n.path]&&<FolderTree nodes={n.children} depth={depth+1}/>}
      </div>
    );
    const icon=n.type==='video'?'🎬':'🖼';
    const url=\`/api/local-asset?path=\${encodeURIComponent(n.path)}\`;
    return(
      <div key={i} onClick={()=>window.open(url,'_blank')}
        className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-700 rounded px-1 py-0.5 text-xs group"
        style={{paddingLeft:depth*12+8}}>
        <span>{icon}</span>
        <span className="text-gray-300 group-hover:text-white truncate flex-1">{n.name}</span>
        <span className="text-gray-600 shrink-0">{n.size>1e6?(n.size/1e6).toFixed(1)+'M':(n.size/1024).toFixed(0)+'K'}</span>
      </div>
    );
  });
}

function AssetGrid({assets}){
  const [view,setView]=useState('folder');
  const [filter,setFilter]=useState('all');
  const [folderTree,setFolderTree]=useState(null);
  useEffect(()=>{if(view==='folder')api.get('/api/browse-assets').then(d=>setFolderTree(d.tree));},[view]);

  const filtered=useMemo(()=>assets.filter(a=>(filter==='all')||a.analysis?.channel===filter),[assets,filter]);
  return(
    <div>
      <div className="flex gap-1.5 mb-3">
        <button onClick={()=>setView('folder')} className={\`text-xs px-2.5 py-1 rounded font-semibold \${view==='folder'?'bg-sn-teal text-white':'bg-gray-700 text-gray-300'}\`}>📁 Folder</button>
        <button onClick={()=>setView('indexed')} className={\`text-xs px-2.5 py-1 rounded font-semibold \${view==='indexed'?'bg-sn-teal text-white':'bg-gray-700 text-gray-300'}\`}>🔍 Indexed</button>
      </div>

      {view==='folder'&&(
        <div className="max-h-[65vh] overflow-y-auto bg-gray-800 rounded-xl p-2">
          {!folderTree&&<div className="text-gray-500 text-xs pulse p-2">Loading folder...</div>}
          {folderTree&&<FolderTree nodes={folderTree}/>}
        </div>
      )}

      {view==='indexed'&&<>
        <div className="flex gap-1 mb-2 flex-wrap">
          {['all','tiktok','instagram','youtube','pinterest'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              className={\`text-xs px-2 py-0.5 rounded-full font-semibold transition-colors \${filter===f?'bg-sn-teal text-white':'bg-gray-700 text-gray-300'}\`}>
              {f}
            </button>
          ))}
          <span className="text-gray-500 text-xs self-center ml-auto">{filtered.length}</span>
        </div>
        <div className="space-y-1 max-h-[55vh] overflow-y-auto">
          {filtered.map((a,i)=>(
            <div key={i} className="flex items-center gap-2 hover:bg-gray-700 rounded px-2 py-1.5 cursor-pointer text-xs group"
              onClick={()=>window.open(\`/api/local-asset?path=\${encodeURIComponent(a.absPath)}\`,'_blank')}>
              <span>{a.type==='video'?'🎬':'🖼'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-gray-200 group-hover:text-white truncate">{a.analysis?.title||a.filename}</div>
                <div className="text-gray-500 flex gap-1">
                  {a.analysis?.channel&&<span>{a.analysis.channel}</span>}
                  {a.analysis?.format&&<span>· {a.analysis.format}</span>}
                  {a.analysis?.qualityScore&&<span>· Q{a.analysis.qualityScore}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}

// ── Characters Panel ───────────────────────────────────────────────────────────
function CharactersPanel(){
  const poses=['1','2','3','4','5','6','7','8'];
  const labels=['Talking','Pointing','Open Arms','Celebrate','Sad','Idle','Pose 7','Pose 8'];
  return(
    <div>
      <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Nurse Mike — 8 SVG Poses</div>
      <div className="text-gray-500 text-xs mb-3">These SVGs are live in Remotion compositions. View in Remotion Studio to see animated spring physics.</div>
      <div className="grid grid-cols-4 gap-2">
        {poses.map((p,i)=>(
          <div key={p} className="card text-center cursor-pointer hover:border-sn-blue"
            onClick={()=>window.open(\`http://localhost:3003\`,'_blank')}>
            <img src={\`/api/local-asset?path=\${encodeURIComponent('/Users/anmolsam/aistudio/remotion/public/mike_svg_'+p+'.svg')}\`}
              className="w-full object-contain rounded mb-2" style={{height:120}} alt={\`Mike pose \${p}\`}
              onError={e=>{e.target.style.display='none'}}/>
            <div className="text-gray-300 text-xs font-semibold">{labels[i]}</div>
            <div className="text-gray-500 text-xs">mike_svg_{p}.svg</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Output Files ───────────────────────────────────────────────────────────────
function OutputPanel(){
  const [files,setFiles]=useState([]);
  useEffect(()=>{api.get('/api/output').then(setFiles);},[]);
  const refresh=()=>api.get('/api/output').then(setFiles);
  if(files.length===0)return(
    <div className="text-center py-12">
      <div className="text-4xl mb-3">📁</div>
      <div className="text-gray-400">No output files yet</div>
      <div className="text-gray-500 text-sm mt-1">Produce a brief to see videos + images here</div>
      <button onClick={refresh} className="btn btn-ghost text-xs mt-3">Refresh</button>
    </div>
  );
  return(
    <div>
      <div className="flex justify-between items-center mb-3">
        <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{files.length} output files</div>
        <button onClick={refresh} className="btn btn-ghost text-xs py-1 px-3">↺ Refresh</button>
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {files.map((f,i)=>{
          const isVideo=f.file.endsWith('.mp4')||f.file.endsWith('.webm');
          const isImg=f.file.match(/\\.(png|jpg|jpeg|svg)$/i);
          const url=\`/api/local-asset?path=\${encodeURIComponent(f.path)}\`;
          return(
            <div key={i} className="card flex items-center gap-3">
              <div className={\`text-2xl \${isVideo?'':'text-purple-400'}\`}>{isVideo?'🎬':isImg?'🖼':'🎙'}</div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{f.file}</div>
                <div className="text-gray-500 text-xs">{f.folder} · {(f.size/1024/1024).toFixed(1)}MB</div>
              </div>
              <a href={url} target="_blank" className="btn btn-ghost text-xs py-1 px-3 shrink-0">Open</a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Script & Production Plan ───────────────────────────────────────────────────
function ScriptPanel({brief,onProduce}){
  if(!brief)return(
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="text-5xl mb-4">🎬</div>
      <div className="text-gray-400 text-lg font-semibold mb-2">Select a brief from the left</div>
      <div className="text-gray-500 text-sm">Briefs tab → click any card</div>
    </div>
  );
  const steps={
    tiktok:['🎙 Fish Audio → Nurse Mike voice narration','🎬 Veo3 → 4×8s talking-head clips (9:16)','🎞 Remotion → brand composite (spring animations)','📤 R2 upload → Airtable "Review Ready"'],
    pinterest:['🎨 Imagen4 Ultra → educational pin (2:3, 1008×1512)','📐 Style from 83 indexed brand assets','📤 R2 upload → Airtable "Review Ready"'],
    instagram:['🎨 Imagen4 Ultra → 4-8 carousel slides (1:1)','📖 Auto-split content into slides with hook cover','📤 R2 upload → Airtable "Review Ready"'],
    youtube:['🖼 Imagen4 → click-worthy thumbnail (16:9)','🎙 Fish Audio → full narration track','🎬 Veo3 → 4×8s clips (16:9)','🎞 Remotion → YouTube composition with Mike'],
  };
  return(
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1"><span className="text-sn-yellow font-bold">#{brief.rank}</span><ChBadge ch={brief.channel}/></div>
          <h2 className="text-white text-xl font-bold leading-tight">{brief.title}</h2>
        </div>
        <button onClick={()=>onProduce(brief)} className="btn btn-pink text-sm shrink-0">▶ Produce Now</button>
      </div>
      <div className="card">
        <div className="text-sn-blue text-xs font-bold uppercase tracking-wider mb-2">Hook</div>
        <div className="text-white text-sm leading-relaxed">{brief.hook}</div>
      </div>
      {brief.contentPreview&&(
        <div className="card">
          <div className="text-sn-blue text-xs font-bold uppercase tracking-wider mb-2">Script Preview</div>
          <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {brief.contentPreview.slice(0,1000)}{brief.contentPreview.length>1000?'...':''}
          </div>
        </div>
      )}
      <div className="card">
        <div className="text-sn-blue text-xs font-bold uppercase tracking-wider mb-2">AI Production Steps</div>
        <div className="space-y-1.5">
          {(steps[brief.channel]??['Channel not configured']).map((s,i)=>(
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-sn-yellow font-bold text-sm shrink-0">{i+1}</span>
              <span className="text-gray-300 text-sm">{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── A/B Test Panel ─────────────────────────────────────────────────────────────
const MODEL_LABELS={'imagen4':'Imagen4 Ultra','flux-pro':'Flux Pro 1.1','dalle3':'DALL-E 3 HD'};
const MODEL_COLORS={'imagen4':'border-blue-500','flux-pro':'border-purple-500','dalle3':'border-green-500'};

function ABTestPanel({brief}){
  const [results,setResults]=useState(null);
  const [sessionId,setSessionId]=useState('');
  const [loading,setLoading]=useState(false);
  const [winner,setWinner]=useState('');
  const [stats,setStats]=useState(null);
  const [customPrompt,setCustomPrompt]=useState('');

  useEffect(()=>{api.get('/api/ab-stats').then(d=>setStats(d.stats));},[]);
  useEffect(()=>{if(brief&&!customPrompt)setCustomPrompt('');},[brief]);

  async function runAB(){
    if(!brief){alert('Select a brief first');return;}
    setLoading(true);setResults(null);setWinner('');
    const r=await api.post('/api/generate-ab',{brief,prompt:customPrompt||undefined});
    setSessionId(r.sessionId);
    setResults(r.results);
    setLoading(false);
  }

  async function pickWinner(model){
    setWinner(model);
    const r=await api.post('/api/ab-choice',{sessionId,winner:model});
    setStats(r.stats);
  }

  const successResults=results?.filter(r=>r.imageB64&&!r.error)||[];
  const modelOrder=Object.keys(MODEL_LABELS);

  return(
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-white font-bold text-lg">Pinterest A/B Model Test</div>
          <div className="text-gray-400 text-sm mt-0.5">
            {brief?<>Testing: <span className="text-sn-yellow font-semibold">{brief.title}</span></>:'Select a Pinterest brief'}
          </div>
        </div>
        <button onClick={runAB} disabled={loading||!brief}
          className="btn btn-pink shrink-0">
          {loading?<span className="pulse">Generating 3 models...</span>:'⚡ Run A/B Test'}
        </button>
      </div>

      {/* Model win rate stats */}
      {stats&&(
        <div className="card">
          <div className="text-sn-blue text-xs font-bold uppercase tracking-wider mb-2">Model Win Rates</div>
          <div className="flex gap-3">
            {modelOrder.map(m=>{
              const s=stats[m];const wr=s?.total>0?Math.round(s.winRate*100):null;
              return(
                <div key={m} className="flex-1 text-center">
                  <div className="text-white text-sm font-bold">{MODEL_LABELS[m]}</div>
                  <div className="text-2xl font-black mt-1" style={{color:wr===null?'#4b5563':wr>=50?'#4ade80':'#f87171'}}>
                    {wr===null?'—':wr+'%'}
                  </div>
                  <div className="text-gray-500 text-xs">{s?.wins??0}W / {s?.total??0} rounds</div>
                </div>
              );
            })}
          </div>
          {stats&&Object.values(stats).some(s=>s.total>=5)&&(
            <div className="mt-2 text-sn-teal text-xs font-semibold">
              ✅ Auto-selecting top 2 models for production (system learned from {Object.values(stats).reduce((a,s)=>a+s.total,0)} choices)
            </div>
          )}
        </div>
      )}

      {/* Custom prompt override */}
      <div>
        <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Custom prompt (optional)</div>
        <textarea value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} rows={2}
          placeholder="Leave empty to use brief hook + SimpleNursing brand prompt..."
          className="text-xs resize-none"/>
      </div>

      {loading&&(
        <div className="flex gap-3">
          {modelOrder.map(m=>(
            <div key={m} className="flex-1 card text-center">
              <div className="text-gray-300 font-semibold text-sm mb-3">{MODEL_LABELS[m]}</div>
              <div className="bg-gray-700 rounded-xl pulse" style={{height:200}}/>
              <div className="text-gray-500 text-xs mt-2">Generating...</div>
            </div>
          ))}
        </div>
      )}

      {results&&(
        <div>
          <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
            Pick your favourite — the system learns from your choice
          </div>
          <div className="flex gap-3">
            {results.map(r=>(
              <div key={r.model} className={\`flex-1 card border-2 transition-all \${winner===r.model?MODEL_COLORS[r.model]+' scale-105':'border-gray-700'}\`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-bold text-sm">{MODEL_LABELS[r.model]}</span>
                  <span className="text-gray-500 text-xs">{r.durationMs?Math.round(r.durationMs/1000)+'s':''}</span>
                </div>
                {r.error?(
                  <div className="text-red-400 text-xs bg-red-900/20 rounded p-2">{r.error.slice(0,120)}</div>
                ):(
                  <img src={\`data:image/png;base64,\${r.imageB64}\`} className="w-full rounded-lg mb-2" style={{maxHeight:300,objectFit:'cover'}} alt={r.model}/>
                )}
                {!r.error&&(
                  <button onClick={()=>pickWinner(r.model)}
                    className={\`btn w-full text-sm \${winner===r.model?'btn-teal':'btn-ghost'}\`}>
                    {winner===r.model?'✅ Winner!':'Choose this'}
                  </button>
                )}
              </div>
            ))}
          </div>
          {winner&&successResults.length>0&&(
            <div className="mt-3 text-center text-green-400 text-sm font-semibold">
              ✅ Saved! {MODEL_LABELS[winner]} wins this round. Using it for production.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
const SIDEBAR_TABS=[
  {id:'briefs',icon:'📋',label:'Briefs'},
  {id:'assets',icon:'🎨',label:'Assets'},
  {id:'characters',icon:'🧑‍⚕️',label:'Mike'},
  {id:'health',icon:'⚡',label:'APIs'},
  {id:'settings',icon:'⚙️',label:'Settings'},
  {id:'output',icon:'📁',label:'Output'},
];

function App(){
  const [sideTab,setSideTab]=useState('briefs');
  const [mainTab,setMainTab]=useState('script');
  const [briefs,setBriefs]=useState([]);
  const [assets,setAssets]=useState([]);
  const [health,setHealth]=useState(null);
  const [healthLoading,setHealthLoading]=useState(true);
  const [selectedBrief,setSelectedBrief]=useState(null);
  const [sessionId,setSessionId]=useState(null);
  const [search,setSearch]=useState('');

  useEffect(()=>{
    api.get('/api/briefs').then(setBriefs).catch(console.error);
    api.get('/api/assets').then(d=>setAssets(d.assets??[])).catch(console.error);
    api.get('/api/api-health').then(d=>{setHealth(d);setHealthLoading(false);}).catch(()=>setHealthLoading(false));
  },[]);

  const handleProduce=useCallback(async(brief)=>{
    const r=await api.post('/api/produce',{rank:brief.rank});
    setSessionId(r.sessionId);
  },[]);

  const filteredBriefs=useMemo(()=>briefs.filter(b=>
    !search||b.title.toLowerCase().includes(search.toLowerCase())||b.hook.toLowerCase().includes(search.toLowerCase())
  ),[briefs,search]);

  return(
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-sn-navy border-b border-gray-700 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sn-yellow rounded-lg flex items-center justify-center text-sn-dark font-black text-xs">SN</div>
          <div>
            <div className="text-white font-bold text-base leading-tight">SimpleNursing AI Studio</div>
            <div className="text-sn-blue text-xs">Autonomous Content Production · Colibri Internal</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="http://localhost:3003" target="_blank" className="btn btn-ghost text-xs py-1.5">📺 Remotion</a>
          <div className="text-xs text-gray-500">{briefs.length} briefs · {assets.length} assets</div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Icon sidebar */}
        <div className="w-14 flex-shrink-0 border-r border-gray-700 bg-gray-900 flex flex-col items-center py-3 gap-1">
          {SIDEBAR_TABS.map(t=>(
            <button key={t.id} onClick={()=>setSideTab(t.id)} title={t.label}
              className={\`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-colors \${sideTab===t.id?'bg-sn-teal':'hover:bg-gray-700'}\`}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* Left panel — 300px */}
        <div className="w-72 flex-shrink-0 border-r border-gray-700 flex flex-col bg-gray-900 overflow-hidden">
          <div className="p-3 border-b border-gray-700 text-gray-300 text-sm font-semibold">
            {SIDEBAR_TABS.find(t=>t.id===sideTab)?.label}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {sideTab==='briefs'&&<>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search briefs..." className="mb-2"/>
              {filteredBriefs.length===0&&<div className="text-gray-500 text-sm text-center py-8">No briefs found</div>}
              {filteredBriefs.map(b=>(
                <BriefCard key={b.airtableId} brief={b} selected={selectedBrief?.airtableId===b.airtableId}
                  onSelect={b=>{setSelectedBrief(b);setMainTab('script');}}/>
              ))}
            </>}
            {sideTab==='assets'&&<AssetGrid assets={assets}/>}
            {sideTab==='characters'&&<CharactersPanel/>}
            {sideTab==='health'&&<HealthPanel health={health} loading={healthLoading}/>}
            {sideTab==='settings'&&<SettingsPanel/>}
            {sideTab==='output'&&<OutputPanel/>}
          </div>
        </div>

        {/* Right panel — main workspace */}
        <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-700 px-5 gap-1 shrink-0 overflow-x-auto">
            {[['script','📝 Script'],['ab','🎨 A/B Test'],['voice','🎙 Voice'],['manim','🎬 Diagrams'],['preview','📺 Preview']].map(([id,label])=>(
              <button key={id} onClick={()=>setMainTab(id)}
                className={\`py-3 px-3 text-sm font-semibold transition-colors whitespace-nowrap \${mainTab===id?'text-white border-b-2 border-sn-teal':'text-gray-400 hover:text-gray-200'}\`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {mainTab==='script'&&<ScriptPanel brief={selectedBrief} onProduce={handleProduce}/>}
            {mainTab==='ab'&&<ABTestPanel brief={selectedBrief}/>}
            {mainTab==='voice'&&<VoicePanel brief={selectedBrief}/>}
            {mainTab==='manim'&&<ManimPanel brief={selectedBrief}/>}
            {mainTab==='preview'&&(
              <iframe src="http://localhost:3003" className="w-full rounded-xl border border-gray-700"
                style={{height:'calc(100vh - 140px)'}} title="Remotion Studio"/>
            )}
          </div>
        </div>
      </div>

      {sessionId&&<LogModal sessionId={sessionId} title="AI Production — Live Log" onClose={()=>setSessionId(null)}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
</script>
</body>
</html>`
}
