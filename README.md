# SimpleNursing AI Studio

> **Autonomous content production studio** — from research to published video, with humans in the loop at the approval gate only.

Built by Colibri Group for SimpleNursing. Powered by Google Veo3, OmniHuman, Fish Audio, Remotion, and a 15-file brand brain.

---

## What This Is

Most content studios have 10 humans doing what this system does autonomously:

| Role | What a human does | What this system does |
|---|---|---|
| Research | Scans nursing forums, TikTok trends, Reddit | AI scrapes 1000s of sources, scores by potential |
| Brief writing | Content strategist writes hook + script | AI writes brief, hook, production plan |
| Approval | Creative director approves | **Chad approves in Airtable** ← only human gate |
| Voice | Voice actor records | Fish Audio → Sarah voice (female, conversational) |
| Talking head | Videographer + talent | OmniHuman v1.5 → 24s AI talking head |
| Video production | Editor + motion designer | Veo3 + Remotion → branded composite |
| Carousel | Graphic designer | Python PIL → pixel-perfect slides, zero spelling errors |
| Publishing | Social media manager | Auto-syncs to Airtable + GitHub CDN |

**The human approves once. The AI does the rest.**

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVOLOTION PIPELINE                           │
└─────────────────────────────────────────────────────────────────┘

  DISCOVER                APPROVE             PRODUCE             PUBLISH
─────────────         ─────────────        ─────────────       ─────────────
                                                                
  AI Research      →   Airtable Brief  →   AI Studio      →   GitHub CDN
  (1000s sources)      (Chad approves)     (agents run)       + Airtable
                                                               Asset Library
                            │
                            ▼
               Content Brief (Airtable)
               ┌─────────────────────┐
               │ Title               │
               │ Hook line           │
               │ Full script         │  ← AI-written, human-approved
               │ Channel (TikTok/IG) │
               │ Rank score          │
               │ Creative Approved ✓ │  ← Chad clicks this
               └─────────────────────┘
                            │
                            ▼
               AI Studio Dashboard (localhost:3004)
               ┌─────────────────────────────────┐
               │                                 │
               │  1 Brief → 2 Script → 3 Produce → 4 Output  │
               │                                 │
               └──────────┬──────────────────────┘
                          │
              ┌───────────┼───────────────┐
              ▼           ▼               ▼
         Voice Agent  Video Agent    Image Agent
         (Fish Audio  (OmniHuman +   (Imagen4 +
          Sarah)       Veo3 + Kling)   PIL + Flux)
              │           │               │
              └───────────┴───────────────┘
                          │
                          ▼
               Remotion Studio (localhost:3003)
               ┌─────────────────────────────────┐
               │  AI video + brand overlays       │
               │  Captions + watermark + CTA      │  ← edit live like Adobe
               │  Export final branded MP4        │
               └─────────────────────────────────┘
                          │
                          ▼
               GitHub Releases CDN → Airtable Produced Videos
```

---

## Quick Start

### Prerequisites

```bash
node --version    # 18+
python3 --version # 3.9+
ffmpeg -version   # any recent version
```

Install ffmpeg if missing:
```bash
brew install ffmpeg   # macOS
```

### 1. Clone and install

```bash
git clone https://github.com/samcolibri/aistudio.git
cd aistudio
npm install

# Remotion (video editor)
cd remotion && npm install && cd ..

