/**
 * Generate nursing student portrait — girl looking DIRECTLY into camera
 * 4 options via Imagen 4 Ultra (Google)
 */
import 'dotenv/config'
import { generateImage } from '../client/google-ai.js'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'

const OUT = join(process.cwd(), 'remotion/public')

const PROMPTS = [
  // Direct gaze, warm room light
  'Real candid photo of a young woman, early 20s, nursing student. She is looking DIRECTLY into the camera lens with confident direct eye contact, facing the camera head-on. Warm desk lamp light. Natural dark hair loose, casual hoodie. Nursing textbook visible in background. Slight genuine smile. Real skin texture, no retouching. Shot on iPhone. Authentic, not posed. Eyes looking straight at the viewer.',

  // Natural window light, frontal
  'Candid close-up portrait of a college girl, 20-22 years old, staring straight into the camera — full direct eye contact, face perfectly centered and frontal. Natural window daylight, morning. Dark hair, casual light-colored top. Nursing study environment. Real human skin, authentic photo, not AI-looking. Eyes locked onto the lens.',

  // Study desk, direct
  'Real photo of a young nursing student, 19-21 years old, sitting at desk LOOKING DIRECTLY AT THE CAMERA with strong eye contact. Face fully forward, not turned to the side. Soft overhead room light, slight shadow on one side of face for depth. Genuine expression, relaxed but focused. Authentic documentary photo style. Dark hair, casual clothes.',

  // Clean, direct, simple
  'Portrait of a young woman nursing student, early 20s, making direct strong eye contact with the camera. Face centered, looking straight forward into the lens. Simple clean home background slightly blurred. Natural soft indoor lighting. Real skin, real person — not AI generated. Casual style, authentic feel. Her eyes are clearly looking directly at YOU the viewer.',
]

async function main() {
  console.log('🖼  Generating direct-gaze nursing student portraits\n')

  for (let i = 0; i < PROMPTS.length; i++) {
    console.log(`  Option ${i + 1}...`)
    try {
      const buf = await generateImage({ prompt: PROMPTS[i], aspectRatio: '9:16' })
      const path = join(OUT, `student_direct_v${i + 1}.png`)
      await writeFile(path, buf)
      console.log(`  ✅ Option ${i + 1} saved (${(buf.length / 1024).toFixed(0)}KB)`)
      spawn('open', [path])
    } catch (err: any) {
      console.log(`  ⚠ Option ${i + 1} failed: ${String(err).slice(0, 100)}`)
    }
  }

  console.log('\n✅ Done — pick the one that looks most like she is making eye contact with the camera.')
}

main().catch(console.error)
