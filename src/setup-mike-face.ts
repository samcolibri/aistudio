/**
 * One-time setup: Generate photorealistic "Nurse Mike" headshot via fal.ai Flux Pro.
 * SadTalker requires a real human face for lip-sync — cartoon SVG won't work.
 * Run: npx tsx src/setup-mike-face.ts
 * Output: remotion/public/mike_realistic.png
 */
import 'dotenv/config'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { fal } from '@fal-ai/client'

const OUT = join(process.cwd(), 'remotion/public/mike_realistic.png')

const PROMPT = [
  'Professional headshot photo of a Black male nurse in his mid-30s, wearing light blue scrubs.',
  'Frontal view, face centered in frame, neutral friendly expression, mouth closed, eyes open',
  'looking directly at camera. Studio lighting, soft teal-blue background.',
  'Photorealistic, sharp focus, high resolution, professional healthcare worker portrait.',
  'No glasses, short natural hair, warm skin tone, clean-shaven.',
].join(' ')

async function main() {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not set')
  fal.config({ credentials: key })

  console.log('Generating realistic Nurse Mike headshot via fal.ai Flux Pro...')

  const result = await fal.subscribe('fal-ai/flux-pro', {
    input: {
      prompt: PROMPT,
      image_size: 'square_hd',
      num_inference_steps: 30,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: 'png',
    },
    logs: false,
  }) as any

  const imageUrl: string = result.images?.[0]?.url ?? result.data?.images?.[0]?.url
  if (!imageUrl) throw new Error('No image URL returned')

  console.log('Downloading...')
  const res = await fetch(imageUrl)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(OUT, buf)

  console.log(`✅ Saved: ${OUT} (${(buf.length / 1024).toFixed(0)} KB)`)
  console.log(`   Preview: ${imageUrl}`)
}

main().catch(console.error)
