#!/usr/bin/env python3
"""
Evolotion — Agent 1: BriefForge
════════════════════════════════════════════════════════════════════

Reads every row from Airtable, finds all Content Approved briefs,
and transforms each into a production-ready script package.

Self-contained — only needs: httpx, python-dotenv
Install:  pip install httpx python-dotenv
Run:      python3 agent.py
          python3 agent.py --all
          python3 agent.py --brief-id rec0kxOAXZNsJvmwO
          python3 agent.py --list

Output saved to: output/{brief_id}/agent1_output.json
"""

import json, sys, os, re, time, argparse
from pathlib import Path
from datetime import datetime, timezone

# ── Auto-install deps if missing ──────────────────────────────────────────────
try:
    import httpx
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "httpx", "python-dotenv", "-q"])
    import httpx

try:
    from dotenv import load_dotenv
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "python-dotenv", "-q"])
    from dotenv import load_dotenv

# ── Load .env (looks in same dir, then parent) ────────────────────────────────
HERE = Path(__file__).parent
for env_path in [HERE / ".env", HERE.parent / ".env"]:
    if env_path.exists():
        load_dotenv(env_path)
        break

OUTPUT_DIR = HERE / "output"


# ── Config ────────────────────────────────────────────────────────────────────

def require(key: str) -> str:
    v = os.environ.get(key, "").strip()
    if not v:
        print(f"\n❌  Missing: {key}")
        print(f"   Add it to your .env file:  {key}=your_key_here\n")
        sys.exit(1)
    return v

AIRTABLE_BASE_ID  = os.environ.get("AIRTABLE_BASE_ID", "appLFh438nLooz6u7")
AIRTABLE_TABLE_ID = os.environ.get("AIRTABLE_TABLE_ID", "tbl5P3J8agdY4gNtT")

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
    "audience": "Gen Z nursing students, female 17-18",
    "voice":    "Sarah — Fish Audio 933563129e564b19a115bedd57b7406a",
    "handle":   "@simplenursing",
}

CHANNEL_FORMATS = {
    "tiktok":    {"ratio": "9:16", "size": "1080x1920", "style": "vertical short-form"},
    "instagram": {"ratio": "1:1",  "size": "1080x1080", "style": "square carousel"},
    "pinterest": {"ratio": "2:3",  "size": "1000x1500", "style": "vertical pin"},
    "youtube":   {"ratio": "16:9", "size": "1920x1080", "style": "YouTube thumbnail"},
}

SCRIPT_VERSIONS  = ["V5 Content", "V4 Content", "V3 Content", "V2 Content", "V1 Content", "Content Preview"]
FEEDBACK_KEYS    = [("V1","V1 Chad Feedback"),("V2","V2 Chad Feedback"),("V3","V3 Chad Feedback"),
                    ("V4","V4 Chad Feedback"),("V5","V5 Chad Feedback"),("General","Feedback")]


# ── Airtable (real-time, paginated) ───────────────────────────────────────────

