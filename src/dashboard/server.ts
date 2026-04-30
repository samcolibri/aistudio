#!/usr/bin/env node
/**
 * AI Studio Dashboard — localhost:3004
 *
 * tsx src/dashboard/server.ts
 *
 * Serves the production control panel:
 *  GET  /api/briefs              → Chad Airtable approved briefs
 *  GET  /api/assets              → local asset manifest (83 assets)
 *  GET  /api/api-health          → status of all connected AI APIs
 *  POST /api/produce             → trigger production for a brief
 *  GET  /api/produce/:id/stream  → SSE real-time production log
 *  GET  /                        → React SPA
 */
import 'dotenv/config'
import http from 'http'
import { readFile, existsSync } from 'fs'
import { readFile as readFileAsync } from 'fs/promises'
import { join } from 'path'
import { fetchCreativeApprovedBriefs, fetchBriefByRank } from '../client/airtable.js'
import type { ContentBrief } from '../types/brief.js'

const PORT = parseInt(process.env.DASHBOARD_PORT ?? '3004')
const ROOT = process.cwd()

// ── In-memory production log streams ─────────────────────────────────────────
type LogEntry = { ts: string; level: 'info' | 'warn' | 'error' | 'success'; msg: string }
const productionLogs = new Map<string, LogEntry[]>()
const sseClients = new Map<string, http.ServerResponse[]>()

function pushLog(sessionId: string, level: LogEntry['level'], msg: string) {
  const entry: LogEntry = { ts: new Date().toISOString(), level, msg }
  if (!productionLogs.has(sessionId)) productionLogs.set(sessionId, [])
  productionLogs.get(sessionId)!.push(entry)
  const clients = sseClients.get(sessionId) ?? []
  const data = `data: ${JSON.stringify(entry)}\n\n`
  clients.forEach(res => res.write(data))
}

// ── Route handlers ────────────────────────────────────────────────────────────
async function handleBriefs(): Promise<ContentBrief[]> {
  return fetchCreativeApprovedBriefs()
}

async function handleAssets() {
  const manifestPath = join(ROOT, '.asset-manifest.json')
  if (!existsSync(manifestPath)) return { assets: [], total: 0 }
  const raw = await readFileAsync(manifestPath, 'utf8')
  const manifest = JSON.parse(raw)
  const assets = manifest.assets.filter((a: any) => a.analysis)
  return { assets, total: assets.length, indexedAt: manifest.indexedAt }
}

async function handleApiHealth() {
  const checks = await Promise.allSettled([
    checkGoogle(),
    checkFishAudio(),
    checkAirtable(),
    checkRunway(),
  ])
  return {
    google:    checks[0].status === 'fulfilled' ? checks[0].value : { ok: false, error: String((checks[0] as any).reason) },
    fishAudio: checks[1].status === 'fulfilled' ? checks[1].value : { ok: false, error: String((checks[1] as any).reason) },
    airtable:  checks[2].status === 'fulfilled' ? checks[2].value : { ok: false, error: String((checks[2] as any).reason) },
    runway:    checks[3].status === 'fulfilled' ? checks[3].value : { ok: false, error: String((checks[3] as any).reason) },
  }
}

async function checkGoogle() {
  const key = process.env.GOOGLE_AI_KEY
  if (!key) return { ok: false, error: 'GOOGLE_AI_KEY not set' }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json() as any
  const models = (data.models ?? []).map((m: any) => m.name)
  const hasVeo = models.some((m: string) => m.includes('veo'))
  const hasImagen = models.some((m: string) => m.includes('imagen'))
  return { ok: true, models: models.slice(0, 6), hasVeo, hasImagen }
}

