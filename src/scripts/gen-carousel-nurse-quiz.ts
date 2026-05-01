/**
 * Generate "Should I Be a Nurse?" Instagram Carousel
 * 6 slides — Ideogram v3 via fal.ai (best text-in-image model)
 * Brand colors: #282323 | #005374 | #00709c | #fc3467 | #75c7e6
 *
 * Run: npx tsx src/scripts/gen-carousel-nurse-quiz.ts
 */
import 'dotenv/config'
import { fal } from '@fal-ai/client'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import fetch from 'node-fetch'

fal.config({ credentials: process.env.FAL_KEY! })

const OUT = join(process.cwd(), 'output/recUm0xdiqNLg664h/carousel')

// V6-approved slide content
const SLIDES = [
  {
    num: 1,
    label: 'HOOK',
    headline: 'How to figure out if nursing fits your life',
    body: '',
    bg: '#282323',
    textColor: '#fc3467',
    accentColor: '#fc3467',
    prompt: `Instagram carousel COVER SLIDE for nursing education account. Bold clean graphic design.

EXACT TEXT TO DISPLAY:
Headline (very large, bold, center): "How to figure out if nursing fits your life"
Bottom right corner: SimpleNursing logo area (small, subtle)
Slide number: "1 of 6" bottom left (tiny)

DESIGN:
- Background: solid #282323 (near-black)
- Headline text: #fc3467 (hot pink-red), ultra-bold sans-serif, large and dominant
- Minimalist layout, lots of white space
- No decorative elements, no stock photos, pure typography
- Square 1:1 format (Instagram)
- Professional, modern, Gen Z aesthetic`,
  },
  {
    num: 2,
    label: 'Q1-3',
    headline: 'Start with the practical questions',
    body: '1. Can you commit to 2-4 years of school right now?\n2. Are you okay working 12-hour shifts, nights and weekends?\n3. Does starting pay around $75K+ in the U.S. match your financial goals?',
    bg: '#005374',
    textColor: '#ffffff',
    accentColor: '#75c7e6',
    prompt: `Instagram carousel SLIDE 2 of 6 for nursing education. Text-forward, clean list design.

EXACT TEXT TO DISPLAY:
Header (medium, #75c7e6): "Start with the practical questions"
Numbered list (white, readable):
"1. Can you commit to 2-4 years of school right now?"
"2. Are you okay working 12-hour shifts, nights and weekends?"
"3. Does starting pay around $75K+ in the U.S. match your financial goals?"
Slide number: "2 of 6" bottom right (tiny, subtle)

DESIGN:
- Background: solid #005374 (dark teal)
- Header: #75c7e6 (light blue), bold sans-serif
- List text: white, clean readable weight, each question on its own line with breathing room
- Generous line spacing, easy to read fast
- No photos, no illustrations, pure text layout
- Square 1:1 format (Instagram)`,
  },
  {
    num: 3,
    label: 'Q4-6',
    headline: 'Think about the day to day',
    body: '4. Can you handle being on your feet for most of a shift?\n5. Are you comfortable making fast decisions when things go wrong?\n6. Does working closely with patients during hard moments sound like something you want?',
    bg: '#00709c',
    textColor: '#ffffff',
    accentColor: '#fad74f',
    prompt: `Instagram carousel SLIDE 3 of 6 for nursing education. Text-forward, clean list design.

EXACT TEXT TO DISPLAY:
Header (medium, #fad74f): "Think about the day to day"
Numbered list (white, readable):
"4. Can you handle being on your feet for most of a shift?"
"5. Are you comfortable making fast decisions when things go wrong?"
"6. Does working closely with patients during hard moments sound like something you want?"
Slide number: "3 of 6" bottom right (tiny, subtle)

DESIGN:
- Background: solid #00709c (teal)
- Header: #fad74f (warm yellow), bold sans-serif
- List text: white, clean readable weight, each question on its own line with breathing room
- Generous line spacing, easy to read fast
- No photos, no illustrations, pure text layout
- Square 1:1 format (Instagram)`,
  },
  {
    num: 4,
    label: 'Q7-9',
    headline: 'Big picture questions',
    body: '7. Do you want a career with dozens of specialty paths you can switch between?\n8. Are you looking for a job in demand basically everywhere?\n9. Would you rather have job stability than a higher ceiling that takes longer to reach?',
    bg: '#005374',
    textColor: '#ffffff',
    accentColor: '#75c7e6',
    prompt: `Instagram carousel SLIDE 4 of 6 for nursing education. Text-forward, clean list design.

EXACT TEXT TO DISPLAY:
Header (medium, #75c7e6): "Big picture questions"
Numbered list (white, readable):
"7. Do you want a career with dozens of specialty paths you can switch between?"
"8. Are you looking for a job in demand basically everywhere?"
"9. Would you rather have job stability than a higher ceiling that takes longer to reach?"
Slide number: "4 of 6" bottom right (tiny, subtle)

DESIGN:
- Background: solid #005374 (dark teal)
- Header: #75c7e6 (light blue), bold sans-serif
- List text: white, clean readable weight, each question on its own line with breathing room
- Generous line spacing, easy to read fast
- No photos, no illustrations, pure text layout
- Square 1:1 format (Instagram)`,
  },
  {
    num: 5,
    label: 'Q10',
    headline: 'The most important question',
    body: '10. If you found out nursing school was harder than expected, would you adjust your plan or walk away?\n\nNo perfect score. If you said yes to most of these, nursing is worth seriously looking into.',
    bg: '#282323',
    textColor: '#ffffff',
    accentColor: '#fc3467',
    prompt: `Instagram carousel SLIDE 5 of 6 for nursing education. Reflective, impactful layout.

EXACT TEXT TO DISPLAY:
Header (medium, #fc3467): "The most important question"
Main question (white, larger): "10. If you found out nursing school was harder than expected, would you adjust your plan or walk away?"
Answer note (smaller, #75c7e6): "No perfect score. If you said yes to most, nursing is worth looking into seriously."
Slide number: "5 of 6" bottom right (tiny, subtle)

DESIGN:
- Background: solid #282323 (near-black)
- Header: #fc3467 (hot pink-red), bold
- Question text: white, slightly larger weight than previous slides
- Answer note: #75c7e6, smaller and lighter
- Generous line spacing
- No photos, pure text
- Square 1:1 format (Instagram)`,
  },
  {
    num: 6,
    label: 'CTA',
    headline: 'Built for clarity, not to make you feel better',
    body: 'Most nursing quizzes are too vague or overly positive. This quiz focuses on real decision factors: lifestyle fit, workload expectations, and the real time commitment.\n\nTake the quiz at simplenursing.com/quiz',
    bg: '#282323',
    textColor: '#ffffff',
    accentColor: '#fc3467',
    prompt: `Instagram carousel FINAL SLIDE (6 of 6) for SimpleNursing education brand. CTA design.

EXACT TEXT TO DISPLAY:
Top brand area: "SimpleNursing" (small, #75c7e6)
Headline (bold, white): "Built for clarity, not to make you feel better"
Body (smaller, white): "Most nursing quizzes are too vague or overly positive. This quiz focuses on real decision factors: lifestyle fit, workload, and time commitment."
CTA line (bold, #fc3467): "simplenursing.com/quiz"
Slide number: "6 of 6" bottom right (tiny)

DESIGN:
- Background: solid #282323 (near-black)
- "SimpleNursing" small header in #75c7e6
- Headline in white, bold, large
- Body text in white, smaller weight
- CTA URL in #fc3467, prominent
- Clean minimal layout, strong visual hierarchy
- No photos, no illustrations
- Square 1:1 format (Instagram)`,
  },
]

