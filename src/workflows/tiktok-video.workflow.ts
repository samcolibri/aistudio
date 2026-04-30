import { proxyActivities, log } from '@temporalio/workflow'
import type * as activities from '../activities/index.js'
import { getPersona, getMusicPrompt } from '../personas/index.js'
import { splitIntoSceneChunks } from '../utils/text.js'
import type { ContentBrief, ProductionResult } from '../types/brief.js'
import { timedelta } from './shared.js'

const {
  generateImageActivity,
  generateVoiceActivity,
  generateLipSyncActivity,
  generateMusicActivity,
  composeVideoActivity,
  uploadOutputActivity,
  syncAirtableActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: timedelta({ hours: 1 }),
  retry: { maximumAttempts: 3, initialInterval: '10s', backoffCoefficient: 2 },
})

// TikTok (9:16) — single idea, 30-60s max, one voice chunk + one lip-sync clip
export async function TikTokVideoWorkflow(brief: ContentBrief): Promise<ProductionResult> {
  const persona = getPersona(brief.personaId)
  log.info(`[TikTok] Starting — ${brief.id}`, { title: brief.title, persona: persona.name })

  // TikTok = one idea only — trim to ~60s of speaking (130wpm ≈ 130 words)
  const tiktokScript = brief.script.split(' ').slice(0, 130).join(' ')

  // Phase 1: Character image (9:16 for vertical)
  const characterImage = await generateImageActivity({
    briefId: brief.id,
    prompt: brief.hook,
    aspectRatio: '9:16',
    personaId: brief.personaId,
  })

  // Phase 2: Single voice clip
  const voice = await generateVoiceActivity({
    briefId: brief.id,
    text: tiktokScript,
    voiceId: persona.voiceId,
    channel: 'tiktok',
    speed: 1.1,  // TikTok pacing slightly faster
  })

  // Phase 3: Lip-sync (split into 12s clips if needed)
  const chunks = splitIntoSceneChunks(tiktokScript, 80)  // shorter chunks for TikTok
  const lipSyncClips = await Promise.all(
    chunks.map((_, i) =>
      generateLipSyncActivity({
        briefId: brief.id,
        imageUrl: characterImage.url,
        audioUrl: voice.localPath,
        sceneId: `t${String(i + 1).padStart(2, '0')}`,
        durationSec: Math.min(12, Math.ceil(chunks[i].length / 13)),
      })
    )
  )
  const lipSyncCost = lipSyncClips.reduce((s, c) => s + c.costUsd, 0)

  // Phase 4: Music (upbeat, short)
  const music = await generateMusicActivity({
    briefId: brief.id,
    prompt: getMusicPrompt(persona, 'tiktok'),
  })

  // Phase 5: Compose 9:16
  const composed = await composeVideoActivity({
    briefId: brief.id,
    channel: 'tiktok',
    clipPaths: lipSyncClips.map(c => c.localPath),
    musicPath: music.localPath,
    aspectRatio: '9:16',
  })

  // Phase 6: Upload
  const uploaded = await uploadOutputActivity({
    briefId: brief.id,
    channel: 'tiktok',
    localPath: composed.localPath,
    contentType: 'video/mp4',
  })

  const totalCostUsd = characterImage.costUsd + voice.costUsd + lipSyncCost + music.costUsd

  await syncAirtableActivity({
    briefId: brief.id,
    airtableRecordId: brief.id,
    outputUrl: uploaded.url,
    costUsd: totalCostUsd,
    status: 'produced',
  })

  log.info(`[TikTok] Complete — ${composed.durationSec}s, $${totalCostUsd.toFixed(2)}`)

  return {
    briefId: brief.id,
    channel: 'tiktok',
    outputUrl: uploaded.url,
    durationSec: composed.durationSec,
    totalCostUsd,
    completedAt: new Date().toISOString(),
  }
}
