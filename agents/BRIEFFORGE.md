# Agent 1 — BriefForge

**Evolotion Content Pipeline · SimpleNursing**

Scans every row in the Airtable content brief base in real-time, finds every `Content Approved` brief, and transforms each one into a structured production-ready script package.

---

## Run it

```bash
# 1. Clone
git clone https://github.com/samcolibri/aistudio.git
cd aistudio/agents

# 2. Set your Airtable key
echo "AIRTABLE_API_KEY=patXXXXXXXXXXXXXX" > .env

# 3. Run
python3 agent.py            # list all approved briefs
python3 agent.py --all      # process all → saves JSON per brief
python3 agent.py --brief-id rec0kxOAXZNsJvmwO   # one brief only
```

No pip install needed — `agent.py` auto-installs `httpx` and `python-dotenv`.

---

## What it does

```
Airtable (all rows, paginated)
        │
        ▼  filter: Content Approved? = Approved
        │
        ▼  for each brief:
           ├── reads every script version (V5 → V4 → V3 → V2 → V1 → Content Preview)
           ├── picks the best (highest) version
           ├── parses: hook / body / CTA / visual directions
           ├── collects Chad's full feedback trail (V1→V5 + General)
           └── saves → output/{brief_id}/agent1_output.json
```

---

## Output format

One JSON file per brief: `output/{brief_id}/agent1_output.json`

```json
{
  "agent": "BriefForge",
  "version": "2.0",
  "processed_at": "2026-05-04T10:00:00Z",

  "brief": {
    "id":               "rec0kxOAXZNsJvmwO",
    "rank":             1,
    "title":            "Your High School Checklist: 9 Classes...",
    "hook":             "take these 9 classes now and nursing school...",
    "channel":          "TikTok",
    "type":             "Checklist",
    "keyword":          "nursing school prerequisites",
    "script_version":   "V5",
    "content_approved": "Approved"
  },

  "script": {
    "hook":              "...",
    "body":              "...",
    "cta":               "...",
    "visual_directions": ["Show student at desk", "Cut to nursing school campus"],
    "full_script":       "...",
    "word_count":        273,
    "char_count":        1655
  },

  "chad_feedback": [
    { "version": "V4", "text": "Chad's V4 notes..." },
    { "version": "V5", "text": "Chad's V5 approval notes..." },
    { "version": "General", "text": "General feedback..." }
  ],

  "brand": {
    "name":     "SimpleNursing",
    "website":  "simplenursing.com",
    "voice":    "Sarah",
    "voice_id": "933563129e564b19a115bedd57b7406a",
    "colors":   { "teal": "#00709c", "yellow": "#fad74f", ... }
  },

  "production_notes": {
    "channel_format":      { "ratio": "9:16", "size": "1080x1920", "style": "vertical short-form" },
    "recommended_voice":   "Sarah (Fish Audio 933563129e564b19a115bedd57b7406a)",
    "script_version_used": "V5",
    "feedback_rounds":     3,
    "cta_url":             "simplenursing.com"
  }
}
```

---

## Hardcoded constants (locked — do not modify)

| Constant | Value | What it is |
|----------|-------|-----------|
| `AIRTABLE_BASE_ID` | `appLFh438nLooz6u7` | SimpleNursing content briefs base |
| `AIRTABLE_TABLE_ID` | `tbl5P3J8agdY4gNtT` | Briefs table |
| `APPROVAL_FIELD` | `Content Approved?` | Airtable field name for approval status |
| `APPROVAL_VALUE` | `Approved` | Value that marks a brief as ready |
| Script priority | V5 → V4 → V3 → V2 → V1 → Content Preview | Highest version wins |
| Voice | Sarah · Fish Audio `933563129e564b19a115bedd57b7406a` | Locked narrator |
| Brand colors | teal `#00709c` · blue `#75c7e6` · pink `#fc3467` · yellow `#fad74f` | SimpleNursing palette |

---

## Airtable schema — fields this agent reads

| Field | Used for |
|-------|---------|
| `Content Approved?` | Approval gate — only `Approved` rows are processed |
| `Rank` | Sort order in output |
| `Title` | Brief title |
| `Hook` | The opening hook line |
| `Channel` | TikTok / Instagram / Pinterest / YouTube |
| `Type` | Content type (Checklist, Quiz, etc.) |
| `Keyword` | Target SEO keyword |
| `V5 Content` | Latest approved script (preferred) |
| `V4 Content` | Previous script version |
| `V3 Content` | Earlier version |
| `V2 Content` | Earlier version |
| `V1 Content` | First draft |
| `Content Preview` | Pre-versioned script (fallback) |
| `V5 Chad Feedback` | Chad's notes on V5 |
| `V4 Chad Feedback` | Chad's notes on V4 |
| `V3 Chad Feedback` | Chad's notes on V3 |
| `V2 Chad Feedback` | Chad's notes on V2 |
| `V1 Chad Feedback` | Chad's notes on V1 |
| `Feedback` | General / catch-all feedback |
| `Brief Approved?` | Informational only (not used as gate) |
| `Evidence Strength` | Content credibility signal |
| `Score` | Brief quality score |

---

## Required env var

| Key | Where to get |
|-----|-------------|
| `AIRTABLE_API_KEY` | airtable.com/create/tokens → Personal Access Token |

Everything else is hardcoded in `agent.py`. The base ID, table ID, brand, voice, channel formats, script version priority — all locked. No other configuration needed.

---

## Output directory structure

```
agents/
  output/
    rec0kxOAXZNsJvmwO/
      agent1_output.json      ← this agent's output (input for Agent 2)
    recFslotdaWDbsSjZ/
      agent1_output.json
    ... (one folder per brief_id)
```

This output feeds directly into **Agent 2 (ImageForge)** which generates images from the prompts.

---

## Script section parser

Handles two script formats Chad uses:

**Format 1 — Structured (preferred):**
```
**HOOK**
take these 9 classes now...

**BODY**
class 1: anatomy and physiology...

**CTA**
follow for more nursing content
```

**Format 2 — Freeform (fallback):**
- First line → hook
- Middle lines → body
- Last line → CTA

Visual directions in `[square brackets]` are extracted automatically from either format.
