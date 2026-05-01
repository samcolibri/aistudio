/**
 * Generate realistic nursing student portrait — teenage girl at home study desk
 * Flux Pro Ultra for maximum photorealism
 */
import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'

fal.config({ credentials: process.env.FAL_KEY! })

const OUT = join(process.cwd(), 'remotion/public')

const PROMPTS = [
  // Option 1: warm desk lamp, night study
  'Real candid photo of a young woman, early 20s, studying nursing at her bedroom desk at night. Warm desk lamp light on her face creating natural soft glow with shadows. Textbooks and notes visible in background. She looks up at camera with a genuine tired-but-excited smile. Natural dark hair, no makeup. Cozy bedroom setting. Shot on iPhone, slightly grainy, real life feel. No studio, completely authentic.',

  // Option 2: bright morning, natural window
  'Candid photo of a college girl in her early 20s sitting at a study table near a window, morning natural daylight on her face. She has dark hair pulled back loosely, wearing a casual hoodie. Nursing textbooks and laptop on desk. Looking at camera naturally. Real skin texture, no retouching. Very authentic, like a photo a friend took.',

  // Option 3: diverse, dorm room
  'Real photo of a young nursing student girl, 19-21 years old, dark hair, sitting at her dorm room desk surrounded by textbooks and sticky notes on the wall. Soft overhead light, face is naturally lit with subtle shadows. Genuine expression, slightly tired. Speaks to camera like a TikTok video. Real human, photographic quality, not AI-looking.',

  // Option 4: cozy home, relaxed
  'Photorealistic portrait of a young woman in her early 20s, studying nursing prerequisites at her kitchen table at home. Natural home lighting, casual clothes — a sweatshirt. Her textbook is open in front of her. She looks directly into the camera with an engaged and relatable expression. Real person aesthetic, documentary style photo. No beauty filters.',
]

async function main() {
  console.log('🖼  Generating nursing student portraits — real teenage girl studying\n')

  for (let i = 0; i < PROMPTS.length; i++) {
    console.log(`  Option ${i + 1}...`)
    try {
      const result = await fal.subscribe('fal-ai/flux-pro/v1.1-ultra', {
        input: {
          prompt: PROMPTS[i],
          aspect_ratio: '9:16',
          output_format: 'png',
          safety_tolerance: '5',
          raw: true,
        },
        pollInterval: 3000,
        logs: false,
      }) as any

      const url: string = result.images?.[0]?.url ?? result.data?.images?.[0]?.url
      if (!url) { console.log(`  ⚠ Option ${i+1}: no URL`); continue }

      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      const path = join(OUT, `student_v${i + 1}.png`)
      await writeFile(path, buf)
      console.log(`  ✅ Option ${i + 1} saved`)
      spawn('open', [path])
    } catch (err: any) {
      console.log(`  ⚠ Option ${i+1} failed: ${String(err).slice(0, 100)}`)
    }
  }

  console.log('\n✅ Done — tell me which one looks most real and I will use it.')
}

main().catch(console.error)
