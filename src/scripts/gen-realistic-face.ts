/**
 * Generate a photorealistic nurse portrait using Imagen 4 Ultra
 * Natural hospital lighting — no AI glow, no studio, real human look
 */
import 'dotenv/config'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const KEY  = process.env.GOOGLE_AI_KEY!
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const PROMPT = [
  'Candid professional photo of a Black male nurse in his early 30s,',
  'wearing light blue scrubs, standing in a modern hospital corridor.',
  'Natural fluorescent hospital lighting, realistic skin texture with natural pores,',
  'genuine warm confident smile, slight stubble, natural hair.',
  'Background: softly blurred hospital hallway with medical equipment visible.',
  'Shot on Sony A7 camera, 85mm lens, shallow depth of field.',
  'NO studio lighting, NO dramatic highlights, NO AI glow, NO perfect smooth skin.',
  'Looks like a real candid professional headshot. Vertical 9:16 crop.',
  'Photo-realistic, documentary style, natural colors.',
].join(' ')

async function main() {
  console.log('🖼  Generating realistic nurse portrait via Imagen 4 Ultra...')
  console.log('   Natural hospital lighting, real skin, no AI glow\n')

  const res = await fetch(`${BASE}/imagen-4.0-ultra-generate-001:predict?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: PROMPT }],
      parameters: {
        sampleCount: 4,   // generate 4 options, pick best
        aspectRatio: '9:16',
        outputMimeType: 'image/png',
      },
    }),
  })

  if (!res.ok) throw new Error(`Imagen error ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json() as any
  const preds = data.predictions ?? []
  if (!preds.length) throw new Error('No images returned')

  const outDir = join(process.cwd(), 'remotion/public')
  for (let i = 0; i < preds.length; i++) {
    const buf = Buffer.from(preds[i].bytesBase64Encoded, 'base64')
    const path = join(outDir, `mike_realistic_v${i + 1}.png`)
    await writeFile(path, buf)
    console.log(`  ✅ Option ${i + 1}: ${path} (${(buf.length/1024).toFixed(0)}KB)`)
  }

  // Save option 1 as the active portrait
  const best = Buffer.from(preds[0].bytesBase64Encoded, 'base64')
  const bestPath = join(outDir, 'mike_realistic.png')
  await writeFile(bestPath, best)
  console.log(`\n  ✅ Saved as active portrait: ${bestPath}`)
  console.log('\n  Open all 4 options and pick the best — then re-run kling-30s-final.ts')

  // Open all 4 for comparison
  const { spawn } = await import('child_process')
  for (let i = 1; i <= preds.length; i++) {
    spawn('open', [join(outDir, `mike_realistic_v${i}.png`)])
  }
}

main().catch(console.error)
