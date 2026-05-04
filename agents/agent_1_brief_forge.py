"""
Agent 1 — BriefForge
═══════════════════════════════════════════════════════════════════

INPUT:  Airtable — ALL rows where Content Approved? = Approved
        (Real-time fetch, full pagination, every version read)
OUTPUT: Structured JSON with:
          - Final approved script (best version: V5 > V4 > Content Preview)
          - All Chad feedback trail (V1→V5)
          - Hook, body, CTA, visual directions
          - Production notes for downstream agents

Run standalone:
    python3 agents/agent_1_brief_forge.py              # list all
    python3 agents/agent_1_brief_forge.py --all        # process all
    python3 agents/agent_1_brief_forge.py --brief-id rec0kxOAXZNsJvmwO
    python3 agents/agent_1_brief_forge.py --refresh    # force re-fetch + re-process all
"""

import json, sys, os, re, time, argparse
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID,
    OUTPUT_DIR, BRAND
)
from agent_brain import log_run, get_context

try:
    import httpx
except ImportError:
    import subprocess; subprocess.run([sys.executable, "-m", "pip", "install", "httpx", "-q"])
    import httpx

AGENT_NAME = "BriefForge"


# ── Airtable fetch (real-time, paginated) ──────────────────────────────────────

def fetch_all_rows() -> list[dict]:
    """Fetch ALL rows from Airtable (handles pagination automatically)."""
    key    = AIRTABLE_API_KEY()
    base   = AIRTABLE_BASE_ID()
    url    = f"https://api.airtable.com/v0/{base}/{AIRTABLE_TABLE_ID}"
    headers = {"Authorization": f"Bearer {key}"}

    all_records = []
    params = {"maxRecords": 100}
    while True:
        resp = httpx.get(url, params=params, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        all_records += data.get("records", [])
        offset = data.get("offset")
        if not offset:
            break
        params = {"maxRecords": 100, "offset": offset}
    return all_records


def fetch_content_approved() -> list[dict]:
    """Return only rows where Content Approved? = Approved."""
    all_rows = fetch_all_rows()
    approved = [r for r in all_rows if r["fields"].get("Content Approved?") == "Approved"]
    return approved


def fetch_brief_by_id(brief_id: str) -> dict:
    key  = AIRTABLE_API_KEY()
    base = AIRTABLE_BASE_ID()
    url  = f"https://api.airtable.com/v0/{base}/{AIRTABLE_TABLE_ID}/{brief_id}"
    resp = httpx.get(url, headers={"Authorization": f"Bearer {key}"}, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── Script selection — reads every version, picks best ────────────────────────

SCRIPT_VERSIONS = ["V5 Content", "V4 Content", "V3 Content", "V2 Content", "V1 Content", "Content Preview"]
FEEDBACK_VERSIONS = [
    ("V1", "V1 Chad Feedback"),
    ("V2", "V2 Chad Feedback"),
    ("V3", "V3 Chad Feedback"),
    ("V4", "V4 Chad Feedback"),
    ("V5", "V5 Chad Feedback"),
    ("General", "Feedback"),
]


def pick_best_script(fields: dict) -> tuple[str, str]:
    """
    Return (version_label, script_text) for the best available version.
    Priority: V5 > V4 > V3 > V2 > V1 > Content Preview
    """
    for key in SCRIPT_VERSIONS:
        val = fields.get(key, "").strip()
        if val:
            label = key.replace(" Content", "").replace("Content Preview", "Content Preview")
            return label, val
    return "none", ""


def build_feedback_trail(fields: dict) -> list[dict]:
    """Collect all Chad feedback versions in order."""
    trail = []
    for label, key in FEEDBACK_VERSIONS:
        text = fields.get(key, "").strip()
        if text:
            trail.append({"version": label, "field": key, "text": text})
    return trail


# ── Script parser ──────────────────────────────────────────────────────────────

def extract_script_sections(raw: str) -> dict:
    """
    Parse raw script text into hook / body / cta / visual_directions.
    Handles **HOOK**/**BODY**/**CTA** format AND freeform text.
    Extracts [visual direction] notes in square brackets.
    """
    hook, body, cta, visuals = "", "", "", []

    # Try structured format (**HOOK**, **BODY**, **CTA**)
    hook_match = re.search(r'\*\*HOOK.*?\*\*(.*?)(?=\*\*|$)', raw, re.DOTALL | re.IGNORECASE)
    body_match = re.search(r'\*\*BODY.*?\*\*(.*?)(?=\*\*CTA|\*\*OUTRO|$)', raw, re.DOTALL | re.IGNORECASE)
    cta_match  = re.search(r'\*\*(CTA|OUTRO|CALL TO ACTION).*?\*\*(.*?)(?=\*\*|$)', raw, re.DOTALL | re.IGNORECASE)

    if hook_match: hook = hook_match.group(1).strip()
    if body_match: body = body_match.group(1).strip()
    if cta_match:  cta  = cta_match.group(2).strip()

    # Extract [visual directions]
    visuals = re.findall(r'\[([^\]]{10,300})\]', raw)

    # Fallback: no structured format → split by lines
    if not hook and not body:
        lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
        hook  = lines[0] if lines else ""
        body  = "\n".join(lines[1:-1]) if len(lines) > 2 else "\n".join(lines[1:])
        cta   = lines[-1] if len(lines) > 1 else ""

    return {
        "hook":              hook[:500],
        "body":              body[:5000],
        "cta":               cta[:500],
        "visual_directions": visuals[:20],
        "full_script":       raw,
        "word_count":        len(raw.split()),
        "char_count":        len(raw),
    }


# ── Channel formats ───────────────────────────────────────────────────────────

CHANNEL_FORMATS = {
    "tiktok":    {"ratio": "9:16", "size": "1080x1920", "style": "vertical short-form"},
    "instagram": {"ratio": "1:1",  "size": "1080x1080", "style": "square carousel"},
    "pinterest": {"ratio": "2:3",  "size": "1000x1500", "style": "vertical pin"},
    "youtube":   {"ratio": "16:9", "size": "1920x1080", "style": "YouTube thumbnail"},
}


# ── Main transform ─────────────────────────────────────────────────────────────

def transform_brief(record: dict) -> dict:
    """Full transform: Airtable row → production-ready package."""
    f        = record["fields"]
    brief_id = record["id"]
    channel  = f.get("Channel", "TikTok").lower()

    # Brain context — improves output based on past performance
    ctx = get_context(AGENT_NAME, channel, brief_id)

    # Best script
    script_version, raw_script = pick_best_script(f)

    # All feedback trail
    feedback_trail = build_feedback_trail(f)

    brief_meta = {
        "id":               brief_id,
        "rank":             f.get("Rank"),
        "title":            f.get("Title", ""),
        "hook":             f.get("Hook", ""),
        "channel":          f.get("Channel", ""),
        "type":             f.get("Type", ""),
        "keyword":          f.get("Keyword", ""),
        "score":            f.get("Score"),
        "evidence":         f.get("Evidence Strength", ""),
        "script_version":   script_version,
        "brief_approved":   f.get("Brief Approved?", ""),
        "content_approved": f.get("Content Approved?", ""),
        "creative_approved":f.get("Creative Approved?", ""),
    }

    script  = extract_script_sections(raw_script)
    fmt     = CHANNEL_FORMATS.get(channel, CHANNEL_FORMATS["tiktok"])

    output = {
        "agent":          AGENT_NAME,
        "version":        "2.0",
        "processed_at":   datetime.now(timezone.utc).isoformat(),
        "brief":          brief_meta,
        "script":         script,
        "chad_feedback":  feedback_trail,
        "brand":          BRAND,
        "brain_context":  ctx,
        "production_notes": {
            "channel_format":     fmt,
            "recommended_voice":  "Sarah (Fish Audio 933563129e564b19a115bedd57b7406a)",
            "caption_color":      BRAND["colors"]["blue"],
            "watermark_text":     f"simplenursing.com  •  {channel.upper()}",
            "cta_url":            "simplenursing.com",
            "script_version_used": script_version,
            "feedback_rounds":    len(feedback_trail),
        },
    }

    # Save to disk
    out_dir  = OUTPUT_DIR / brief_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "agent1_output.json"
    out_path.write_text(json.dumps(output, indent=2))

    # Log to brain
    log_run(AGENT_NAME, brief_id,
            {"brief_id": brief_id, "channel": channel, "script_version": script_version},
            {"word_count": script["word_count"], "feedback_rounds": len(feedback_trail)})

    return output


# ── Pretty print for CLI ───────────────────────────────────────────────────────

def print_brief_summary(result: dict) -> None:
    b = result["brief"]
    s = result["script"]
    fn = result["production_notes"]
    fb = result["chad_feedback"]

    print(f"\n  {'─'*60}")
    print(f"  #{b.get('rank','?')}  [{b['id']}]  {b['channel']}  (script: {b['script_version']})")
    print(f"  📌 {b['title']}")
    print(f"  🎣 HOOK: {b['hook'][:100]}")
    print(f"  📝 Script: {s['word_count']} words, {s['char_count']} chars")
    if fb:
        print(f"  💬 Feedback trail: {', '.join(x['version'] for x in fb)}")
    if s['visual_directions']:
        print(f"  🎬 Visual cues: {len(s['visual_directions'])} found")
    print(f"  ✅ Saved → output/{b['id']}/agent1_output.json")


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="BriefForge — Airtable → Script (real-time, all approved)")
    parser.add_argument("--all",      action="store_true", help="Process all Content Approved briefs")
    parser.add_argument("--brief-id", help="Process a specific brief ID")
    parser.add_argument("--refresh",  action="store_true", help="Force re-fetch + re-process all")
    parser.add_argument("--list",     action="store_true", help="List all Content Approved briefs")
    args = parser.parse_args()

    print(f"\n🔬  {AGENT_NAME} — Real-time Airtable scan (Content Approved)\n")
    print("  Fetching all rows from Airtable...")

    if args.brief_id:
        records = [fetch_brief_by_id(args.brief_id)]
        print(f"  Found 1 brief by ID\n")
    else:
        records = fetch_content_approved()
        print(f"  Found {len(records)} Content Approved briefs\n")

    if args.list or (not args.all and not args.brief_id and not args.refresh):
        print(f"  {'Rank':<5} {'ID':<20} {'Channel':<12} {'Script':<18}  Title")
        print(f"  {'─'*5} {'─'*20} {'─'*12} {'─'*18}  {'─'*50}")
        for r in sorted(records, key=lambda x: x['fields'].get('Rank') or 999):
            f = r["fields"]
            version, _ = pick_best_script(f)
            version_tag = f"✅ {version}" if version != "none" else "❌ no script"
            print(f"  #{str(f.get('Rank','?')):<4} {r['id']:<20} {f.get('Channel',''):<12} {version_tag:<18}  {f.get('Title','')[:55]}")
        print()
        if not args.all and not args.brief_id and not args.refresh:
            return

    # Process
    results = []
    for record in sorted(records, key=lambda x: x['fields'].get('Rank') or 999):
        f = record["fields"]
        version, raw = pick_best_script(f)
        if not raw:
            print(f"  ⚠ #{f.get('Rank','?')} [{record['id']}] — no script found, skipping")
            continue
        result = transform_brief(record)
        print_brief_summary(result)
        results.append(result)
        time.sleep(0.1)

    print(f"\n✅  BriefForge complete — {len(results)}/{len(records)} processed")
    print(f"   Output: agents/output/\n")
    return results


if __name__ == "__main__":
    main()
