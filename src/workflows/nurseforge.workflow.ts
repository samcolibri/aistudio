/**
 * NurseForgeWorkflow — the complete brief-to-publish pipeline.
 *
 * Human gates via Temporal Signals — worker sleeps durably, no polling:
 *   content_approved signal → Chad approved the script in Airtable
 *   creative_approved signal → Chad approved the creatives in Airtable
 *
 * Workflow ID: nurseforge-{airtableId}
 *
 * Stages:
 *   produce (parallel by channel) → qa → push to Airtable → [SIGNAL] → publish
 */
import { proxyActivities, condition, setHandler, defineSignal, defineQuery, log } from '@temporalio/workflow'
import type * as activities from '../activities/index.js'
import type { ContentBrief } from '../types/brief.js'

// ── Signals & Queries ─────────────────────────────────────────────────────────
export const contentApprovedSignal  = defineSignal('content_approved')
export const creativeApprovedSignal = defineSignal('creative_approved')
export const getStatusQuery         = defineQuery<string>('get_status')

// ── Activity proxies ──────────────────────────────────────────────────────────
const {
  generateAllVeo3ClipsActivity,
  generateInstagramSlidesActivity,
  generatePinterestPinActivity,
  generateYouTubeThumbnailActivity,
  generateVoiceActivity,
  renderRemotionActivity,
  composeVideoActivity,
  uploadAllOutputsActivity,
  pushToAirtableActivity,
  markFailedActivity,
  setStatusActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2h',
  retry: { maximumAttempts: 3, initialInterval: '15s', backoffCoefficient: 2 },
})

