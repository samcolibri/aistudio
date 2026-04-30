import { proxyActivities, log, ApplicationFailure } from '@temporalio/workflow'
import type * as activities from '../activities/index.js'
import { splitIntoSceneChunks } from '../utils/text.js'
import { getMusicPrompt, getPersona } from '../personas/index.js'
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
  startToCloseTimeout: timedelta({ hours: 2 }),
  retry: { maximumAttempts: 3, initialInterval: '10s', backoffCoefficient: 2 },
})

// YouTube (16:9) — full Nurse Mike video: image → voice chunks → lip-sync → music → compose → upload
export async function YouTubeVideoWorkflow(brief: ContentBrief): Promise<ProductionResult> {
  const persona = getPersona(brief.personaId)
  log.info(`[YouTube] Starting — ${brief.id}`, { title: brief.title, persona: persona.name })

  // Phase 1: Character image
  const characterImage = await generateImageActivity({
    briefId: brief.id,
    prompt: brief.title,
    aspectRatio: '3:4',
    personaId: brief.personaId,
  })

  // Phase 2: Split script into 10-12s voice chunks (Kling clips max 13s)
  const scriptChunks = splitIntoSceneChunks(brief.script, 130)
  log.info(`[YouTube] Script split into ${scriptChunks.length} scenes`)

  // Phase 3: Voice for each scene (sequential — Fish Audio rate limits)
  const voiceClips: Array<{ localPath: string; durationSec: number; costUsd: number }> = []
  let voiceCostTotal = 0
  for (let i = 0; i < scriptChunks.length; i++) {
    const voice = await generateVoiceActivity({
      briefId: brief.id,
      text: scriptChunks[i],
      voiceId: persona.voiceId,
      channel: 'youtube',
    })
    voiceClips.push(voice)
    voiceCostTotal += voice.costUsd
  }

  // Phase 4: Lip-sync each scene in parallel (Kling Avatar Pro)
  const lipSyncClips = await Promise.all(
    scriptChunks.map((_, i) =>
      generateLipSyncActivity({
        briefId: brief.id,
        imageUrl: characterImage.url,
        audioUrl: voiceClips[i].localPath,
        sceneId: `s${String(i + 1).padStart(2, '0')}`,
        durationSec: voiceClips[i].durationSec,
      })
    )
  )
  const lipSyncCost = lipSyncClips.reduce((s, c) => s + c.costUsd, 0)

  // Phase 5: Background music
  const music = await generateMusicActivity({
    briefId: brief.id,
    prompt: getMusicPrompt(persona, 'youtube'),
  })

  // Phase 6: Assemble final video
  const composed = await composeVideoActivity({
    briefId: brief.id,
    channel: 'youtube',
    clipPaths: lipSyncClips.map(c => c.localPath),
    musicPath: music.localPath,
    aspectRatio: '16:9',
  })

  // Phase 7: Upload to R2
  const uploaded = await uploadOutputActivity({
    briefId: brief.id,
    channel: 'youtube',
    localPath: composed.localPath,
    contentType: 'video/mp4',
  })

  const totalCostUsd = characterImage.costUsd + voiceCostTotal + lipSyncCost + music.costUsd

  // Phase 8: Update Airtable
  await syncAirtableActivity({
    briefId: brief.id,
    airtableRecordId: brief.id,
    outputUrl: uploaded.url,
    costUsd: totalCostUsd,
    status: 'produced',
  })

  log.info(`[YouTube] Complete — ${composed.durationSec}s, $${totalCostUsd.toFixed(2)}`, {
    url: uploaded.url,
  })

  return {
    briefId: brief.id,
    channel: 'youtube',
    outputUrl: uploaded.url,
    durationSec: composed.durationSec,
    totalCostUsd,
    completedAt: new Date().toISOString(),
  }
}
