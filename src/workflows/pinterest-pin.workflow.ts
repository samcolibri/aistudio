import { proxyActivities, log } from '@temporalio/workflow'
import type * as activities from '../activities/index.js'
import { getPersona } from '../personas/index.js'
import { BRAND } from '../brand/tokens.js'
import type { ContentBrief, ProductionResult } from '../types/brief.js'
import { timedelta } from './shared.js'

const {
  generateImageActivity,
  uploadOutputActivity,
  syncAirtableActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: timedelta({ minutes: 20 }),
  retry: { maximumAttempts: 3, initialInterval: '10s', backoffCoefficient: 2 },
})

export async function PinterestPinWorkflow(brief: ContentBrief): Promise<ProductionResult> {
  const persona = getPersona(brief.personaId)
  log.info(`[Pinterest] Pin starting — ${brief.id}`, { title: brief.title })

  // Pinterest 2:3 vertical — SEO-forward, keyword-rich visual
  const pinPrompt = [
    `Pinterest educational pin for nursing students,`,
    `"${brief.title}"`,
    `keyword: ${brief.keyword},`,
    `${BRAND.colors.darkBlue} background, ${BRAND.colors.lightBlue} accent,`,
    `bold headline text, SimpleNursing branding, infographic style,`,
    `2:3 vertical format, high-contrast, Pinterest-optimized visual`,
  ].join(' ')

  const image = await generateImageActivity({
    briefId: brief.id,
    prompt: pinPrompt,
    aspectRatio: '2:3',
    personaId: brief.personaId,
  })

  const uploaded = await uploadOutputActivity({
    briefId: brief.id,
    channel: 'pinterest',
    localPath: image.localPath,
    contentType: 'image/png',
  })

  await syncAirtableActivity({
    briefId: brief.id,
    airtableRecordId: brief.id,
    outputUrl: uploaded.url,
    costUsd: image.costUsd,
    status: 'produced',
  })

  log.info(`[Pinterest] Complete — $${image.costUsd.toFixed(4)}`, { url: uploaded.url })

  return {
    briefId: brief.id,
    channel: 'pinterest',
    outputUrl: uploaded.url,
    totalCostUsd: image.costUsd,
    completedAt: new Date().toISOString(),
  }
}
