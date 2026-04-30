/**
 * A/B model preference tracker
 * Stores choices in .ab-choices.json, learns win rates, auto-selects best 2 models
 *
 * Flow:
 *  1. generateAB() → runs 3 models in parallel → returns { sessionId, results[] }
 *  2. recordChoice() → saves winner → updates win rates
 *  3. getBestModels() → returns top 2 by win rate (for autonomous production)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const PREF_PATH = join(process.cwd(), '.ab-choices.json')

export type ImageModel = 'imagen4' | 'flux-pro' | 'dalle3'

interface ModelStats {
  wins: number
  total: number
  winRate: number
}

interface ABSession {
  sessionId: string
  briefId: string
  channel: string
  prompt: string
  results: { model: ImageModel; imageB64: string; durationMs: number; error?: string }[]
  winner?: ImageModel
  createdAt: string
}

interface ABStore {
  sessions: ABSession[]
  stats: Record<ImageModel, ModelStats>
}

function loadStore(): ABStore {
  if (!existsSync(PREF_PATH)) return {
    sessions: [],
    stats: {
      imagen4:  { wins: 0, total: 0, winRate: 0 },
      'flux-pro': { wins: 0, total: 0, winRate: 0 },
      dalle3:   { wins: 0, total: 0, winRate: 0 },
    }
  }
  return JSON.parse(readFileSync(PREF_PATH, 'utf8')) as ABStore
}

function saveStore(store: ABStore) {
  writeFileSync(PREF_PATH, JSON.stringify(store, null, 2))
}

export function recordChoice(sessionId: string, winner: ImageModel) {
  const store = loadStore()
  const session = store.sessions.find(s => s.sessionId === sessionId)
  if (!session) return
  session.winner = winner

  // Update win rates
  for (const r of session.results) {
    if (!r.error) {
      store.stats[r.model].total++
      if (r.model === winner) store.stats[r.model].wins++
      store.stats[r.model].winRate = store.stats[r.model].wins / store.stats[r.model].total
    }
  }

  saveStore(store)
}

export function getBestModels(n = 2): ImageModel[] {
  const store = loadStore()
  const models: ImageModel[] = ['imagen4', 'flux-pro', 'dalle3']

  // If we have enough data (>5 rounds), return top N by win rate
  const total = Object.values(store.stats).reduce((s, v) => s + v.total, 0)
  if (total >= 5) {
    return models
      .filter(m => store.stats[m].total > 0)
      .sort((a, b) => store.stats[b].winRate - store.stats[a].winRate)
      .slice(0, n)
  }

  // Default to all 3 until we have data
  return models
}

export function getStats() {
  return loadStore().stats
}

export function saveSession(session: ABSession) {
  const store = loadStore()
  store.sessions.push(session)
  // Keep only last 100 sessions
  if (store.sessions.length > 100) store.sessions = store.sessions.slice(-100)
  saveStore(store)
}
