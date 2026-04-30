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
  startToCloseTimeout: timedelta({ minutes: 30 }),
  retry: { maximumAttempts: 3, initialInterval: '10s', backoffCoefficient: 2 },
})

function buildSlidePrompts(brief: ContentBrief): string[] {
  const slides: string[] = []

  // Slide 1: Hook (persona in frame, brand colors)
  slides.push(
    `${brief.hook}, Instagram carousel cover slide, ${BRAND.colors.mediumBlue} background, ` +
    `white bold text overlay, SimpleNursing brand style, 1:1 square format`
  )

  // Slides 2-N: Key points from script (rough split by sentences)
  const sentences = brief.script.split(/[.!?]+/).filter(s => s.trim().length > 20).slice(0, 4)
  for (const sentence of sentences) {
    slides.push(
      `Educational slide: "${sentence.trim()}", clean minimal design, ${BRAND.colors.lightBlue} accent, ` +
      `professional nursing education aesthetic, 1:1 square, text-forward layout`
    )
  }

  // Final slide: CTA
  slides.push(
    `Call to action slide: "Save this for nursing school", ${BRAND.colors.pink} accent, ` +
    `SimpleNursing logo placement, follow button prompt, 1:1 square`
  )

  return slides.slice(0, 7)  // Instagram max 10 slides, keep to 5-7
}

export async function InstagramCarouselWorkflow(brief: ContentBrief): Promise<ProductionResult> {
  const persona = getPersona(brief.personaId)
  log.info(`[Instagram] Carousel starting — ${brief.id}`, { slides: 'TBD', persona: persona.name })

  const slidePrompts = buildSlidePrompts(brief)
  log.info(`[Instagram] Generating ${slidePrompts.length} slides`)

  // Generate all slides in parallel
  const slides = await Promise.all(
    slidePrompts.map((prompt, i) =>
      generateImageActivity({
        briefId: brief.id,
        prompt,
        aspectRatio: '1:1',
        personaId: brief.personaId,
      })
    )
  )

  const totalCostUsd = slides.reduce((s, sl) => s + sl.costUsd, 0)

  // Upload first slide as cover (the "output" for Airtable)
  const coverUploaded = await uploadOutputActivity({
    briefId: brief.id,
    channel: 'instagram',
    localPath: slides[0].localPath,
    contentType: 'image/png',
  })

  await syncAirtableActivity({
    briefId: brief.id,
    airtableRecordId: brief.id,
    outputUrl: coverUploaded.url,
    costUsd: totalCostUsd,
    status: 'produced',
  })

  log.info(`[Instagram] Complete — ${slides.length} slides, $${totalCostUsd.toFixed(2)}`)

  return {
    briefId: brief.id,
    channel: 'instagram',
    outputUrl: coverUploaded.url,
    totalCostUsd,
    completedAt: new Date().toISOString(),
  }
}