def fetch_all_rows() -> list[dict]:
    """Fetch every row from Airtable (handles pagination automatically)."""
    key     = require("AIRTABLE_API_KEY")
    url     = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_ID}"
    headers = {"Authorization": f"Bearer {key}"}
    rows, params = [], {"maxRecords": 100}
    while True:
        resp = httpx.get(url, params=params, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        rows += data.get("records", [])
        if not (offset := data.get("offset")):
            break
        params = {"maxRecords": 100, "offset": offset}
    return rows


def fetch_content_approved() -> list[dict]:
    """Return rows where Content Approved? = Approved."""
    return [r for r in fetch_all_rows() if r["fields"].get("Content Approved?") == "Approved"]


def fetch_by_id(brief_id: str) -> dict:
    key = require("AIRTABLE_API_KEY")
    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_ID}/{brief_id}"
    resp = httpx.get(url, headers={"Authorization": f"Bearer {key}"}, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── Script parsing ────────────────────────────────────────────────────────────

def pick_best_script(fields: dict) -> tuple[str, str]:
    """Pick the highest version script available."""
    for key in SCRIPT_VERSIONS:
        val = fields.get(key, "").strip()
        if val:
            return key.replace(" Content", "").replace("Content Preview", "Content Preview"), val
    return "none", ""


def build_feedback_trail(fields: dict) -> list[dict]:
    return [{"version": label, "text": fields[key].strip()}
            for label, key in FEEDBACK_KEYS if fields.get(key, "").strip()]


def parse_script(raw: str) -> dict:
    """Extract hook / body / CTA / visual directions from raw script text."""
    hook = body = cta = ""
    # Try **HOOK** / **BODY** / **CTA** structured format
    if m := re.search(r'\*\*HOOK.*?\*\*(.*?)(?=\*\*|$)', raw, re.DOTALL | re.IGNORECASE):
        hook = m.group(1).strip()
    if m := re.search(r'\*\*BODY.*?\*\*(.*?)(?=\*\*CTA|\*\*OUTRO|$)', raw, re.DOTALL | re.IGNORECASE):
        body = m.group(1).strip()
    if m := re.search(r'\*\*(CTA|OUTRO|CALL TO ACTION).*?\*\*(.*?)(?=\*\*|$)', raw, re.DOTALL | re.IGNORECASE):
        cta = m.group(2).strip()
    # Fallback: split by lines
    if not hook and not body:
        lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
        hook  = lines[0] if lines else ""
        body  = "\n".join(lines[1:-1]) if len(lines) > 2 else "\n".join(lines[1:])
        cta   = lines[-1] if len(lines) > 1 else ""
    visuals = re.findall(r'\[([^\]]{10,300})\]', raw)
    return {
        "hook":              hook[:500],
        "body":              body[:5000],
        "cta":               cta[:500],
        "visual_directions": visuals[:20],
        "full_script":       raw,
        "word_count":        len(raw.split()),
        "char_count":        len(raw),
    }


# ── Transform ─────────────────────────────────────────────────────────────────

def transform(record: dict) -> dict:
    """Airtable row → production-ready JSON package."""
    f        = record["fields"]
    brief_id = record["id"]
    channel  = f.get("Channel", "TikTok").lower()
    version, raw = pick_best_script(f)
    feedback = build_feedback_trail(f)
    fmt      = CHANNEL_FORMATS.get(channel, CHANNEL_FORMATS["tiktok"])

    output = {
        "agent":        "BriefForge",
        "version":      "2.0",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "brief": {
            "id":               brief_id,
            "rank":             f.get("Rank"),
            "title":            f.get("Title", ""),
            "hook":             f.get("Hook", ""),
            "channel":          f.get("Channel", ""),
            "type":             f.get("Type", ""),
            "keyword":          f.get("Keyword", ""),
            "script_version":   version,
            "content_approved": f.get("Content Approved?", ""),
        },
        "script":         parse_script(raw),
        "chad_feedback":  feedback,
        "brand":          BRAND,
        "production_notes": {
            "channel_format":      fmt,
            "recommended_voice":   "Sarah (Fish Audio 933563129e564b19a115bedd57b7406a)",
            "script_version_used": version,
            "feedback_rounds":     len(feedback),
            "cta_url":             "simplenursing.com",
        },
    }

    out_dir  = OUTPUT_DIR / brief_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "agent1_output.json").write_text(json.dumps(output, indent=2))
    return output


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="BriefForge — Airtable → approved scripts (real-time scan)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 agent.py                         # list all Content Approved briefs
  python3 agent.py --all                   # process all
  python3 agent.py --brief-id recXXXXX     # process one brief
  python3 agent.py --list                  # list without processing

Required env var:
  AIRTABLE_API_KEY    get at: airtable.com/create/tokens

Optional env vars:
  AIRTABLE_BASE_ID    default: appLFh438nLooz6u7
  AIRTABLE_TABLE_ID   default: tbl5P3J8agdY4gNtT
        """
    )
    parser.add_argument("--all",      action="store_true", help="Process all Content Approved briefs")
    parser.add_argument("--brief-id", help="Process a specific brief ID")
    parser.add_argument("--list",     action="store_true", help="List briefs without processing")
    args = parser.parse_args()

    print("\n" + "═"*60)
    print("  EVOLOTION — Agent 1: BriefForge")
    print("  Airtable → Approved Scripts")
    print("═"*60)
    print("\n  Scanning Airtable (all rows, real-time)...\n")

    if args.brief_id:
        records = [fetch_by_id(args.brief_id)]
        print(f"  Found 1 brief by ID\n")
    else:
        records = fetch_content_approved()
        print(f"  Found {len(records)} Content Approved briefs\n")

    records.sort(key=lambda r: r["fields"].get("Rank") or 999)

    if args.list or (not args.all and not args.brief_id):
        print(f"  {'Rank':<5} {'ID':<20} {'Channel':<12} {'Script':<18}  Title")
        print(f"  {'─'*80}")
        for r in records:
            f = r["fields"]
            v, _ = pick_best_script(f)
            tag = f"✅ {v}" if v != "none" else "❌ no script"
            print(f"  #{str(f.get('Rank','?')):<4} {r['id']:<20} {f.get('Channel',''):<12} {tag:<18}  {f.get('Title','')[:50]}")
        print()
        if not args.all:
            print("  Run with --all to process all, or --brief-id <id> for one.\n")
            return

    results = []
    for record in records:
        f = record["fields"]
        v, raw = pick_best_script(f)
        if not raw:
            print(f"  ⚠  #{f.get('Rank','?')} [{record['id']}] — no script found, skipping")
            continue
        result = transform(record)
        b, s, fb = result["brief"], result["script"], result["chad_feedback"]
        print(f"  ─────────────────────────────────────────────")
        print(f"  #{b.get('rank','?')}  [{b['id']}]  {b['channel']}  (script: {b['script_version']})")
        print(f"  📌 {b['title']}")
        print(f"  🎣 {b['hook'][:90]}")
        print(f"  📝 {s['word_count']} words · {len(fb)} feedback rounds · {len(s['visual_directions'])} visual cues")
        print(f"  ✅ output/{b['id']}/agent1_output.json")
        results.append(result)
        time.sleep(0.1)

    print(f"\n{'═'*60}")
    print(f"  BriefForge complete — {len(results)}/{len(records)} briefs processed")
    print(f"  Output: agents/output/")
    print(f"{'═'*60}\n")
    return results


if __name__ == "__main__":
    main()