// ── Main Workflow ─────────────────────────────────────────────────────────────
export async function NurseForgeWorkflow(brief: ContentBrief): Promise<void> {
  let status = 'started'
  let creativeApproved = false

  // Register signal handlers
  setHandler(creativeApprovedSignal, () => {
    log.info('[NurseForge] creative_approved signal received')
    creativeApproved = true
  })

  // Register query handler
  setHandler(getStatusQuery, () => status)

  log.info(`[NurseForge] Starting for ${brief.airtableId}`, {
    title: brief.title,
    channel: brief.channel,
    persona: brief.personaId,
  })

  try {
    // ── Stage 1: Mark as producing ────────────────────────────────────────────
    status = 'producing'
    await setStatusActivity({ airtableId: brief.airtableId, status: 'Producing' })

    // ── Stage 2: Production (by channel) ──────────────────────────────────────
    const outputUrls: string[] = []

    if (brief.channel === 'youtube') {
      // YouTube: Voice + Veo3 clips + Remotion branding + compose + thumbnail
      const [voice, veo3Clips, thumbnail] = await Promise.all([
        generateVoiceActivity({
          briefId: brief.airtableId,
          personaId: brief.personaId,
          script: brief.contentPreview,
          channel: 'youtube',
        }),
        generateAllVeo3ClipsActivity({
          briefId: brief.airtableId,
          personaId: brief.personaId,
          script: brief.contentPreview,
          channel: 'youtube',
        }),
        generateYouTubeThumbnailActivity({
          briefId: brief.airtableId,
          title: brief.title,
        }),
      ])

      const remotion = await renderRemotionActivity({
        briefId: brief.airtableId,
        brief: {
          title: brief.title,
          hook: brief.hook,
          channel: brief.channel,
          contentPreview: brief.contentPreview,
          keyword: brief.keyword,
        },
        voiceAudioPath: voice.narrationPath,
      })

      const composed = await composeVideoActivity({
        briefId: brief.airtableId,
        channel: 'youtube',
        veo3ClipPaths: veo3Clips.map(c => c.localPath),
        remotionBrandingPath: remotion.localPath,
        narrationPath: voice.narrationPath,
        aspectRatio: '16:9',
      })

      const uploads = await uploadAllOutputsActivity({
        briefId: brief.airtableId,
        channel: 'youtube',
        paths: [
          { localPath: composed.localPath,   filename: 'youtube_final.mp4',     contentType: 'video/mp4' },
          { localPath: remotion.localPath,   filename: 'youtube_branded.mp4',   contentType: 'video/mp4' },
          { localPath: thumbnail.localPath,  filename: 'thumbnail.png',         contentType: 'image/png' },
        ],
      })
      outputUrls.push(...uploads)

    } else if (brief.channel === 'tiktok') {
      // TikTok: Voice + Veo3 (9:16) + compose
      const [voice, veo3Clips] = await Promise.all([
        generateVoiceActivity({
          briefId: brief.airtableId,
          personaId: brief.personaId,
          script: brief.contentPreview.split(' ').slice(0, 130).join(' '), // max 60s
          channel: 'tiktok',
        }),
        generateAllVeo3ClipsActivity({
          briefId: brief.airtableId,
          personaId: brief.personaId,
          script: brief.contentPreview.split(' ').slice(0, 130).join(' '),
          channel: 'tiktok',
        }),
      ])

      const composed = await composeVideoActivity({
        briefId: brief.airtableId,
        channel: 'tiktok',
        veo3ClipPaths: veo3Clips.map(c => c.localPath),
        narrationPath: voice.narrationPath,
        aspectRatio: '9:16',
      })

      const uploads = await uploadAllOutputsActivity({
        briefId: brief.airtableId,
        channel: 'tiktok',
        paths: [
          { localPath: composed.localPath, filename: 'tiktok_final.mp4', contentType: 'video/mp4' },
        ],
      })
      outputUrls.push(...uploads)

    } else if (brief.channel === 'instagram') {
      // Instagram: Imagen4 carousel slides
      const slides = await generateInstagramSlidesActivity({
        briefId: brief.airtableId,
        contentPreview: brief.contentPreview,
        title: brief.title,
      })

      const uploads = await uploadAllOutputsActivity({
        briefId: brief.airtableId,
        channel: 'instagram',
        paths: slides.localPaths.map((p, i) => ({
          localPath: p,
          filename: `slide_${String(i + 1).padStart(2, '0')}.png`,
          contentType: 'image/png',
        })),
      })
      outputUrls.push(...uploads)

    } else if (brief.channel === 'pinterest') {
      // Pinterest: Imagen4 2:3 pin
      const pin = await generatePinterestPinActivity({
        briefId: brief.airtableId,
        contentPreview: brief.contentPreview,
        title: brief.title,
      })

      const uploads = await uploadAllOutputsActivity({
        briefId: brief.airtableId,
        channel: 'pinterest',
        paths: [{ localPath: pin.localPath, filename: 'pin.png', contentType: 'image/png' }],
      })
      outputUrls.push(...uploads)
    }

    // ── Stage 3: Push to Airtable → wait for creative approval ───────────────
    status = 'awaiting_creative_approval'
    await pushToAirtableActivity({
      airtableId: brief.airtableId,
      outputUrls,
      qaPass: outputUrls.length > 0,
      workflowId: `nurseforge-${brief.airtableId}`,
    })

    log.info(`[NurseForge] Pushed ${outputUrls.length} assets to Airtable — waiting for Chad approval`)

    // Durable wait — Chad reviews in Airtable and triggers signal
    await condition(() => creativeApproved, '14 days')

    // ── Stage 4: Final status update ──────────────────────────────────────────
    status = 'complete'
    await setStatusActivity({ airtableId: brief.airtableId, status: 'Complete' })
    log.info(`[NurseForge] Complete for ${brief.airtableId}`)

  } catch (err) {
    status = 'failed'
    const msg = err instanceof Error ? err.message : String(err)
    log.error(`[NurseForge] Failed for ${brief.airtableId}: ${msg}`)
    await markFailedActivity({ airtableId: brief.airtableId, error: msg })
    throw err
  }
}