async function generateSlide(slide: typeof SLIDES[0]): Promise<string> {
  const outPath = join(OUT, `slide_${String(slide.num).padStart(2, '0')}.png`)
  if (existsSync(outPath)) {
    console.log(`  ♻️  Slide ${slide.num} already exists`)
    return outPath
  }

  process.stdout.write(`  [${slide.num}/6] Generating "${slide.label}"... `)

  const result = await fal.subscribe('fal-ai/ideogram/v3', {
    input: {
      prompt: slide.prompt,
      aspect_ratio: '1:1',
      style: 'design',
      rendering_speed: 'quality',
      negative_prompt: 'photos, stock images, people, faces, blurry, watermark, hand drawn, sketch, 3d render, misspelled, typo',
    },
    pollInterval: 3000,
    logs: false,
  }) as any

  const url: string = result.images?.[0]?.url ?? result.data?.images?.[0]?.url
  if (!url) throw new Error(`No URL for slide ${slide.num}: ${JSON.stringify(result).slice(0, 100)}`)

  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  await writeFile(outPath, buf)
  console.log(`✅ (${(buf.length / 1024).toFixed(0)}KB)`)
  return outPath
}

async function main() {
  console.log('\n🎨 Ideogram v3 — "Should I Be a Nurse?" Instagram Carousel (6 slides)\n')
  console.log('   Brand: #282323 | #005374 | #00709c | #fc3467 | #75c7e6\n')

  const paths: string[] = []
  for (const slide of SLIDES) {
    const p = await generateSlide(slide)
    paths.push(p)
    spawn('open', [p])
  }

  console.log('\n✅ All 6 slides generated:')
  paths.forEach(p => console.log('  ', p))
  console.log('\nOpening all slides...')
}

main().catch(console.error)
