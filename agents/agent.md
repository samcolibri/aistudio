# Evolotion — 3-Agent Autonomous Content Pipeline

> **Evolotion** is SimpleNursing's autonomous content production system.  
> A human approves a brief in Airtable. Three AI agents take it from there — script, images, cloud delivery — with a learning brain that improves every run.

---

## System Overview

```
Airtable (Human Approved)
        │
        ▼
┌───────────────────┐
│  Agent 1          │  BriefForge
│  Brief → Script   │  Parses V5 script, builds image prompts
│  + Image Prompts  │  Saves: agent1_output.json
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Agent 2          │  ImageForge
│  Prompts → Images │  DALL-E 3 HD + Ideogram v2 in parallel
│  (2 per brief)    │  Selects best 1 per model
│                   │  Saves: agent2_output.json + images/
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Agent 3          │  CloudPublish
│  Images → Cloud   │  Microsoft Graph API
│  OneDrive /       │  Creates: AI Studio/{channel}/{title}/
│  SharePoint       │  Uploads: script + images + share links
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Agent Brain      │  Super Brain (Learning Loop)
│  runs.jsonl       │  Logs every run, scores quality
│  model.json       │  Feeds context back into next run
└───────────────────┘
```

---

## Quick Start

```bash
# 1. Clone + install
git clone https://github.com/samcolibri/aistudio.git
cd aistudio
cp .env.example .env
# Fill in your API keys (see Required Keys below)

# 2. Install agent dependencies
pip3 install httpx python-dotenv

# 3. Run the full pipeline (all approved briefs)
python3 agents/run_pipeline.py

# 4. Run for a specific brief
python3 agents/run_pipeline.py --brief-id rec0kxOAXZNsJvmwO

# 5. Run a single agent
python3 agents/run_pipeline.py --agent 1   # BriefForge only
python3 agents/run_pipeline.py --agent 2   # ImageForge only
python3 agents/run_pipeline.py --agent 3   # CloudPublish only

# 6. Check the brain
python3 agents/run_pipeline.py --brain
```

---

## Agent 1 — BriefForge

**File:** `agents/agent_1_brief_forge.py`

**What it does:**
- Fetches all `Creative Approved` briefs from Airtable
- Reads the full row — every version of Chad's feedback, V5 script, hook, keyword
- Parses the script into structured sections: `hook`, `body`, `cta`, `visual_directions`
- Builds 2–3 AI image prompts per brief:
  - **Prompt A** — Photorealistic: young nursing student, clinical setting
  - **Prompt B** — Bold graphic/infographic: dark background, teal + yellow accents
  - **Prompt C** — Carousel cover (Instagram only): swipe indicator, minimal
- Injects brand context: SimpleNursing colors (`#00B5CC`, `#FF4B8B`, `#FFD700`, `#0A0F1E`)

**Input:** Airtable row (via API)  
**Output:** `agents/output/{brief_id}/agent1_output.json`

```json
{
  "brief": { "id": "rec...", "title": "...", "channel": "TikTok", "hook": "..." },
  "script": { "hook": "...", "body": "...", "cta": "...", "visual_directions": [...] },
  "image_prompts": [
    { "variant": "A", "style": "photorealistic", "format": "9:16", "prompt": "..." },
    { "variant": "B", "style": "graphic_design",  "format": "9:16", "prompt": "..." }
  ],
  "production_notes": { "recommended_voice": "Sarah (Fish Audio ...)" }
}
```

**CLI:**
```bash
python3 agents/agent_1_brief_forge.py --list          # list all approved
python3 agents/agent_1_brief_forge.py --all           # process all
python3 agents/agent_1_brief_forge.py --brief-id recXXX
```

**Required env vars:** `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`

---

## Agent 2 — ImageForge

**File:** `agents/agent_2_image_forge.py`

**What it does:**
- Reads `agent1_output.json` for each brief
- For each image prompt variant (A, B, C):
  - Runs **DALL-E 3 HD** and **Ideogram v2** in parallel (ThreadPoolExecutor)
  - Saves all 4–6 images as PNG files
- Auto-scores each image (0–1) based on model, variant, and file size
- Selects the best 1 per model (highest score):
  - `dalle3_best.png` — photorealistic winner
  - `ideogram_best.png` — graphic/text winner
- Registers top prompts with the brain for future reuse

**Input:** `agents/output/{brief_id}/agent1_output.json`  
**Output:** `agents/output/{brief_id}/agent2_output.json` + `agents/output/{brief_id}/images/`

```
agents/output/{brief_id}/images/
  dalle3_A.png
  dalle3_B.png
  ideogram_A.png
  ideogram_B.png
  (dalle3_C.png / ideogram_C.png for Instagram carousels)
```

**CLI:**
```bash
python3 agents/agent_2_image_forge.py --all
python3 agents/agent_2_image_forge.py --brief-id recXXX
```

**Required env vars:** `OPENAI_API_KEY`, `IDEOGRAM_API_KEY`

---

## Agent 3 — CloudPublish

