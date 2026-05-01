/**
 * Generate realistic nurse face using Flux Pro Ultra
 * Dim natural lighting, real skin, documentary style
 */
import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'

fal.config({ credentials: process.env.FAL_KEY! })

const OUT = join(process.cwd(), 'remotion/public')

const PROMPTS = [
  // Option A: dim hospital, cinematic
  'Documentary photo of a Black male nurse in his early 30s, light blue scrubs, standing in a dimly lit hospital corridor at night. Ambient fluorescent ceiling light casting soft shadows on face. Natural skin with visible pores, slight stubble, tired but warm eyes. Shot on Canon R5, 50mm f/1.4. Shallow depth of field, blurred hospital equipment in background. No ring light, no beauty lighting, no retouching. RAW photo feel.',

  // Option B: window light, real office
  'Real photo of a Black male nurse, mid-30s, wearing blue medical scrubs. Sitting at a nurses station, soft natural window light from the side creating gentle shadow on half the face. Natural skin texture, real human imperfections. Candid unposed moment, looking directly at lens with genuine expression. Shot handheld, slight grain. No studio, no backdrop, no artificial lighting.',

  // Option C: hallway, straight
  'Candid portrait of a Black male healthcare professional in blue scrubs, standing in a modern hospital hallway. Overhead fluorescent light, natural shadows under eyes and chin, realistic skin. Background shows blurred medical environment. Documentary journalism style photo. Nikon D850, available light only, f/2.8. The face looks completely real and human, not AI generated.',

  // Option D: close up, dark bg
  'Close up portrait of a Black male nurse educator, 30s, blue scrubs. Dark clinical background. Side lighting from a single window, creating natural shadow across half the face — giving depth and realism. Genuine smile, crow feet around eyes, visible pores, natural hair. Shot on film. No digital smoothing, no airbrushing, gritty real photo.',
]

async function main() {
  console.log('🖼  Flux Pro Ultra — 4 realistic portraits (dim natural light)\n')

  for (let i = 0; i < PROMPTS.length; i++) {
    console.log(`  Generating option ${i + 1}...`)
    const result = await fal.subscribe('fal-ai/flux-pro/v1.1-ultra', {
      input: {
        prompt: PROMPTS[i],
        aspect_ratio: '9:16',
        output_format: 'png',
        safety_tolerance: '5',
        raw: true,  // raw mode = more photorealistic, less processed
      },
      pollInterval: 3000,
      logs: false,
    }) as any

    const url: string = result.images?.[0]?.url ?? result.data?.images?.[0]?.url
    if (!url) { console.log(`  ⚠ Option ${i+1} no URL`); continue }

    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const path = join(OUT, `mike_flux_v${i + 1}.png`)
    await writeFile(path, buf)
    console.log(`  ✅ Option ${i + 1}: ${path} (${(buf.length/1024).toFixed(0)}KB)`)
    spawn('open', [path])
  }

  console.log('\n  ✅ Done — 4 options opened. Tell me which one looks most real.')
}

main().catch(console.error)
