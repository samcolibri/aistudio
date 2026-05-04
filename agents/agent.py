#!/usr/bin/env python3
"""
Evolotion — Agent 1: BriefForge
════════════════════════════════════════════════════════════════════

INPUT  : Airtable base appLFh438nLooz6u7  (SimpleNursing content briefs)
         Fetches ALL rows in real-time, filters Content Approved = Approved
OUTPUT : output/{brief_id}/agent1_output.json  (one file per brief)

Self-contained — auto-installs its own dependencies.
Only secret needed: AIRTABLE_API_KEY in a .env file.

Usage:
    python3 agent.py                        list all approved briefs
    python3 agent.py --all                  process all approved briefs
    python3 agent.py --brief-id recXXXXX    process one specific brief
"""

import json, sys, os, re, time, argparse
from pathlib import Path
from datetime import datetime, timezone

# ── Auto-install dependencies (httpx for HTTP, dotenv for .env reading) ───────
try:
    import httpx
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "httpx", "-q"], check=True)
    import httpx

try:
    from dotenv import load_dotenv
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "python-dotenv", "-q"], check=True)
    from dotenv import load_dotenv

# ── Load .env — checks agents/.env first, then aistudio root ─────────────────
_HERE = Path(__file__).parent
for _env in [_HERE / ".env", _HERE.parent / ".env"]:
    if _env.exists():
        load_dotenv(_env)
        break

# ── Output directory (agents/output/{brief_id}/) ──────────────────────────────
OUTPUT_DIR = _HERE / "output"

# ══════════════════════════════════════════════════════════════════════════════
# HARDCODED CONSTANTS — do not modify without updating Airtable schema
# ══════════════════════════════════════════════════════════════════════════════

# Airtable identifiers — locked to SimpleNursing content briefs base
AIRTABLE_BASE_ID  = "appLFh438nLooz6u7"
AIRTABLE_TABLE_ID = "tbl5P3J8agdY4gNtT"
AIRTABLE_API_URL  = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_ID}"

# Approval gate — only rows matching this field/value are processed
APPROVAL_FIELD = "Content Approved?"
APPROVAL_VALUE = "Approved"

# Script version priority — highest version wins, reads left to right
SCRIPT_VERSION_FIELDS = [
    ("V5",              "V5 Content"),
    ("V4",              "V4 Content"),
    ("V3",              "V3 Content"),
    ("V2",              "V2 Content"),
    ("V1",              "V1 Content"),
    ("Content Preview", "Content Preview"),
]

# Chad feedback fields — collected in version order for the feedback trail
FEEDBACK_FIELDS = [
    ("V1",      "V1 Chad Feedback"),
    ("V2",      "V2 Chad Feedback"),
    ("V3",      "V3 Chad Feedback"),
    ("V4",      "V4 Chad Feedback"),
    ("V5",      "V5 Chad Feedback"),
    ("General", "Feedback"),
]

# Channel format specs — locked to SimpleNursing channel dimensions
CHANNEL_FORMATS = {
    "tiktok":    {"ratio": "9:16",  "size": "1080x1920", "style": "vertical short-form"},
    "instagram": {"ratio": "1:1",   "size": "1080x1080", "style": "square carousel"},
    "pinterest": {"ratio": "2:3",   "size": "1000x1500", "style": "vertical pin"},
    "youtube":   {"ratio": "16:9",  "size": "1920x1080", "style": "YouTube thumbnail"},
}

# SimpleNursing brand — locked colors, voice, audience
BRAND = {
    "name":     "SimpleNursing",
    "website":  "simplenursing.com",
    "handle":   "@simplenursing",
    "audience": "Gen Z nursing students, female 17-18",
    "voice":    "Sarah",
    "voice_id": "933563129e564b19a115bedd57b7406a",
    "voice_provider": "Fish Audio",
    "colors": {
        "teal":   "#00709c",   # primary brand teal
        "blue":   "#75c7e6",   # light blue accent
        "pink":   "#fc3467",   # pop / CTA color
        "yellow": "#fad74f",   # highlight / hook text
        "dark":   "#282323",   # background
        "navy":   "#005374",   # secondary background
    },
}

# ══════════════════════════════════════════════════════════════════════════════
# AIRTABLE — real-time fetch, full pagination
# ══════════════════════════════════════════════════════════════════════════════

def _get_api_key() -> str:
    key = os.environ.get("AIRTABLE_API_KEY", "").strip()
    if not key:
        print("\n❌  AIRTABLE_API_KEY not set.")
        print("   Create a .env file next to agent.py:")
        print("   AIRTABLE_API_KEY=patXXXXXXXXXXXXXX\n")
        print("   Get your key at: airtable.com/create/tokens\n")
        sys.exit(1)
    return key


