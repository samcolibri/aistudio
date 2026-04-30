import { Context } from '@temporalio/activity'
import { generateImage } from '../client/glio.js'
import { getPersona } from '../personas/index.js'
import { downloadFile } from '../utils/fs.js'
import path from 'path'
import type { GenerateImageInput, GenerateImageOutput } from '../types/workflow.js'
import type { PersonaId } from '../types/brief.js'

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output'

// SimpleNursing character prompt — medical professional, real-world setting
function buildNursingPrompt(basePrompt: string, personaId: PersonaId): string {
  const persona = getPersona(personaId)
  const setting = personaId === 'nurse-mike' || personaId === 'nurse-alison'
    ? 'hospital corridor background, scrubs, professional healthcare setting, cinematic lighting'
    : 'studying environment, books and notes, warm home or campus setting'

  return [
    basePrompt,
    `${persona.name}, ${persona.age} years old, ${persona.role}`,
    setting,
    'photorealistic, facing camera, neutral expression ready to speak, high quality portrait',
    'NOT anime, NOT cartoon — realistic photography style',
  ].join(', ')
}

export async function generateImageActivity(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const { briefId, prompt, aspectRatio, personaId } = input
  const logger = Context.current().log

  const fullPrompt = buildNursingPrompt(prompt, personaId as PersonaId)
  logger.info(`[Image] Generating character image for ${briefId}`, { personaId, aspectRatio })

  const result = await generateImage({
    prompt: fullPrompt,
    aspectRatio,
    resolution: '1K',
  })

  const dir = path.join(OUTPUT_DIR, briefId, 'character')
  const localPath = path.join(dir, 'reference.png')
  await downloadFile(result.url, localPath)

  logger.info(`[Image] Done — $${result.costUsd.toFixed(4)}`, { url: result.url })

  return {
    url: result.url,
    localPath,
    costUsd: result.costUsd,
  }
}