**File:** `agents/agent_3_cloud_publish.py`

**What it does:**
- Authenticates with Microsoft Graph API (OAuth2 client credentials)
- Creates folder hierarchy in OneDrive/SharePoint:
  ```
  AI Studio/
    TikTok/
      Your High School Checklist/
        agent1_output.json  ← script
        dalle3_A.png
        ideogram_B.png
  ```
- Creates anonymous share links for every uploaded file
- Writes `agent3_output.json` with all file URLs

**Input:** `agent1_output.json` + `agent2_output.json`  
**Output:** `agents/output/{brief_id}/agent3_output.json`

```json
{
  "folder_path": "AI Studio/TikTok/Your High School Checklist",
  "uploaded": [
    { "file": "agent1_output.json", "type": "script", "url": "https://..." },
    { "file": "dalle3_A.png", "model": "dalle3", "url": "https://..." }
  ]
}
```

**CLI:**
```bash
python3 agents/agent_3_cloud_publish.py --all
python3 agents/agent_3_cloud_publish.py --brief-id recXXX
```

**Required env vars:** `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`  
**Optional:** `MS_SHAREPOINT_SITE` (e.g. `colibrigroup.sharepoint.com`), `MS_DRIVE_FOLDER` (default: `AI Studio`)

---

## Agent Brain — Super Brain

**File:** `agents/agent_brain.py`

**What it does:**
- Logs every agent run to `agents/brain/runs.jsonl` (append-only ground truth)
- Derives live stats to `agents/brain/model.json`:
  - Per-agent: run count, avg quality score, last run timestamp
  - Per-channel: learned insights (what works for TikTok vs Instagram)
  - Top prompt winners: best 50 prompts by score, reused in future runs
- Each agent calls `get_context()` before running → gets back:
  - Historical avg quality for this agent
  - Top performing prompts for this channel
  - This brief's past performance

**Storage:**
```
agents/brain/
  runs.jsonl     ← immutable audit log (one JSON record per line)
  model.json     ← derived model state (rebuilt from runs.jsonl)
```

**Python API:**
```python
from agent_brain import log_run, score_run, get_context, register_prompt_winner

# After a run
run_id = log_run("ImageForge", brief_id, input_data, output_data, quality_score=0.85)

# After human review
score_run(run_id, score=0.92, notes="Great text rendering on Ideogram B")

# Before a run (agent calls this to get smarter)
ctx = get_context("ImageForge", "tiktok", brief_id)
# Returns: avg_quality, top_prompts_for_channel, brief_past_performance
```

---

## Required API Keys

| Key | Agent | Where to get |
|-----|-------|-------------|
| `AIRTABLE_API_KEY` | Agent 1 | airtable.com/create/tokens |
| `AIRTABLE_BASE_ID` | Agent 1 | Pre-filled: `appLFh438nLooz6u7` |
| `OPENAI_API_KEY` | Agent 2 | platform.openai.com/api-keys |
| `IDEOGRAM_API_KEY` | Agent 2 | ideogram.ai/api |
| `MS_CLIENT_ID` | Agent 3 | Azure portal → App registrations |
| `MS_CLIENT_SECRET` | Agent 3 | Azure portal → App registrations |
| `MS_TENANT_ID` | Agent 3 | Azure portal → Overview |
| `MS_SHAREPOINT_SITE` | Agent 3 | Optional: e.g. `colibrigroup.sharepoint.com` |
| `MS_DRIVE_FOLDER` | Agent 3 | Optional, default: `AI Studio` |

---

## Output Structure

```
agents/
  output/
    {brief_id}/
      agent1_output.json    ← script + prompts (from Agent 1)
      agent2_output.json    ← image selection (from Agent 2)
      agent3_output.json    ← cloud URLs (from Agent 3)
      images/
        dalle3_A.png
        dalle3_B.png
        ideogram_A.png
        ideogram_B.png
  brain/
    runs.jsonl              ← every run logged here
    model.json              ← learned model state
```

---

## Azure App Setup (Agent 3)

To upload to OneDrive/SharePoint, create an Azure app with these permissions:

1. Go to [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations → New registration
2. Add API permissions: `Files.ReadWrite.All` (application permission, not delegated)
3. Grant admin consent
4. Create a client secret under Certificates & secrets
5. Copy `Application (client) ID` → `MS_CLIENT_ID`
6. Copy `Directory (tenant) ID` → `MS_TENANT_ID`
7. Copy the secret value → `MS_CLIENT_SECRET`

---

## Brand Constants (auto-injected by all agents)

```python
BRAND = {
    "name": "SimpleNursing",
    "colors": {
        "teal":   "#00B5CC",
        "pink":   "#FF4B8B",
        "yellow": "#FFD700",
        "dark":   "#0A0F1E",
        "blue":   "#1E90FF",
    },
    "audience": "Gen Z nursing students, female 17-18",
    "voice":    "Sarah — Fish Audio 933563129e564b19a115bedd57b7406a",
    "handle":   "@simplenursing",
}
```