def fetch_all_rows() -> list[dict]:
    """
    Fetch every row from Airtable. Handles pagination automatically.
    Airtable returns max 100 rows per page; loops until no offset returned.
    """
    key     = _get_api_key()
    headers = {"Authorization": f"Bearer {key}"}
    rows    = []
    params  = {"maxRecords": 100}

    while True:
        resp = httpx.get(AIRTABLE_API_URL, params=params, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        rows += data.get("records", [])
        offset = data.get("offset")
        if not offset:
            break
        params = {"maxRecords": 100, "offset": offset}

    return rows


def fetch_content_approved() -> list[dict]:
    """Return only rows where Content Approved? = Approved."""
    return [
        r for r in fetch_all_rows()
        if r["fields"].get(APPROVAL_FIELD) == APPROVAL_VALUE
    ]


def fetch_by_id(brief_id: str) -> dict:
    """Fetch a single Airtable row by its record ID."""
    key  = _get_api_key()
    url  = f"{AIRTABLE_API_URL}/{brief_id}"
    resp = httpx.get(url, headers={"Authorization": f"Bearer {key}"}, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ══════════════════════════════════════════════════════════════════════════════
# SCRIPT EXTRACTION — reads every version, picks best
# ══════════════════════════════════════════════════════════════════════════════

def pick_best_script(fields: dict) -> tuple[str, str]:
    """
    Return (version_label, script_text) for the best available version.
    Checks V5 → V4 → V3 → V2 → V1 → Content Preview in order.
    Returns ('none', '') if no script found at any version.
    """
    for label, field_key in SCRIPT_VERSION_FIELDS:
        text = fields.get(field_key, "").strip()
        if text:
            return label, text
    return "none", ""


def collect_feedback(fields: dict) -> list[dict]:
    """
    Collect Chad's feedback from every version that has text.
    Returns list of {version, text} dicts in chronological order.
    """
    trail = []
    for label, field_key in FEEDBACK_FIELDS:
        text = fields.get(field_key, "").strip()
        if text:
            trail.append({"version": label, "text": text})
    return trail


def parse_script(raw: str) -> dict:
    """
    Parse raw script text into structured sections.

    Handles two formats:
      1. Structured: **HOOK** ... **BODY** ... **CTA** markdown headers
      2. Freeform:   first line = hook, middle = body, last line = CTA

    Also extracts [visual direction] notes in square brackets.
    """
    hook = ""
    body = ""
    cta  = ""

    # ── Try structured **SECTION** format first ───────────────────────────────
    hook_match = re.search(
        r'\*\*HOOK.*?\*\*(.*?)(?=\*\*|$)', raw, re.DOTALL | re.IGNORECASE
    )
    body_match = re.search(
        r'\*\*BODY.*?\*\*(.*?)(?=\*\*CTA|\*\*OUTRO|\*\*CALL|$)', raw, re.DOTALL | re.IGNORECASE
    )
    cta_match = re.search(
        r'\*\*(CTA|OUTRO|CALL TO ACTION).*?\*\*(.*?)(?=\*\*|$)', raw, re.DOTALL | re.IGNORECASE
    )

    if hook_match:
        hook = hook_match.group(1).strip()
    if body_match:
        body = body_match.group(1).strip()
    if cta_match:
        cta = cta_match.group(2).strip()

    # ── Fallback: freeform line-split ─────────────────────────────────────────
    if not hook and not body:
        lines = [ln.strip() for ln in raw.strip().splitlines() if ln.strip()]
        if lines:
            hook = lines[0]
        if len(lines) > 2:
            body = "\n".join(lines[1:-1])
        elif len(lines) > 1:
            body = lines[1]
        if len(lines) > 1:
            cta = lines[-1]

    # ── Extract [visual direction] notes ─────────────────────────────────────
    # Matches anything in square brackets between 10 and 300 chars
    visual_directions = re.findall(r'\[([^\]]{10,300})\]', raw)

    return {
        "hook":              hook[:500],
        "body":              body[:5000],
        "cta":               cta[:500],
        "visual_directions": visual_directions[:20],
        "full_script":       raw,
        "word_count":        len(raw.split()),
        "char_count":        len(raw),
    }


# ══════════════════════════════════════════════════════════════════════════════
# TRANSFORM — Airtable row → production-ready JSON
# ══════════════════════════════════════════════════════════════════════════════

def transform(record: dict) -> dict:
    """
    Full transform of one Airtable row into a production-ready package.
    Reads every field, picks best script, collects all feedback,
    and writes output/{brief_id}/agent1_output.json.
    """
    fields   = record["fields"]
    brief_id = record["id"]
    channel  = fields.get("Channel", "TikTok").lower()

    version, raw_script = pick_best_script(fields)
    feedback            = collect_feedback(fields)
    fmt                 = CHANNEL_FORMATS.get(channel, CHANNEL_FORMATS["tiktok"])

    output = {
        "agent":        "BriefForge",
        "version":      "2.0",
        "processed_at": datetime.now(timezone.utc).isoformat(),

        # ── Brief metadata from Airtable ──────────────────────────────────────
        "brief": {
            "id":               brief_id,
            "rank":             fields.get("Rank"),
            "title":            fields.get("Title", ""),
            "hook":             fields.get("Hook", ""),
            "channel":          fields.get("Channel", ""),
            "type":             fields.get("Type", ""),
            "keyword":          fields.get("Keyword", ""),
            "evidence":         fields.get("Evidence Strength", ""),
            "score":            fields.get("Score"),
            "script_version":   version,
            "content_approved": fields.get("Content Approved?", ""),
            "brief_approved":   fields.get("Brief Approved?", ""),
        },

        # ── Parsed script sections ────────────────────────────────────────────
        "script": parse_script(raw_script),

        # ── Full Chad feedback trail ──────────────────────────────────────────
        "chad_feedback": feedback,

        # ── Locked brand constants ────────────────────────────────────────────
        "brand": BRAND,

        # ── Production notes for downstream agents ────────────────────────────
        "production_notes": {
            "channel_format":      fmt,
            "recommended_voice":   f"{BRAND['voice']} ({BRAND['voice_provider']} {BRAND['voice_id']})",
            "script_version_used": version,
            "feedback_rounds":     len(feedback),
            "cta_url":             BRAND["website"],
            "watermark":           f"{BRAND['website']}  •  {channel.upper()}",
        },
    }

    # Save to disk
    out_dir = OUTPUT_DIR / brief_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "agent1_output.json").write_text(json.dumps(output, indent=2))

    return output


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

def _print_header():
    print("\n" + "═" * 62)
    print("  EVOLOTION  —  Agent 1: BriefForge")
    print("  SimpleNursing  |  Airtable → Approved Scripts")
    print("═" * 62)


def _print_list(records: list[dict]):
    print(f"\n  {'#':<5} {'Record ID':<22} {'Channel':<12} {'Script':<20}  Title")
    print(f"  {'─' * 80}")
    for r in records:
        f           = r["fields"]
        label, _    = pick_best_script(f)
        version_tag = f"✅ {label}" if label != "none" else "❌  no script"
        rank        = str(f.get("Rank", "?"))
        print(
            f"  #{rank:<4} {r['id']:<22} {f.get('Channel', ''):<12} "
            f"{version_tag:<20}  {f.get('Title', '')[:48]}"
        )
    print()


def _print_result(result: dict):
    b  = result["brief"]
    s  = result["script"]
    fb = result["chad_feedback"]
    print(f"\n  {'─' * 50}")
    print(f"  #{b.get('rank', '?')}  [{b['id']}]  {b['channel']}  →  {b['script_version']}")
    print(f"  📌  {b['title']}")
    print(f"  🎣  {b['hook'][:90]}")
    print(f"  📝  {s['word_count']} words · {s['char_count']} chars")
    print(f"  💬  {len(fb)} feedback round(s): {', '.join(x['version'] for x in fb)}" if fb else "  💬  no feedback")
    print(f"  🎬  {len(s['visual_directions'])} visual direction(s)")
    print(f"  ✅  output/{b['id']}/agent1_output.json")


def main():
    parser = argparse.ArgumentParser(
        description="BriefForge — scans Airtable live, processes Content Approved briefs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Required:\n"
            "  AIRTABLE_API_KEY in .env   (airtable.com/create/tokens)\n\n"
            "Examples:\n"
            "  python3 agent.py                     # list all approved\n"
            "  python3 agent.py --all               # process all\n"
            "  python3 agent.py --brief-id recXXX   # process one\n"
        ),
    )
    parser.add_argument("--all",      action="store_true", help="Process all Content Approved briefs")
    parser.add_argument("--brief-id", metavar="ID",        help="Process one brief by Airtable record ID")
    parser.add_argument("--list",     action="store_true", help="List approved briefs without processing")
    args = parser.parse_args()

    _print_header()
    print("\n  Fetching all rows from Airtable (real-time)...\n")

    # ── Fetch ─────────────────────────────────────────────────────────────────
    if args.brief_id:
        records = [fetch_by_id(args.brief_id)]
        print(f"  Fetched 1 brief by ID: {args.brief_id}\n")
    else:
        records = fetch_content_approved()
        print(f"  Found {len(records)} {APPROVAL_VALUE} briefs\n")

    # Sort by Rank field
    records.sort(key=lambda r: r["fields"].get("Rank") or 999)

    # ── List mode (default when no --all / --brief-id given) ──────────────────
    if args.list or (not args.all and not args.brief_id):
        _print_list(records)
        if not args.all:
            print("  Pass --all to process all, or --brief-id <id> for one.\n")
            return

    # ── Process ───────────────────────────────────────────────────────────────
    results = []
    for record in records:
        label, raw = pick_best_script(record["fields"])
        if not raw:
            print(f"  ⚠  [{record['id']}] no script found — skipping")
            continue
        result = transform(record)
        _print_result(result)
        results.append(result)
        time.sleep(0.1)  # polite Airtable rate-limit buffer

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'═' * 62}")
    print(f"  BriefForge complete — {len(results)} of {len(records)} briefs processed")
    print(f"  Output directory: agents/output/")
    print(f"{'═' * 62}\n")

    return results


if __name__ == "__main__":
    main()
