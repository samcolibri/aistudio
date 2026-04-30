#!/usr/bin/env node
/**
 * NOVA GTM — Remotion Render Script
 * Pulls all Content Approved briefs from Airtable,
 * extracts visual elements via OpenRouter (Gemini Flash),
 * renders studio-quality MP4s.
 *
 * Run: node render.mjs [--rank N] [--all]
 */

import { bundle }          from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { readFileSync }    from 'fs';
import { fileURLToPath }   from 'url';
import { dirname, join, resolve } from 'path';
import { mkdir }           from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR  = resolve(__dirname, '..');

// Load .env
try {
  for (const line of readFileSync(join(ROOT_DIR, '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const [k, ...rest] = t.split('=');
      process.env[k.trim()] ??= rest.join('=').trim();
    }
  }
} catch {}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const AIRTABLE_KEY   = process.env.CHAD_AIRTABLE_API_KEY;
const AIRTABLE_BASE  = 'appLFh438nLooz6u7';
const AIRTABLE_TABLE = 'tbl5P3J8agdY4gNtT';
const OUT_DIR        = join(ROOT_DIR, 'output', 'animations');
const EXTRACT_MODEL  = 'google/gemini-2.5-flash';

// ── Airtable fetch ─────────────────────────────────────────────────────────────
async function fetchApproved(rankFilter = null) {
  let records = [], offset = null;
  while (true) {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_KEY}` } });
    const d = await r.json();
    records.push(...(d.records || []));
    offset = d.offset;
    if (!offset) break;
  }
  let approved = records.filter(r => r.fields['Content Approved?'] === 'Approved');
  if (rankFilter) approved = approved.filter(r => r.fields['Rank'] === rankFilter);
  return approved.sort((a, b) => (a.fields['Rank'] || 999) - (b.fields['Rank'] || 999));
}

// ── Smart content parser (regex fallback, no API needed) ──────────────────────
function parseContentFallback(title, channel, hook, content, channelOverride) {
  channel = channelOverride || channel;
  // Extract numbered items (e.g. "1. Biology\n2. Chemistry")
  const numbered = [...(content || '').matchAll(/^\s*\d+[\.\)]\s*(.+)$/gm)]
    .map(m => m[1].trim()).filter(Boolean).slice(0, 9);

  // Extract bullet items
  const bullets = numbered.length > 0 ? numbered :
    [...(content || '').matchAll(/^[-•*]\s*(.+)$/gm)]
    .map(m => m[1].trim()).filter(Boolean).slice(0, 9);

  // Find a stat (number + context)
  const statMatch = (content || '').match(/(\$[\d,]+K?|\d+%|\d+\s+(?:year|month|week|hour|nurse)s?[^.]{0,40})/i);
  const stat = statMatch ? statMatch[0].trim() : null;

  // Hook line: use actual Hook field, uppercase and trim
  const hookLine = (hook || title)
    .replace(/\.$/, '')
    .slice(0, 60)
    .toUpperCase();

  // Subline from first sentence of content
  const firstSentence = (content || '').split(/\n/)[0]?.split('.')[0]?.trim() || '';

  // CTA: infer from channel + title
  const ctaLower = title.toLowerCase();
  let ctaLine = 'LEARN MORE AT SIMPLENURSING.COM';
  if (ctaLower.includes('quiz') || ctaLower.includes('right for'))
    ctaLine = 'TAKE THE FREE QUIZ';
  else if (ctaLower.includes('checklist') || ctaLower.includes('prereq') || ctaLower.includes('class'))
    ctaLine = 'GET THE FULL CHECKLIST';
  else if (ctaLower.includes('timeline') || ctaLower.includes('how long'))
    ctaLine = 'MAP YOUR TIMELINE';
  else if (ctaLower.includes('roadmap') || ctaLower.includes('requirements'))
    ctaLine = 'GET THE FULL ROADMAP';

  // For YouTube, wrap bullets into sections
  const isYT = channel.toLowerCase().includes('youtube');
  if (isYT) {
    const chunkSize = 4;
    const sections = [];
    for (let i = 0; i < bullets.length; i += chunkSize) {
      sections.push({
        heading: `KEY POINTS ${sections.length + 1}`,
        points: bullets.slice(i, i + chunkSize),
      });
    }
    if (sections.length === 0) sections.push({ heading: 'WHAT YOU NEED TO KNOW', points: [title] });
    return { hookLine, hookSubline: firstSentence.slice(0, 90), sections, ctaLine, stat };
  }

  return { hookLine, hookSubline: firstSentence.slice(0, 90), items: bullets, ctaLine, stat };
}

// ── OpenRouter extract (Gemini Flash — fast & cheap) ─────────────────────────
async function extractProps(rank, title, channel, hook, content) {
  const isInstagram = channel.toLowerCase().includes('instagram');

  const isYouTube = channel.toLowerCase().includes('youtube');
  const systemPrompt = 'You extract structured visual content for social media animations. Return ONLY valid JSON, no markdown fences, no extra text.';

  const userPrompt = isYouTube ? `
Extract kinetic typography beats for a viral educational YouTube video.
Title: ${title}
Hook: ${hook}
Content (first 2500 chars): ${(content || '').slice(0, 2500)}

Return JSON with this exact shape — ALL TEXT IN CAPS, SHORT AND PUNCHY:
{
  "hookLine": "3-6 WORD SHOCKING STATEMENT — what most people get wrong",
  "hookSubline": "one sentence expanding on the hook, natural language, max 12 words",
  "hookStat": "one key number/stat from content like '3.2 GPA' or '94%' or null",
  "beats": [
    {
      "label": "2-3 WORD TOPIC LABEL",
      "color": "#75c7e6",
      "lines": ["3-5 WORD FACT ONE", "3-5 WORD FACT TWO", "3-5 WORD FACT THREE"]
    }
  ],
  "ctaLine": "3-5 WORD CALL TO ACTION",
  "stat": null
}
Rules:
- 3-4 beats total
- Each beat has 3-4 lines max
- Lines are SHORT (3-6 words), ALL CAPS, punchy facts — not full sentences
- Colors rotate: beat 1 = "#75c7e6", beat 2 = "#fc3467", beat 3 = "#62d070", beat 4 = "#fad74f"
- hookLine must be the most shocking/surprising thing in the content` : isInstagram ? `
Extract carousel slide data for an Instagram carousel.
Title: ${title}
Hook: ${hook}
Content (first 1500 chars): ${(content || '').slice(0, 1500)}

Return JSON with this exact shape:
{"slides":[
  {"type":"hook","headline":"SHORT HOOK IN CAPS max 5 words","body":"supporting line max 12 words"},
  {"type":"item","headline":"item name","body":"one supporting sentence","itemNumber":1},
  {"type":"item","headline":"item name","body":"one supporting sentence","itemNumber":2},
  {"type":"item","headline":"item name","body":"one supporting sentence","itemNumber":3},
  {"type":"cta","headline":"call to action matching the content topic"}
]}` : `
Extract visual animation elements for a ${channel} social video.
Title: ${title}
Hook line from brief: ${hook}
Content preview (first 1500 chars): ${(content || '').slice(0, 1500)}

Return JSON with this exact shape:
{
  "hookLine": "SHORT PUNCHY LINE IN ALL CAPS — what viewer GETS or FEARS — max 7 words",
  "hookSubline": "one supporting sentence, natural language, max 15 words",
  "items": ["item 1","item 2","item 3","...up to 9 items from the content"],
  "ctaLine": "CALL TO ACTION IN CAPS — must match content topic — max 6 words",
  "stat": "one key stat if clearly present in content, or null"
}`;

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/samcolibri/nova-gtm-',
      },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: 600,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const d = await r.json();
    let raw = d?.choices?.[0]?.message?.content || '';
    // Strip markdown fences
    raw = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    // Validate we actually got data
    if (isInstagram && parsed.slides?.length > 0) return parsed;
    if (isYouTube && (parsed.beats?.length > 0 || parsed.sections?.length > 0)) return parsed;
    if (!isInstagram && !isYouTube && parsed.items?.length > 0) return parsed;
    throw new Error('Empty extraction result');
  } catch (e) {
    console.log(`  ⚠ API extraction failed (${e.message}) — using regex fallback`);
    return parseContentFallback(title, channel, hook, content, channel);
  }
}

// ── Build Remotion composition props ─────────────────────────────────────────
function buildCompositionConfig(channel, title, extracted) {
  const ch = channel.toLowerCase();

  if (ch.includes('instagram')) {
    const slides = extracted.slides || [];
    return {
      compositionId: 'Instagram',
      fps: 30, width: 1080, height: 1080,
      durationInFrames: Math.max(slides.length, 3) * 90,
      props: { title, slides },
    };
  }
  if (ch.includes('pinterest')) {
    return {
      compositionId: 'Pinterest',
      fps: 30, width: 1000, height: 1500,
      durationInFrames: 240,
      props: {
        title,
        hookLine: extracted.hookLine  || title.slice(0, 40).toUpperCase(),
        items:    extracted.items     || [],
        ctaLine:  extracted.ctaLine   || 'GET THE FULL ROADMAP',
      },
    };
  }
  if (ch.includes('youtube')) {
    const beats = extracted.beats || [];
    const HOOK_F  = 210;
    const BEAT_F  = 210;
    const CTA_F   = 150;
    const totalFrames = HOOK_F + beats.length * BEAT_F + CTA_F;
    return {
      compositionId: 'YouTube',
      fps: 30, width: 1920, height: 1080,
      durationInFrames: totalFrames,
      props: {
        title,
        hookLine:    extracted.hookLine    || title.slice(0, 50).toUpperCase(),
        hookSubline: extracted.hookSubline || '',
        hookStat:    extracted.hookStat    || null,
        beats,
        ctaLine:     extracted.ctaLine     || 'LEARN MORE AT SIMPLENURSING.COM',
        stat:        extracted.stat        || undefined,
      },
    };
  }
  // TikTok (default)
  return {
    compositionId: 'TikTok',
    fps: 30, width: 1080, height: 1920,
    durationInFrames: 300,
    props: {
      title,
      hookLine:    extracted.hookLine    || title.slice(0, 50).toUpperCase(),
      hookSubline: extracted.hookSubline || '',
      items:       (extracted.items || []).slice(0, 9),
      ctaLine:     extracted.ctaLine     || 'LEARN MORE',
      stat:        extracted.stat        || undefined,
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const rankArg = args.includes('--rank')
    ? parseInt(args[args.indexOf('--rank') + 1])
    : null;

  console.log('═'.repeat(65));
  console.log('  NOVA GTM — Remotion Studio-Quality Render');
  console.log(`  ${new Date().toISOString().slice(0, 16)} UTC`);
  console.log('═'.repeat(65));

  const records = await fetchApproved(rankArg);
  console.log(`\n  Found ${records.length} content-approved brief(s):`);
  for (const r of records)
    console.log(`    #${r.fields.Rank} ${r.fields.Channel} — ${r.fields.Title?.slice(0, 55)}`);

  console.log('\n  Bundling Remotion...');
  const bundled = await bundle({
    entryPoint: resolve(__dirname, 'src', 'Root.tsx'),
    webpackOverride: (config) => config,
  });
  console.log('  ✓ Bundle ready\n');

  const results = [];

  for (const record of records) {
    const f       = record.fields;
    const rank    = f['Rank'];
    const title   = f['Title']   || '';
    const channel = f['Channel'] || 'TikTok';
    const hook    = f['Hook']    || '';
    const content = f['Content Preview'] || '';

    console.log(`\n[${'#' + rank}] ${channel.toUpperCase()} — ${title.slice(0, 60)}`);

    console.log('  → Extracting visual elements (Gemini Flash)...');
    const extracted = await extractProps(rank, title, channel, hook, content);
    const itemCount = extracted.items?.length || extracted.slides?.length || 0;
    console.log(`  ✓ Extracted: ${itemCount} items/slides`);

    const { compositionId, fps, width, height, durationInFrames, props } =
      buildCompositionConfig(channel, title, extracted);

    const briefDir = join(OUT_DIR, `brief_${rank}`);
    await mkdir(briefDir, { recursive: true });
    const outPath = join(briefDir, 'video_remotion.mp4');

    console.log(`  → Rendering ${compositionId} (${width}×${height}, ${durationInFrames}f @ ${fps}fps)...`);

    try {
      const comp = await selectComposition({
        serveUrl: bundled,
        id: compositionId,
        inputProps: props,
      });

      await renderMedia({
        composition: { ...comp, durationInFrames, fps, width, height },
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: outPath,
        inputProps: props,
        logLevel: 'quiet',
        onProgress: ({ progress }) => {
          process.stdout.write(`\r  Progress: ${Math.round(progress * 100)}%   `);
        },
      });

      console.log(`\n  ✓ Saved: output/animations/brief_${rank}/video_remotion.mp4`);
      results.push({ rank, status: 'success', path: outPath });
    } catch (err) {
      console.error(`\n  ✗ Render failed: ${err.message}`);
      results.push({ rank, status: 'error', error: err.message });
    }
  }

  console.log('\n' + '═'.repeat(65));
  const ok = results.filter(r => r.status === 'success');
  console.log(`  DONE — ${ok.length}/${results.length} rendered`);
  for (const r of results) {
    const icon = r.status === 'success' ? '✓' : '✗';
    const label = r.status === 'success'
      ? r.path.split('/').slice(-3).join('/')
      : r.error;
    console.log(`  ${icon} #${r.rank} — ${label}`);
  }
  console.log('═'.repeat(65));
}

main().catch(err => { console.error(err); process.exit(1); });
