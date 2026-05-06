<div align="center">

# EVOLOTION

### Autonomous Content Production System for SimpleNursing

*From research brief to production-ready script — zero human involvement after the approval click*

---

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Airtable](https://img.shields.io/badge/Airtable-Real--time-18BFFF?style=for-the-badge&logo=airtable&logoColor=white)](https://airtable.com)
[![OpenAI](https://img.shields.io/badge/DALL·E%203-HD-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com)
[![Ideogram](https://img.shields.io/badge/Ideogram-v2-FF6B35?style=for-the-badge)](https://ideogram.ai)
[![Microsoft](https://img.shields.io/badge/Microsoft%20Graph-OneDrive-0078D4?style=for-the-badge&logo=microsoftsharepoint&logoColor=white)](https://graph.microsoft.com)
[![Fish Audio](https://img.shields.io/badge/Fish%20Audio-Sarah%20Voice-00709C?style=for-the-badge)](https://fish.audio)

---

**A human approves a brief in Airtable. Three AI agents take it from there.**

</div>

---

## The Pipeline at a Glance

```mermaid
flowchart TD
    A[("🗃️ Airtable\nContent Briefs Base")] -->|"Real-time scan\n(paginated, all rows)"| B

    subgraph AGENT1["🔬 Agent 1 — BriefForge"]
        B["Filter:\nContent Approved? = Approved"]
        B --> C["Pick best script version\nV5 → V4 → V3 → V2 → V1"]
        C --> D["Parse script sections\nHook · Body · CTA · Visual Cues"]
        D --> E["Collect Chad feedback trail\nV1 → V5 + General"]
        E --> F[("📄 agent1_output.json")]
    end

    subgraph AGENT2["🖼️ Agent 2 — ImageForge"]
        G["Read image prompts\nfrom agent1_output"]
        G --> H["Run in parallel\n(ThreadPoolExecutor)"]
        H --> H1["DALL·E 3 HD\nPhotorealistic variants"]
        H --> H2["Ideogram v2\nGraphic / text variants"]
        H1 --> I["Auto-score images\n(model × variant × file size)"]
        H2 --> I
        I --> J["Select best 1 per model\ndalle3_best.png · ideogram_best.png"]
        J --> K[("📄 agent2_output.json\n🖼️ images/")]
    end

    subgraph AGENT3["☁️ Agent 3 — CloudPublish"]
        L["OAuth2 auth\nMicrosoft Graph API"]
        L --> M["Create folder hierarchy\nAI Studio / Channel / Title"]
        M --> N["Upload: script + images"]
        N --> O["Generate anonymous share links"]
        O --> P[("📄 agent3_output.json\n🔗 OneDrive URLs")]
    end

    subgraph BRAIN["🧠 Agent Brain — Super Brain"]
        Q[("runs.jsonl\nImmutable audit log")]
        R[("model.json\nDerived model state")]
        Q --> R
    end

    F --> G
    K --> L
    P --> Q
    F --> Q
    K --> Q
    R -->|"get_context() before each run"| AGENT1
    R -->|"get_context() before each run"| AGENT2

    style AGENT1 fill:#0a2a3a,stroke:#00709c,color:#fff
    style AGENT2 fill:#0a2a3a,stroke:#fad74f,color:#fff
    style AGENT3 fill:#0a2a3a,stroke:#fc3467,color:#fff
    style BRAIN  fill:#1a1a2e,stroke:#75c7e6,color:#fff
```

---

## Approval Pipeline — Three Human Gates

```mermaid
flowchart LR
    IDEA["💡 Idea / Research\n(AI-sourced or human)"]

    subgraph G1["Gate 1"]
        BA["Brief Approved?\n☐ → ✓"]
    end

    subgraph G2["Gate 2 — Script Gate"]
        CA["Content Approved?\n☐ → ✓\n\n← THIS triggers Agent 1"]
    end

    subgraph G3["Gate 3 — Production Gate"]
        CRA["Creative Approved?\n☐ → ✓\n\n← Unlocks full pipeline"]
    end

    subgraph PROD["⚙️ Production"]
        AGT["Agents 1 · 2 · 3\nrun autonomously"]
    end

    IDEA --> G1 --> G2 --> G3 --> PROD

    style G1  fill:#1a2a1a,stroke:#4CAF50,color:#fff
    style G2  fill:#0a2a3a,stroke:#00709c,color:#fff
    style G3  fill:#2a1a2a,stroke:#fc3467,color:#fff
    style PROD fill:#1a1a2e,stroke:#fad74f,color:#fff
```

> At peak velocity: **9 Content-Approved** briefs feed Agent 1, **5 Creative-Approved** briefs feed the full pipeline.

---

## Version 2 Living Table — Research-to-Production Flow

```mermaid
flowchart TD
    subgraph RESEARCH["🔍 Research Layer (Version 2 Living Table)"]
        S1["Scout Sources\n100+ URLs per brief"]
        S2["SERP data\n100K+ monthly searches"]
        S3["MAYA ICP Signal\nAge 15–18 female, pre-nursing"]
    end

    subgraph BRIEF["📋 Brief Layer"]
        B1["Business Case\nWhy this topic wins"]
        B2["Content Brief\nHook · Script · Angle"]
        B3["Creative Brief\nVisual direction · Brand overlay"]
    end

    subgraph READINESS["✅ Readiness Signal"]
        R1["Readiness: Draft → Ready → Live"]
        R2["Freshness: Fresh → Stale → Evergreen"]
        R3["Maya Segment\nICP match score"]
    end

    subgraph OUTPUT["🚀 Production Ready"]
        O1["Rank [8,12,17,26,29,32,36,38]\nv2_approved: true"]
        O2["Surfaced at top of\nScripts dashboard"]
        O3["Full pipeline eligible"]
    end

    RESEARCH --> BRIEF --> READINESS --> OUTPUT

    style RESEARCH fill:#0a2a2a,stroke:#75c7e6,color:#fff
    style BRIEF    fill:#0a1a2a,stroke:#00709c,color:#fff
    style READINESS fill:#1a2a1a,stroke:#4CAF50,color:#fff
    style OUTPUT   fill:#2a1a0a,stroke:#fad74f,color:#fff
```

---

## Agent Brain — Self-Improving Learning Loop

```mermaid
flowchart LR
    subgraph INPUTS["Inputs"]
        I1["Agent name\n(BriefForge / ImageForge)"]
        I2["Brief ID\n(rec...)"]
        I3["Channel\n(tiktok / instagram)"]
    end

    subgraph BRAIN["🧠 Agent Brain"]
        direction TB
        B1["log_run()\nAppend to runs.jsonl"]
        B2["score_run()\nHuman rates quality 0.0–1.0"]
        B3["register_prompt_winner()\nSave best prompts by channel"]
        B4["Rebuild model.json\nfrom runs.jsonl"]
        B5["get_context()\nReturn: avg quality + top prompts"]
    end

    subgraph OUTPUTS["Outputs"]
        O1["avg_quality per agent"]
        O2["top_prompts per channel\n(top 50 reused)"]
        O3["brief_past_performance"]
    end

    INPUTS --> B1 --> B4
    B2 --> B4
    B3 --> B4
    B4 --> B5
    B5 --> OUTPUTS
    OUTPUTS -->|"injected before next run"| INPUTS

    style BRAIN fill:#1a1a2e,stroke:#75c7e6,color:#fff
```

**Storage:**
```
agents/brain/
  runs.jsonl     ← immutable append-only audit log
  model.json     ← derived model state (rebuilt from runs)
```

---

## Quick Start

### Run Agent 1 in 3 steps

```bash
# 1. Clone
git clone https://github.com/samcolibri/aistudio.git
cd aistudio/agents

# 2. Set your Airtable key (only env var needed)
echo "AIRTABLE_API_KEY=patXXXXXXXXXXXXXX" > .env

# 3. Run — auto-installs httpx + python-dotenv on first run
python3 agent.py --list          # show all Content Approved briefs
python3 agent.py --all           # process all → saves JSON per brief
python3 agent.py --brief-id rec0kxOAXZNsJvmwO   # one brief only
python3 agent.py --v2            # Version 2 Living table
python3 agent.py --v2 --all      # process all V2 briefs
```

### Run the full pipeline

```bash
cd aistudio
cp .env.example .env    # fill in API keys (see table below)

python3 agents/run_pipeline.py             # all approved briefs
python3 agents/run_pipeline.py --agent 1   # BriefForge only
python3 agents/run_pipeline.py --agent 2   # ImageForge only
python3 agents/run_pipeline.py --agent 3   # CloudPublish only
python3 agents/run_pipeline.py --brain     # check learned model
```

### Launch the dashboard

```bash
npx tsx src/dashboard/server.ts
# → http://localhost:3004
```

---

## Agent 1 — BriefForge

> **Reads every Airtable row in real-time. Picks the best script. Parses it into production-ready sections.**

```mermaid
flowchart LR
    AT[("Airtable\nAll rows paginated")] -->|"filter: Content Approved? = Approved"| BF

    subgraph BF["BriefForge Transform"]
        direction TB
        P1["pick_best_script()\nV5→V4→V3→V2→V1→Preview"]
        P2["extract_script_sections()\nHook · Body · CTA · Visuals"]
        P3["build_feedback_trail()\nV1 Chad → V5 Chad → General"]
        P4["Channel format mapping\n9:16 TikTok · 1:1 IG · 2:3 Pinterest"]
        P5["Brain context injection\nget_context() → avg quality + top prompts"]
        P1 --> P2 --> P3 --> P4 --> P5
    end

    BF --> OUT[("output/{brief_id}/\nagent1_output.json")]

    style BF fill:#0a2a3a,stroke:#00709c,color:#fff
```

**Script section parser — two formats handled:**

| Format | Detection | Hook | Body | CTA |
|--------|-----------|------|------|-----|
| Structured | `**HOOK**` / `**BODY**` / `**CTA**` markers | After `**HOOK**` | After `**BODY**` | After `**CTA**` |
| Freeform | No markers detected | Line 1 | Lines 2 to n-1 | Last line |

Visual directions in `[square brackets]` are always extracted automatically from either format.

**Output JSON:**
```json
{
  "agent": "BriefForge",
  "version": "2.0",
  "brief": {
    "id": "rec0kxOAXZNsJvmwO",
    "rank": 1,
    "title": "Your High School Checklist: 9 Classes...",
    "channel": "TikTok",
    "script_version": "V5",
    "content_approved": "Approved"
  },
  "script": {
    "hook": "take these 9 classes now and nursing school...",
    "body": "class 1: anatomy and physiology...",
    "cta": "follow for more nursing content",
    "visual_directions": ["Show student at desk", "Cut to nursing campus"],
    "word_count": 273,
    "char_count": 1655
  },
  "chad_feedback": [
    { "version": "V4", "text": "tighten the hook..." },
    { "version": "V5", "text": "approved, ship it" }
  ],
  "production_notes": {
    "channel_format": { "ratio": "9:16", "size": "1080x1920" },
    "recommended_voice": "Sarah (Fish Audio 933563129e564b19a115bedd57b7406a)"
  }
}
```

**CLI:**
```bash
python3 agents/agent_1_brief_forge.py --list
python3 agents/agent_1_brief_forge.py --all
python3 agents/agent_1_brief_forge.py --brief-id recXXX
python3 agents/agent_1_brief_forge.py --refresh
```

---

## Agent 2 — ImageForge

> **Reads image prompts from Agent 1. Runs DALL·E 3 HD and Ideogram v2 in parallel. Auto-selects the best image per model.**

```mermaid
flowchart TD
    IN[("agent1_output.json\nimage_prompts: A, B, C")] --> TP

    subgraph TP["ThreadPoolExecutor — parallel generation"]
        direction LR
        D3["DALL·E 3 HD\nPhotorealistic\n(Variant A, B)"]
        ID["Ideogram v2\nGraphic / text\n(Variant A, B, C)"]
    end

    TP --> SC["Auto-score each image\n0.0 – 1.0\n(model × variant × file size)"]
    SC --> SEL["Select best 1 per model"]
    SEL --> W1["dalle3_best.png\nWinner: photorealistic"]
    SEL --> W2["ideogram_best.png\nWinner: graphic / text"]
    W1 --> OUT[("agent2_output.json\nimages/ directory")]
    W2 --> OUT
    OUT --> BRAIN["Register top prompts\nwith Agent Brain"]

    style TP fill:#0a2a0a,stroke:#fad74f,color:#fff
```

**Image prompt variants per channel:**

| Variant | Style | Format | Use case |
|---------|-------|--------|----------|
| A | Photorealistic | 9:16 (TikTok) | Female nursing student, clinical setting |
| B | Bold graphic | 9:16 (TikTok) | Dark bg, teal + yellow, infographic style |
| C | Carousel cover | 1:1 (Instagram only) | Swipe indicator, minimal, on-brand |

**CLI:**
```bash
python3 agents/agent_2_image_forge.py --all
python3 agents/agent_2_image_forge.py --brief-id recXXX
```

**Required env vars:** `OPENAI_API_KEY`, `IDEOGRAM_API_KEY`

---

## Agent 3 — CloudPublish

> **Authenticates with Microsoft Graph API. Creates folder hierarchy in OneDrive/SharePoint. Uploads all assets. Returns public share links.**

```mermaid
flowchart LR
    IN1[("agent1_output.json")] --> CP
    IN2[("images/*.png")] --> CP

    subgraph CP["CloudPublish"]
        AUTH["OAuth2 client credentials\nMS_CLIENT_ID + MS_CLIENT_SECRET"]
        AUTH --> FOLD["Create folder hierarchy\nAI Studio / Channel / Title"]
        FOLD --> UP["Upload files\nscript JSON + images"]
        UP --> LINK["Create anonymous share links\nper-file public URLs"]
    end

    LINK --> OUT[("agent3_output.json\nAll file URLs")]
    OUT --> AT[("Airtable\nasset record updated")]

    style CP fill:#2a0a1a,stroke:#fc3467,color:#fff
```

**Folder structure created in OneDrive:**
```
AI Studio/
  TikTok/
    Your High School Checklist/
      agent1_output.json
      dalle3_A.png
      ideogram_B.png
```

**CLI:**
```bash
python3 agents/agent_3_cloud_publish.py --all
python3 agents/agent_3_cloud_publish.py --brief-id recXXX
```

**Required env vars:** `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`  
**Optional:** `MS_SHAREPOINT_SITE` · `MS_DRIVE_FOLDER` (default: `AI Studio`)

---

## MAYA — Target Audience

Every piece of content this system produces is engineered for one person:

```
┌────────────────────────────────────────────────────────────────┐
│                         MAYA ICP                               │
├────────────────────────────────────────────────────────────────┤
│  Age:        15–18                                             │
│  Gender:     Female                                            │
│  Stage:      Pre-nursing consideration                         │
│  Platform:   TikTok primary · Instagram secondary              │
│  Trigger:    "Can I actually get into nursing school?"         │
│  Pain:       Confused about prerequisites, scared of failure   │
│  Win:        Clear, confident, specific answer in 30 seconds   │
├────────────────────────────────────────────────────────────────┤
│  Content that works:                                           │
│  ✓ Checklist formats ("9 classes you need to take NOW")        │
│  ✓ Quiz formats ("Are you cut out for nursing school?")        │
│  ✓ Myth-busting ("You do NOT need all A's")                    │
│  ✓ Confident female voice (Sarah, Fish Audio)                  │
│  ✓ Clinical visual setting — not a classroom                   │
└────────────────────────────────────────────────────────────────┘
```

All agents receive this ICP context at runtime via the brand brain.

---

## SimpleNursing Brand System

```mermaid
mindmap
  root((SimpleNursing))
    Colors
      Teal #00709c
      Blue #75c7e6
      Pink #fc3467
      Yellow #fad74f
      Dark #282323
      Navy #005374
    Voice
      Sarah
      Fish Audio
      ID 933563129e564b19a115bedd57b7406a
      Female · Conversational · Confident
    Channels
      TikTok 9:16 1080×1920
      Instagram 1:1 1080×1080
      Pinterest 2:3 1000×1500
      YouTube 16:9 1920×1080
    Audience
      MAYA ICP
      Age 15–18
      Female
      Pre-nursing
    Website
      simplenursing.com
```

---

## Dashboard — localhost:3004

The live production command center. Built as a single-file React SPA served by Node.js — no build step.

```
┌──────────────────────────────────────────────────────────────────┐
│  EVOLOTION DASHBOARD            localhost:3004                   │
├────────┬─────────────────────────────────────────────────────────┤
│        │                                                         │
│  📋    │  LEFT PANEL              RIGHT PANEL (reader)           │
│Scripts │  ──────────────          ──────────────────             │
│        │  🟢 READY TO PRODUCE     Brief: #8 — Title...          │
│  🔬    │  ├─ Rank #8  ✓           Hook: "take these..."         │
│ Agent1 │  ├─ Rank #12 ✓                                         │
│        │  ├─ Rank #17 ✓           📜 Creative Brief             │
│  🖼️    │  └─ Rank #38 ✓           (purple box, full text)       │
│ Images │                                                         │
│        │  📁 TABLE 1              🎣 Script                      │
│  ⚙️    │  ├─ Rank #1              Hook · Body · CTA             │
│Settings│  ├─ Rank #3              Visual cues                   │
│        │  └─ Rank #7              Word count · Char count       │
│        │                                                         │
│        │                          💬 Chad Feedback               │
│        │                          V1 → V5 → General             │
│        │                                                         │
│        │                          🔍 Scout Sources               │
│        │                          (collapsible)                  │
└────────┴─────────────────────────────────────────────────────────┘
```

**Key features:**
- V2 Approved briefs (ranks 8, 12, 17, 26, 29, 32, 36, 38) surfaced first in green "Ready to Produce" section
- Live Airtable refresh via SSE streaming (`/api/agent1-refresh`)
- Full script reader: hook, body, CTA, visual directions, feedback trail
- Creative Brief visible in purple box when present
- Scout sources collapsible

---

## Hardcoded Constants

All constants are locked. No configuration overrides allowed.

| Constant | Value | What it locks |
|----------|-------|---------------|
| `AIRTABLE_BASE_ID` | `appLFh438nLooz6u7` | SimpleNursing content briefs base |
| `AIRTABLE_TABLE_ID` | `tbl5P3J8agdY4gNtT` | Content Briefs (Live) table |
| `TABLE2_ID` | `tblrwTcoT7YNZhNA6` | Version 2 (Living) table |
| `APPROVAL_FIELD` | `Content Approved?` | Approval gate field |
| `APPROVAL_VALUE` | `Approved` | Required value to process |
| Script priority | V5 → V4 → V3 → V2 → V1 → Content Preview | Highest version always wins |
| Voice | Sarah · Fish Audio `933563129e564b19a115bedd57b7406a` | Locked narrator |
| Brand teal | `#00709c` | SimpleNursing primary |
| Brand yellow | `#fad74f` | SimpleNursing accent |
| Brand pink | `#fc3467` | SimpleNursing highlight |

---

## Airtable Schema

### Table 1 — Content Briefs (Live)

| Field | Agent | Role |
|-------|-------|------|
| `Content Approved?` | Agent 1 | **Primary gate** — must be `Approved` |
| `Creative Approved?` | Agent 2/3 | Full pipeline gate |
| `Rank` | All | Sort order |
| `Title` | All | Brief title |
| `Hook` | Agent 1 | Opening hook line |
| `Channel` | All | TikTok / Instagram / Pinterest / YouTube |
| `V5 Content` → `V1 Content` | Agent 1 | Script versions (V5 preferred) |
| `Content Preview` | Agent 1 | Pre-versioned fallback |
| `V5 Chad Feedback` → `V1 Chad Feedback` | Agent 1 | Feedback trail |
| `Feedback` | Agent 1 | General notes |
| `Score` | Agent 1 | Brief quality score |
| `Evidence Strength` | Agent 1 | Content credibility signal |

### Table 2 — Version 2 (Living)

| Field | Agent | Role |
|-------|-------|------|
| `Content Brief` | Agent 1 | Full research brief |
| `Creative Brief` | Agent 1 | Visual + production direction |
| `Scout Sources` | Agent 1 | 100+ research URLs |
| `Maya Segment` | Agent 1 | ICP match segment |
| `Business Case` | Agent 1 | Why this topic wins |
| `Readiness` | Agent 1 | Draft / Ready / Live |
| `Freshness` | Agent 1 | Fresh / Stale / Evergreen |

---

## API Keys

| Key | Agent | Where to get | Cost |
|-----|-------|--------------|------|
| `AIRTABLE_API_KEY` | 1 | airtable.com/create/tokens | Free |
| `OPENAI_API_KEY` | 2 | platform.openai.com/api-keys | Pay-per-use |
| `IDEOGRAM_API_KEY` | 2 | ideogram.ai/api | Pay-per-use |
| `MS_CLIENT_ID` | 3 | Azure portal → App registrations | Free |
| `MS_CLIENT_SECRET` | 3 | Azure portal → App registrations | Free |
| `MS_TENANT_ID` | 3 | Azure portal → Overview | Free |
| `MS_SHAREPOINT_SITE` | 3 | Optional (e.g. `colibrigroup.sharepoint.com`) | — |
| `MS_DRIVE_FOLDER` | 3 | Optional (default: `AI Studio`) | — |

**Minimum to run Agent 1:** `AIRTABLE_API_KEY` only.

---

## Output Structure

```
agents/
  output/
    {brief_id}/
      agent1_output.json    ← script + brand + feedback trail
      agent2_output.json    ← image selection + scores
      agent3_output.json    ← cloud URLs + share links
      images/
        dalle3_A.png        ← photorealistic winner
        dalle3_B.png
        ideogram_A.png      ← graphic/text winner
        ideogram_B.png
  brain/
    runs.jsonl              ← every run, immutable
    model.json              ← learned model state
```

> `agents/output/` is gitignored — never committed to source control.

---

## Repo Structure

```
aistudio/
├── agents/
│   ├── agent.py                    ← self-contained Agent 1 (clone + run)
│   ├── agent_1_brief_forge.py      ← full pipeline Agent 1
│   ├── agent_2_image_forge.py      ← full pipeline Agent 2
│   ├── agent_3_cloud_publish.py    ← full pipeline Agent 3
│   ├── agent_brain.py              ← Super Brain (learning loop)
│   ├── run_pipeline.py             ← orchestrator (runs all 3)
│   ├── config.py                   ← all hardcoded constants
│   ├── BRIEFFORGE.md               ← Agent 1 standalone docs
│   └── agent.md                    ← full system docs
│
├── src/
│   ├── dashboard/
│   │   └── server.ts               ← dashboard server + full React SPA
│   ├── scripts/                    ← production agents (voice, video, image)
│   ├── client/                     ← typed API clients
│   └── types/                      ← TypeScript types
│
├── remotion/                       ← Remotion video editor
├── output/                         ← produced assets (gitignored)
├── .env.example                    ← copy to .env, fill keys
└── README.md
```

---

## Azure App Setup (Agent 3)

To upload to OneDrive/SharePoint:

1. Go to `portal.azure.com` → Azure Active Directory → App registrations → New registration
2. Add API permissions: `Files.ReadWrite.All` *(application permission, not delegated)*
3. Grant admin consent
4. Create client secret → Certificates & secrets
5. Copy values to `.env`:

```bash
MS_CLIENT_ID=<Application (client) ID>
MS_TENANT_ID=<Directory (tenant) ID>
MS_CLIENT_SECRET=<secret value>
```

---

<div align="center">

**Built by [Colibri Group](https://colibrigroup.com) for SimpleNursing**

*Internal tool — not for redistribution*

</div>
