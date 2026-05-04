"""Shared config — reads .env from the aistudio root."""
import os, sys
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent          # aistudio/
AGENTS_DIR = Path(__file__).parent           # aistudio/agents/
OUTPUT_DIR = AGENTS_DIR / "output"
BRAIN_DIR  = AGENTS_DIR / "brain"

load_dotenv(ROOT / ".env")

def require(key: str) -> str:
    v = os.environ.get(key, "")
    if not v:
        print(f"❌  Missing env var: {key}  →  add it to .env", file=sys.stderr)
        sys.exit(1)
    return v

def get(key: str, default: str = "") -> str:
    return os.environ.get(key, default)

# Airtable
AIRTABLE_API_KEY    = lambda: require("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID    = lambda: get("AIRTABLE_BASE_ID", "appLFh438nLooz6u7")
AIRTABLE_TABLE_ID   = "tbl5P3J8agdY4gNtT"

# AI image generation
OPENAI_API_KEY      = lambda: require("OPENAI_API_KEY")
IDEOGRAM_API_KEY    = lambda: require("IDEOGRAM_API_KEY")

# Microsoft OneDrive/SharePoint (Agent 3)
MS_CLIENT_ID        = lambda: require("MS_CLIENT_ID")
MS_CLIENT_SECRET    = lambda: require("MS_CLIENT_SECRET")
MS_TENANT_ID        = lambda: require("MS_TENANT_ID")
MS_SHAREPOINT_SITE  = lambda: get("MS_SHAREPOINT_SITE", "")   # e.g. colibrigroup.sharepoint.com
MS_DRIVE_FOLDER     = lambda: get("MS_DRIVE_FOLDER", "AI Studio")

# Brand constants — SimpleNursing
BRAND = {
    "name": "SimpleNursing",
    "colors": {
        "teal":   "#00709c",
        "blue":   "#75c7e6",
        "pink":   "#fc3467",
        "yellow": "#fad74f",
        "dark":   "#282323",
        "navy":   "#005374",
    },
    "voice": "Gen Z, casual, peer-to-peer, female, 17-18 year old nursing student",
    "character": "Sarah — nursing student, relatable, direct, not textbook",
    "website": "simplenursing.com",
    "cta": "simplenursing.com",
}
