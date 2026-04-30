import { ChromaClient } from 'chromadb'
import type { AssetRecord } from './index.js'

const COLLECTION = 'simplenursing_assets'

function buildSearchText(a: AssetRecord): string {
  const an = a.analysis!
  return [
    an.title, an.category, an.channel, an.format, an.persona, an.topic,
    an.visualStyle, an.animationStyle, an.copywritingStyle,
    ...(an.whatWorks ?? []),
    ...(an.tags ?? []),
    an.veo3Prompt,
  ].filter(Boolean).join(' ')
}

export async function embedAssetsToChroma(assets: AssetRecord[]): Promise<void> {
  const toEmbed = assets.filter(a => a.analysis && !a.chromaEmbedded)
  if (toEmbed.length === 0) return

  let client: ChromaClient
  try {
    client = new ChromaClient({ path: process.env.CHROMA_URL ?? 'http://localhost:8000' })
  } catch {
    console.warn('[chroma] ChromaDB not available — skipping embeddings')
    return
  }

  const col = await client.getOrCreateCollection({ name: COLLECTION })

  const ids = toEmbed.map(a => a.id)
  const docs = toEmbed.map(a => buildSearchText(a))
  const metas = toEmbed.map(a => ({
    filename: a.filename,
    category: a.analysis!.category,
    channel: a.analysis!.channel,
    format: a.analysis!.format,
    topic: a.analysis!.topic,
    tags: (a.analysis!.tags ?? []).join(','),
    r2Url: a.r2Url ?? '',
    qualityScore: a.analysis!.qualityScore,
    brandConsistency: a.analysis!.brandConsistency,
  }))

  await col.upsert({ ids, documents: docs, metadatas: metas })
  console.log(`[chroma] Embedded ${toEmbed.length} assets into '${COLLECTION}'`)
}

export async function searchAssets(query: string, limit = 5): Promise<void> {
  const client = new ChromaClient({ path: process.env.CHROMA_URL ?? 'http://localhost:8000' })
  const col = await client.getCollection({ name: COLLECTION })
  const results = await col.query({ queryTexts: [query], nResults: limit })
  const ids = results.ids[0] ?? []
  const metas = results.metadatas[0] ?? []
  const distances = results.distances?.[0] ?? []

  console.log(`\nSearch: "${query}" — ${ids.length} results\n`)
  for (let i = 0; i < ids.length; i++) {
    const m = metas[i] as Record<string, string>
    console.log(`  ${i+1}. ${m.filename}`)
    console.log(`     [${m.category}] ${m.channel} | ${m.format} | topic: ${m.topic}`)
    console.log(`     score: ${m.qualityScore}/10 | brand: ${m.brandConsistency}/10 | match: ${(1 - (distances[i] ?? 0)).toFixed(2)}`)
    if (m.r2Url) console.log(`     ${m.r2Url}`)
    console.log()
  }
}