async function checkFishAudio() {
  const key = process.env.FISH_AUDIO_API_KEY
  if (!key) return { ok: false, error: 'FISH_AUDIO_API_KEY not set' }
  const res = await fetch('https://api.fish.audio/wallet/balance', {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (res.status === 401) return { ok: false, error: 'Invalid API key' }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json() as any
  const balance = data.balance ?? data.total ?? 0
  return { ok: balance > 0, balance, needsCredits: balance <= 0 }
}

async function checkAirtable() {
  const key = process.env.AIRTABLE_API_KEY
  const base = process.env.AIRTABLE_BASE_ID ?? 'appLFh438nLooz6u7'
  if (!key) return { ok: false, error: 'AIRTABLE_API_KEY not set' }
  const res = await fetch(`https://api.airtable.com/v0/${base}/tbl5P3J8agdY4gNtT?maxRecords=1`, {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true, connected: true }
}

async function checkRunway() {
  const key = process.env.RUNWAY_API_KEY
  if (!key) return { ok: false, error: 'RUNWAY_API_KEY not set — add to .env' }
  const res = await fetch('https://api.dev.runwayml.com/v1/models', {
    headers: { Authorization: `Bearer ${key}`, 'X-Runway-Version': '2024-11-06' }
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true, connected: true }
}

async function triggerProduction(body: { rank?: number; airtableId?: string; channel?: string }) {
  const sessionId = `prod_${Date.now()}`
  productionLogs.set(sessionId, [])

  // Fire production in background
  ;(async () => {
    try {
      pushLog(sessionId, 'info', '🎬 Production session started')
      let brief: ContentBrief | null = null

      if (body.rank) {
        pushLog(sessionId, 'info', `📋 Fetching brief #${body.rank} from Airtable...`)
        brief = await fetchBriefByRank(body.rank)
      } else {
        pushLog(sessionId, 'info', '📋 Fetching first creative-approved brief...')
        const briefs = await fetchCreativeApprovedBriefs()
        brief = briefs[0] ?? null
      }

      if (!brief) {
        pushLog(sessionId, 'error', '❌ No brief found')
        return
      }

      pushLog(sessionId, 'info', `✅ Brief: "${brief.title}" [${brief.channel}]`)
      pushLog(sessionId, 'info', `   Hook: ${brief.hook.slice(0, 80)}`)
      pushLog(sessionId, 'info', '')
      pushLog(sessionId, 'info', '🔍 Step 1/5 — Analysing script with Claude...')

      // Spawn produce-now.ts as a child process so we capture its stdout
      const { spawn } = await import('child_process')
      const args = ['src/produce-now.ts']
      if (body.rank) args.push('--rank', String(body.rank))

      const child = spawn(
        join(ROOT, 'node_modules/.bin/tsx'),
        args,
        { cwd: ROOT, env: { ...process.env } }
      )

      child.stdout.on('data', (d: Buffer) => {
        const lines = d.toString().split('\n').filter(l => l.trim())
        lines.forEach(line => {
          const clean = line.replace(/\x1B\[[0-9;]*m/g, '')
          const level: LogEntry['level'] = clean.includes('✅') || clean.includes('✓') ? 'success'
            : clean.includes('✗') || clean.includes('Error') ? 'error'
            : clean.includes('⚠') ? 'warn' : 'info'
          pushLog(sessionId, level, clean)
        })
      })
      child.stderr.on('data', (d: Buffer) => {
        pushLog(sessionId, 'error', d.toString().replace(/\x1B\[[0-9;]*m/g, '').trim())
      })
      child.on('close', (code) => {
        if (code === 0) pushLog(sessionId, 'success', '\n🎉 Production complete! Check output/ folder.')
        else pushLog(sessionId, 'error', `\n❌ Producer exited with code ${code}`)
        // Signal stream end
        const clients = sseClients.get(sessionId) ?? []
        clients.forEach(res => { res.write('data: {"done":true}\n\n'); res.end() })
        sseClients.delete(sessionId)
      })
    } catch (err) {
      pushLog(sessionId, 'error', `Fatal: ${String(err)}`)
    }
  })()

  return { sessionId }
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const path = url.pathname

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  try {
    // API routes
    if (path === '/api/briefs' && req.method === 'GET') {
      const data = await handleBriefs()
      json(res, data)
      return
    }
    if (path === '/api/assets' && req.method === 'GET') {
      const data = await handleAssets()
      json(res, data)
      return
    }
    if (path === '/api/api-health' && req.method === 'GET') {
      const data = await handleApiHealth()
      json(res, data)
      return
    }
    if (path === '/api/produce' && req.method === 'POST') {
      const body = await readBody(req)
      const result = await triggerProduction(body)
      json(res, result)
      return
    }
    // SSE stream for production logs
    const sseMatch = path.match(/^\/api\/produce\/([^/]+)\/stream$/)
    if (sseMatch && req.method === 'GET') {
      const sessionId = sseMatch[1]
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      // Send buffered logs first
      const buffered = productionLogs.get(sessionId) ?? []
      buffered.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`))
      // Register for future logs
      if (!sseClients.has(sessionId)) sseClients.set(sessionId, [])
      sseClients.get(sessionId)!.push(res)
      req.on('close', () => {
        const clients = sseClients.get(sessionId) ?? []
        const idx = clients.indexOf(res)
        if (idx >= 0) clients.splice(idx, 1)
      })
      return
    }

    // Serve SPA for all other routes
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(getSPA())
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: String(err) }))
  }
})

function json(res: http.ServerResponse, data: unknown) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
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
  console.log(`  📋 Airtable briefs + asset library + production controls\n`)
})

// ── SPA HTML (React via CDN, no build step) ───────────────────────────────────
function getSPA(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SimpleNursing AI Studio</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          sn: {
            teal: '#00709c',
            blue: '#75c7e6',
            pink: '#fc3467',
            yellow: '#fad74f',
            dark: '#282323',
            navy: '#005374',
          }
        }
      }
    }
  }
</script>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>
  body { background: #0f1117; color: #e2e8f0; font-family: 'Inter', system-ui, sans-serif; }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1a1f2e; }
  ::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 3px; }
  .log-info    { color: #94a3b8; }
  .log-success { color: #4ade80; }
  .log-warn    { color: #fbbf24; }
  .log-error   { color: #f87171; }
  .pulse { animation: pulse 2s cubic-bezier(0.4,0,0.6,1) infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useRef, useCallback } = React;

// ─── API helpers ───────────────────────────────────────────────────────────────
const api = {
  briefs:    () => fetch('/api/briefs').then(r => r.json()),
  assets:    () => fetch('/api/assets').then(r => r.json()),
  health:    () => fetch('/api/api-health').then(r => r.json()),
  produce:   (body) => fetch('/api/produce', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
};

// ─── Channel badge ─────────────────────────────────────────────────────────────
const CHANNEL_COLORS = {
  pinterest: 'bg-red-600',
  instagram: 'bg-purple-600',
  tiktok:    'bg-gray-800 border border-gray-500',
  youtube:   'bg-red-700',
};

function ChannelBadge({ channel }) {
  return <span className={\`\${CHANNEL_COLORS[channel] ?? 'bg-gray-600'} text-white text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider\`}>{channel}</span>;
}

// ─── API Health Panel ──────────────────────────────────────────────────────────
function HealthPanel({ health, loading }) {
  const dot = (ok) => (
    <span className={\`inline-block w-2 h-2 rounded-full mr-2 \${ok ? 'bg-green-400' : 'bg-red-400'}\`} />
  );
  if (loading) return <div className="text-sm text-gray-400 pulse">Checking APIs...</div>;
  if (!health) return null;

  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div className="bg-gray-800 rounded-lg p-3">
        {dot(health.google?.ok)}<span className="font-semibold text-white">Google AI</span>
        <div className="text-gray-400 text-xs mt-1">
          {health.google?.ok
            ? \`Veo3: \${health.google.hasVeo ? '✅' : '❌'}  Imagen4: \${health.google.hasImagen ? '✅' : '❌'}\`
            : health.google?.error ?? 'Unknown error'}
        </div>
      </div>
      <div className="bg-gray-800 rounded-lg p-3">
        {dot(health.fishAudio?.ok)}<span className="font-semibold text-white">Fish Audio</span>
        <div className="text-gray-400 text-xs mt-1">
          {health.fishAudio?.ok
            ? \`Balance: \${health.fishAudio.balance} credits\`
            : health.fishAudio?.needsCredits ? '⚠ Add credits at fish.audio/go-api'
            : health.fishAudio?.error ?? 'Unknown'}
        </div>
      </div>
      <div className="bg-gray-800 rounded-lg p-3">
        {dot(health.airtable?.ok)}<span className="font-semibold text-white">Airtable</span>
        <div className="text-gray-400 text-xs mt-1">
          {health.airtable?.ok ? 'Chad briefs connected' : health.airtable?.error}
        </div>
      </div>
      <div className="bg-gray-800 rounded-lg p-3">
        {dot(health.runway?.ok)}<span className="font-semibold text-white">Runway</span>
        <div className="text-gray-400 text-xs mt-1">
          {health.runway?.ok ? 'Gen-3 Alpha ready' : 'Set RUNWAY_API_KEY in .env'}
        </div>
      </div>
    </div>
  );
}

// ─── Production Log ────────────────────────────────────────────────────────────
function ProductionLog({ sessionId, onClose }) {
  const [logs, setLogs] = useState([]);
  const [done, setDone] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(\`/api/produce/\${sessionId}/stream\`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.done) { setDone(true); es.close(); return; }
      setLogs(prev => [...prev, data]);
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-white">Production Log</span>
            {!done && <span className="text-xs text-yellow-400 pulse">● Running...</span>}
            {done && <span className="text-xs text-green-400">● Complete</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-0.5">
          {logs.map((log, i) => (
            <div key={i} className={\`log-\${log.level}\`}>{log.msg}</div>
          ))}
          <div ref={bottomRef}/>
        </div>
        {done && (
          <div className="p-4 border-t border-gray-700">
            <a href="http://localhost:3003" target="_blank" className="inline-flex items-center gap-2 bg-sn-teal hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors">
              📺 Open Remotion Studio to preview
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Brief Card ───────────────────────────────────────────────────────────────
function BriefCard({ brief, onProduce }) {
  return (
    <div className="bg-gray-800 border border-gray-700 hover:border-sn-teal rounded-xl p-4 transition-all group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sn-yellow font-bold text-sm">#{brief.rank}</span>
          <ChannelBadge channel={brief.channel} />
          <span className="text-gray-400 text-xs">Score: <span className="text-green-400 font-semibold">{brief.score}</span></span>
        </div>
        <button
          onClick={() => onProduce(brief)}
          className="opacity-0 group-hover:opacity-100 bg-sn-teal hover:bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-lg transition-all whitespace-nowrap"
        >
          ▶ Produce
        </button>
      </div>
      <h3 className="text-white font-semibold text-sm leading-tight mb-1">{brief.title}</h3>
      <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">{brief.hook}</p>
      <div className="mt-2 text-gray-500 text-xs">Persona: {brief.personaId}</div>
    </div>
  );
}

// ─── Asset Grid ───────────────────────────────────────────────────────────────
const CHANNEL_FILTER = ['all', 'tiktok', 'instagram', 'youtube', 'pinterest'];

function AssetGrid({ assets }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? assets : assets.filter(a => a.analysis?.channel === filter);

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {CHANNEL_FILTER.map(ch => (
          <button key={ch} onClick={() => setFilter(ch)}
            className={\`text-xs px-3 py-1 rounded-full font-semibold transition-colors \${filter === ch ? 'bg-sn-teal text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}\`}>
            {ch}
          </button>
        ))}
        <span className="text-gray-500 text-xs self-center ml-auto">{filtered.length} assets</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
        {filtered.map((asset, i) => (
          <div key={i} className="bg-gray-800 rounded-lg p-2 text-xs">
            <div className="text-gray-300 font-medium leading-tight mb-1 line-clamp-2">
              {asset.analysis?.title ?? asset.filename}
            </div>
            <div className="flex gap-1 flex-wrap">
              {asset.analysis?.channel && (
                <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-xs">{asset.analysis.channel}</span>
              )}
              {asset.analysis?.format && (
                <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-xs">{asset.analysis.format}</span>
              )}
              <span className="bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded text-xs">{asset.type}</span>
            </div>
            {asset.analysis?.qualityScore && (
              <div className="mt-1 text-gray-500 text-xs">Q: {asset.analysis.qualityScore}/10</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Script Analyzer ──────────────────────────────────────────────────────────
function ScriptAnalyzer({ brief }) {
  if (!brief) return <div className="text-gray-500 text-sm">Select a brief to see the script</div>;
  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      <div>
        <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Hook</div>
        <div className="text-white text-sm bg-gray-800 rounded-lg p-3 leading-relaxed">{brief.hook}</div>
      </div>
      {brief.contentPreview && (
        <div>
          <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Script Preview</div>
          <div className="text-gray-300 text-sm bg-gray-800 rounded-lg p-3 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {brief.contentPreview.slice(0, 1200)}{brief.contentPreview.length > 1200 ? '...' : ''}
          </div>
        </div>
      )}
      <div>
        <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Production Plan</div>
        <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 text-sm">
          {brief.channel === 'tiktok' && <>
            <div className="text-gray-300">1. 🎙 Fish Audio → Nurse Mike narration (~{Math.ceil(brief.contentPreview.length / 150)}s)</div>
            <div className="text-gray-300">2. 🎬 Veo3 → 4 × 8s talking-head clips (9:16)</div>
            <div className="text-gray-300">3. 🎞 Remotion → branded composite with Mike character</div>
          </>}
          {brief.channel === 'pinterest' && <>
            <div className="text-gray-300">1. 🎨 Imagen4 Ultra → 2:3 educational pin (1008×1512)</div>
            <div className="text-gray-300">2. 📐 SimpleNursing brand colors + style from {83} indexed assets</div>
          </>}
          {brief.channel === 'instagram' && <>
            <div className="text-gray-300">1. 🎨 Imagen4 Ultra → 4-8 carousel slides (1:1)</div>
            <div className="text-gray-300">2. 📖 Auto-split content into slides with hook cover</div>
          </>}
          {brief.channel === 'youtube' && <>
            <div className="text-gray-300">1. 🖼 Imagen4 → click-worthy thumbnail (16:9)</div>
            <div className="text-gray-300">2. 🎙 Fish Audio → full narration track</div>
            <div className="text-gray-300">3. 🎬 Veo3 → 4 × 8s clips (16:9)</div>
            <div className="text-gray-300">4. 🎞 Remotion → YouTube composition with Mike</div>
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState('briefs');
  const [briefs, setBriefs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [selectedBrief, setSelectedBrief] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.briefs().then(setBriefs).catch(console.error);
    api.assets().then(d => setAssets(d.assets ?? [])).catch(console.error);
    api.health().then(d => { setHealth(d); setHealthLoading(false); }).catch(() => setHealthLoading(false));
  }, []);

  const handleProduce = useCallback(async (brief) => {
    setSelectedBrief(brief);
    const result = await api.produce({ rank: brief.rank });
    setSessionId(result.sessionId);
  }, []);

  const filteredBriefs = briefs.filter(b =>
    !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.hook.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-sn-navy border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sn-yellow rounded-lg flex items-center justify-center text-sn-dark font-black text-sm">SN</div>
          <div>
            <div className="text-white font-bold text-lg leading-tight">SimpleNursing AI Studio</div>
            <div className="text-sn-blue text-xs">Autonomous Content Production</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="http://localhost:3003" target="_blank"
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded-lg font-medium transition-colors">
            📺 Remotion Studio
          </a>
          <div className="text-xs text-gray-500">{briefs.length} briefs · {assets.length} assets</div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — briefs + controls */}
        <div className="w-80 flex-shrink-0 border-r border-gray-700 flex flex-col bg-gray-900">
          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            {[['briefs','📋 Briefs'],['assets','🎨 Assets'],['health','⚡ APIs']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={\`flex-1 py-3 text-xs font-semibold transition-colors \${tab === id ? 'text-sn-blue border-b-2 border-sn-blue' : 'text-gray-400 hover:text-gray-200'}\`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tab === 'briefs' && <>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search briefs..."
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sn-teal"
              />
              {filteredBriefs.length === 0 && <div className="text-gray-500 text-sm text-center py-8">No briefs found</div>}
              {filteredBriefs.map(b => (
                <BriefCard key={b.airtableId} brief={b}
                  onProduce={() => { setSelectedBrief(b); setTab('script'); }} />
              ))}
            </>}

            {tab === 'assets' && <AssetGrid assets={assets} />}

            {tab === 'health' && (
              <div>
                <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">API Status</div>
                <HealthPanel health={health} loading={healthLoading} />
                <div className="mt-4 text-gray-500 text-xs space-y-1">
                  <div>Add missing keys to <code className="text-gray-300">.env</code></div>
                  <div>• RUNWAY_API_KEY — Runway Gen-3</div>
                  <div>• KLING_API_KEY — Kling AI</div>
                  <div>• LUMA_API_KEY — Luma Dream Machine</div>
                  <div>• ELEVENLABS_API_KEY — ElevenLabs voice</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — script / production */}
        <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
          {/* Inner tabs */}
          <div className="flex border-b border-gray-700 px-6">
            {[['script','Script & Plan'],['preview','Remotion Preview']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={\`py-3 px-4 text-sm font-semibold transition-colors mr-2 \${tab === id ? 'text-white border-b-2 border-sn-teal' : 'text-gray-400 hover:text-gray-200'}\`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'script' && (
              <div>
                {selectedBrief ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sn-yellow font-bold">#{selectedBrief.rank}</span>
                          <ChannelBadge channel={selectedBrief.channel} />
                        </div>
                        <h2 className="text-white text-xl font-bold">{selectedBrief.title}</h2>
                      </div>
                      <button
                        onClick={() => handleProduce(selectedBrief)}
                        className="bg-sn-pink hover:bg-red-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
                      >
                        ▶ Produce Now
                      </button>
                    </div>
                    <ScriptAnalyzer brief={selectedBrief} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <div className="text-5xl mb-4">🎬</div>
                    <div className="text-gray-400 text-lg font-semibold mb-2">Select a brief to get started</div>
                    <div className="text-gray-500 text-sm">Browse approved briefs → hover a card → click Produce</div>
                  </div>
                )}
              </div>
            )}

            {tab === 'preview' && (
              <div className="h-full">
                <iframe
                  src="http://localhost:3003"
                  className="w-full rounded-xl border border-gray-700"
                  style={{ height: 'calc(100vh - 160px)' }}
                  title="Remotion Studio"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Production log modal */}
      {sessionId && (
        <ProductionLog
          sessionId={sessionId}
          onClose={() => { setSessionId(null); }}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body>
</html>`
}