# Python carousel generator
pip3 install Pillow
```

### 2. Configure API keys

```bash
cp .env.example .env
# Open .env and fill in your keys (see API Keys section below)
```

### 3. Launch

**Terminal 1 — Production Dashboard:**
```bash
npx tsx src/dashboard/server.ts
# → http://localhost:3004
```

**Terminal 2 — Remotion Video Editor:**
```bash
cd remotion
node node_modules/@remotion/cli/remotion-cli.js studio src/Root.tsx --port 3003
# → http://localhost:3003
```

Open both in your browser. That's it.

---

## The Two Interfaces

### localhost:3004 — AI Studio Dashboard

The production command center. Pipeline-first layout:

```
┌──────┬──────────────────┬────────────────────────────────────────┐
│ 📋   │  Approved Briefs │  Pipeline Workspace                    │
│ 🎬   │  ─────────────   │                                        │
│ 🎨   │  [Brief #1]      │  1 Brief → 2 Script → 3 Produce → 4  │
│ 🧑‍⚕️  │  [Brief #2]      │                                        │
│ ⚡   │  [Brief #3]      │  Step 1: See the brief, hook, plan    │
│ ⚙️   │  ...             │  Step 2: Full script + voice preview   │
│      │                  │  Step 3: Hit Produce → watch live log │
│      │                  │  Step 4: Inline video playback        │
└──────┴──────────────────┴────────────────────────────────────────┘
```

**Sidebar icons:**
- 📋 Pipeline — the main workflow
- 🎬 AI Videos — gallery of all 18 produced assets (from Airtable)
- 🎨 Assets — local file browser
- 🧑‍⚕️ Mike — character poses
- ⚡ APIs — live health check for all connected services
- ⚙️ Settings — add/update API keys without touching .env

### localhost:3003 — Remotion Video Editor

Adobe Premiere-style real-time editor. Select a composition in the left sidebar:

| Composition | Source Video | Format |
|---|---|---|
| `TalkingHeadEdit` | OmniHuman female talking head | TikTok 1080×1920 |
| `Veo3Edit` | Google Veo3 AI video | TikTok 1080×1920 |
| `GoogleDirectEdit` | Google Direct 30s video | TikTok 1080×1920 |
| `TikTok` | Brand animated composition | TikTok 1080×1920 |
| `Instagram` | Carousel slides | Instagram 1080×1080 |
| `YouTube` | YouTube with Mike character | YouTube 1920×1080 |
| `Pinterest` | Educational pin | Pinterest 1000×1500 |

**Live editing:**
1. Scrub the timeline (bottom bar) — see any frame
2. Open Props panel (top right `{...}`) — change text, colors, captions live
3. Hit **Render** → export final branded MP4

---

## AI Agents

Each agent is a TypeScript script in `src/scripts/`:

### Voice Agent
```bash
# Generates Sarah female voice narration (~24s)
npx tsx src/scripts/student-omnihuman.ts
# → output/rec0kxOAXZNsJvmwO/narration_student.mp3
```
Uses Fish Audio API. Voice: Sarah, ID `933563129e564b19a115bedd57b7406a`

### Talking Head Agent (OmniHuman v1.5)
```bash
# Portrait + audio → 24.5s talking head video
npx tsx src/scripts/student-omnihuman.ts
# → output/rec0kxOAXZNsJvmwO/student_omnihuman_qt.mp4
```
Uses ByteDance OmniHuman via fal.ai. **Requires fal.ai balance.**

### Video Agent (Google Veo3)
```bash
# 5 scene × 8s clips → 30s stitched video, no API cost
npx tsx src/scripts/google-direct-30s.ts
# → output/rec0kxOAXZNsJvmwO/google_direct_final.mp4
```
Uses Google AI API. **Free tier works.**

### Kling Avatar Agent (30s)
```bash
# Splits audio into 3 segments → 3 Kling clips → stitch
npx tsx src/scripts/kling-30s-final.ts
# → output/rec0kxOAXZNsJvmwO/kling30_final.mp4
```
Uses Kling AI Avatar v2 Pro via fal.ai. **Requires fal.ai balance.**

### Image Agent (Flux / Imagen4)
```bash
# Generate student portrait with direct eye contact (for OmniHuman)
npx tsx src/scripts/gen-face-direct.ts   # Google Imagen4 — free
npx tsx src/scripts/gen-face-flux.ts     # Flux Pro Ultra — requires fal.ai balance
```

### Carousel Agent (PIL — zero AI cost)
```bash
# 6-slide "Should I Be a Nurse?" carousel — pixel-perfect text
python3 src/scripts/gen-carousel-pil.py
# → output/recUm0xdiqNLg664h/carousel/slide_01-06.png
```
Pure Python Pillow. **No API key needed. Instant. Zero spelling errors.**

### Sync Agent
```bash
# Upload all produced assets to GitHub + sync to Airtable
npx tsx src/scripts/airtable-produced-all.ts     # videos
npx tsx src/scripts/airtable-sync-carousel.ts    # carousel slides
```

---

## The Brand Brain

Every agent knows the SimpleNursing brand. The brain lives in `docs/ocl-brain/`:

```
docs/ocl-brain/
├── personas/          # Student Nurse Sara, RN Mike — full psychographic profiles
├── icp-mapping/       # ICP segments, pain points, decision triggers
├── pov-templates/     # POV frameworks for each content type
├── case-studies/      # What worked, what didn't, why
└── 2026-reports/      # Market research, trend data
```

Agents call `pick_brain_files()` + `read_brain_file()` at runtime to load relevant context before generating content. The brain is version-controlled — it grows with every campaign.

---

## Airtable Structure

Two bases, always in sync:

### Content Briefs Base (`appLFh438nLooz6u7`)
Where ideas are born, ranked, and approved.

| Field | What it means |
|---|---|
| Title | Content title |
| Hook | Opening line that stops the scroll |
| Content Preview | Full AI-written script |
| Channel | tiktok / instagram / pinterest / youtube |
| Score | AI-ranked potential (0-100) |
| Creative Approved? | **Chad clicks this** — the only human gate |
| Creative Link | Link to produced asset (auto-filled after production) |

### AI Studio Base (`app4LEuOXBxPArLsr`) — Produced Videos
Where completed assets live.

| Field | What it means |
|---|---|
| Name | Asset name |
| Type | AI Generated |
| Channel | Target platform |
| Status | Draft / Final |
| GitHub URL | Direct CDN link to the file |
| Brief ID | Links back to the brief that spawned it |
| Date Produced | When it was made |
| Notes | Agent notes, model used, settings |

**Live view:** https://airtable.com/app4LEuOXBxPArLsr

---

## API Keys Reference

| Key | Where to get it | Cost | Used for |
|---|---|---|---|
| `GOOGLE_AI_KEY` | aistudio.google.com | Free | Veo3 video, Imagen4 images |
| `FISH_AUDIO_API_KEY` | fish.audio/go-api | ~$2 to start | Sarah voice narration |
| `FAL_KEY` | fal.ai/dashboard/keys | Pay-per-use | OmniHuman, Kling, Flux |
| `AIRTABLE_API_KEY` | airtable.com/create/tokens | Free | Read/write briefs + assets |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Pay-per-use | Script analysis (optional) |

**Minimum to run (free or near-free):**
- `GOOGLE_AI_KEY` — Veo3 + Imagen4 + carousel-free path
- `AIRTABLE_API_KEY` — read briefs from Airtable
- `FISH_AUDIO_API_KEY` — voice (one-time $2 load)

**To unlock talking-head videos:**
- `FAL_KEY` with balance — OmniHuman + Kling

---

## What Gets Produced

From one approved brief, the system produces:

```
output/{briefId}/
├── narration_student.mp3      # 24s female voice narration
├── student_omnihuman_qt.mp4   # OmniHuman talking head (best)
├── google_direct_final.mp4    # Veo3 30s video (5 scenes)
├── veo3_final.mp4             # Alternative Veo3 cut
├── kling30_final.mp4          # Kling Avatar 30s (3 segments)
├── tiktok_final.mp4           # Remotion brand composite
└── carousel/                  # (for Instagram briefs)
    ├── slide_01.png
    ├── slide_02.png
    └── ...
```

All assets auto-uploaded to GitHub Releases + synced to Airtable with public URLs.

---

## Produced Assets (as of 2026-05-01)

18 assets live at: https://github.com/samcolibri/aistudio/releases/tag/simplenursing-assets-2026-05-01

**Talking head video (OmniHuman v1.5):**
https://github.com/samcolibri/aistudio/releases/download/simplenursing-assets-2026-05-01/student_omnihuman_qt.mp4

**"Should I Be a Nurse?" carousel (6 slides):**
https://github.com/samcolibri/aistudio/releases/download/simplenursing-assets-2026-05-01/slide_01.png
https://github.com/samcolibri/aistudio/releases/download/simplenursing-assets-2026-05-01/slide_02.png
https://github.com/samcolibri/aistudio/releases/download/simplenursing-assets-2026-05-01/slide_03.png
https://github.com/samcolibri/aistudio/releases/download/simplenursing-assets-2026-05-01/slide_04.png
https://github.com/samcolibri/aistudio/releases/download/simplenursing-assets-2026-05-01/slide_05.png
https://github.com/samcolibri/aistudio/releases/download/simplenursing-assets-2026-05-01/slide_06.png

---

## Tech Stack

| Layer | Technology |
|---|---|
| Dashboard | Node.js HTTP + React (CDN, no build step) |
| Video editor | Remotion 4.0.450 + React 18 |
| Talking head | OmniHuman v1.5 (ByteDance / fal.ai) |
| AI video | Google Veo3 direct API |
| AI images | Google Imagen4 Ultra + Flux Pro Ultra |
| Voice | Fish Audio Sarah (female, conversational) |
| Carousel | Python Pillow (PIL) |
| Brand motion | Remotion spring physics animations |
| Asset CDN | GitHub Releases |
| Asset library | Airtable |
| Scripts | TypeScript (tsx) |
| Types | Strict TypeScript throughout |

---

## Repo Structure

```
aistudio/
├── src/
│   ├── dashboard/
│   │   └── server.ts          # Dashboard server + full React SPA (inline)
│   ├── scripts/               # One script per agent
│   │   ├── student-omnihuman.ts   # OmniHuman talking head
│   │   ├── google-direct-30s.ts   # Veo3 30s video
│   │   ├── kling-30s-final.ts     # Kling Avatar 30s
│   │   ├── gen-face-direct.ts     # Imagen4 portrait generation
│   │   ├── gen-carousel-pil.py    # PIL carousel (no AI cost)
│   │   ├── airtable-produced-all.ts   # Sync all videos to Airtable
│   │   └── airtable-sync-carousel.ts  # Sync carousel to Airtable
│   ├── client/                # API clients (typed)
│   │   ├── airtable.ts
│   │   ├── google-ai.ts
│   │   ├── fish-audio.ts
│   │   ├── fal.ts
│   │   └── kling.ts
│   ├── pipeline/              # Orchestration
│   │   └── orchestrate.ts     # Master pipeline runner
│   └── types/
│       └── brief.ts           # ContentBrief type
├── remotion/
│   ├── src/
│   │   ├── Root.tsx           # All composition registrations
│   │   └── compositions/
│   │       ├── VideoEditorComposition.tsx  # AI video editor
│   │       ├── TikTok.tsx
│   │       ├── Instagram.tsx
│   │       ├── YouTube.tsx
│   │       └── Pinterest.tsx
│   └── public/
│       ├── ai-videos/         # AI-produced videos (for Remotion)
│       └── simplenursing-logo.png
├── output/                    # Produced assets (gitignored)
├── .env.example               # Template — copy to .env
└── README.md                  # This file
```

---

## The Evolotion System

This repo is the **production layer** of a larger autonomous system called Evolotion.

```
EVOLOTION — End-to-End Autonomous Content Intelligence

┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1: INTELLIGENCE                                              │
│  AI scans 1000s of nursing forums, TikTok, Reddit, search trends   │
│  → Scores each idea by virality potential                           │
│  → Writes hook + full script + production brief                     │
│  → Ranks all ideas in Airtable by score                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼ (one human checkpoint)
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2: HUMAN GATE                                                │
│  Chad reviews ranked briefs in Airtable                             │
│  Approves: clicks "Creative Approved" checkbox                       │
│  Rejects: leaves unchecked or edits hook                            │
│  Time cost: ~2 minutes per brief                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 3: PRODUCTION (this repo)                                    │
│                                                                     │
│  Voice Agent    → Sarah narrates the script (Fish Audio)            │
│  Portrait Agent → Female nursing student (Imagen4/Flux)             │
│  Talking Head   → OmniHuman syncs portrait to voice (24.5s)         │
│  Video Agent    → Veo3 generates b-roll (5 × 8s scenes)             │
│  Kling Agent    → Kling Avatar creates 30s talking head             │
│  Carousel Agent → PIL generates 6 brand slides (instant, free)      │
│  Compositor     → Remotion adds brand layer (text, logo, CTA)       │
│                                                                     │
│  All agents share the brand brain (OCL — 15 documents)              │
│  All outputs auto-sync to Airtable + GitHub CDN                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4: DELIVERY                                                  │
│  Human reviews final video in Airtable (has the GitHub link)        │
│  Posts to TikTok / Instagram / YouTube / Pinterest                  │
│  Time cost: ~5 minutes per piece                                    │
└─────────────────────────────────────────────────────────────────────┘

Total human time per piece of content: ~7 minutes
AI production time: ~8-15 minutes (running in background)
Human content team replaced: 10 roles
```

---

## Blockers / What to Resume

| Item | Status | Action needed |
|---|---|---|
| fal.ai balance | EXHAUSTED | Top up at fal.ai/dashboard/billing |
| OmniHuman re-run | BLOCKED | Top up fal.ai, then `npx tsx src/scripts/student-omnihuman.ts` |
| Kling 30s | BLOCKED | Top up fal.ai, then `npx tsx src/scripts/kling-30s-final.ts` |
| Timeline carousel | NOT BUILT | Brief `recZ7k8XmDY3iYDoz` — copy gen-carousel-pil.py approach |
| Pinterest pin | PARTIAL | Brief `recG1hn62Xr1w08OM` — regenerate with better prompt |

---

## License

Internal tool — Colibri Group proprietary. Not for redistribution.
