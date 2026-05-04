#!/usr/bin/env python3
"""
Evolotion — Agent 1: BriefForge
════════════════════════════════════════════════════════════════════

TABLE 1  Content Briefs (Live)   — V1→V5 scripts, Content Approved gate
TABLE 2  Version 2 (Living)      — Content Brief field, all rows pulled

Usage:
    python3 agent.py                        list Table 1 approved briefs
    python3 agent.py --all                  process Table 1 approved briefs
    python3 agent.py --v2                   list Version 2 briefs
    python3 agent.py --v2 --all             process all Version 2 briefs
    python3 agent.py --brief-id recXXXXX    process one brief (either table)
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

# Airtable identifiers — locked to SimpleNursing base
AIRTABLE_BASE_ID   = "appLFh438nLooz6u7"

# Table 1 — Content Briefs (Live) — original V1→V5 pipeline
TABLE1_ID          = "tbl5P3J8agdY4gNtT"
TABLE1_NAME        = "Content Briefs (Live)"

# Table 2 — Version 2 (Living) — new structured brief pipeline
TABLE2_ID          = "tblrwTcoT7YNZhNA6"
TABLE2_NAME        = "Version 2 (Living)"

# Approval gate for Table 1
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


def _fetch_table(table_id: str) -> list[dict]:
    """Fetch all rows from any table in the base (paginated)."""
    key     = _get_api_key()
    url     = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{table_id}"
    headers = {"Authorization": f"Bearer {key}"}
    rows    = []
    params  = {"maxRecords": 100}
    while True:
        resp = httpx.get(url, params=params, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        rows += data.get("records", [])
        offset = data.get("offset")
        if not offset:
            break
        params = {"maxRecords": 100, "offset": offset}
    return rows


def fetch_all_rows() -> list[dict]:
    """Fetch all rows from Table 1 (Content Briefs Live)."""
    return _fetch_table(TABLE1_ID)


def fetch_content_approved() -> list[dict]:
    """Table 1: return only Content Approved = Approved rows."""
    return [r for r in fetch_all_rows() if r["fields"].get(APPROVAL_FIELD) == APPROVAL_VALUE]


def fetch_v2_all() -> list[dict]:
    """Table 2 (Version 2 Living): return all rows that have Content Brief."""
    rows = _fetch_table(TABLE2_ID)
    return [r for r in rows if r["fields"].get("Content Brief", "").strip()]


def fetch_by_id(brief_id: str, table_id: str = TABLE1_ID) -> dict:
    """Fetch a single row by record ID from the given table."""
    key  = _get_api_key()
    url  = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{table_id}/{brief_id}"
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


def transform_v2(record: dict) -> dict:
    """
    Transform one Version 2 (Living) row into a production-ready package.
    Content lives in 'Content Brief' field (structured markdown).
    Also reads Scout Sources, Creative Brief, Maya Segment.
    """
    fields   = record["fields"]
    brief_id = record["id"]
    channel  = fields.get("Channel", "Instagram").lower()

    raw_script   = fields.get("Content Brief", "").strip()
    feedback     = collect_feedback(fields)
    fmt          = CHANNEL_FORMATS.get(channel, CHANNEL_FORMATS["instagram"])
    maya_segment = fields.get("Maya Segment", "")

    output = {
        "agent":        "BriefForge",
        "table":        TABLE2_NAME,
        "version":      "2.0",
        "processed_at": datetime.now(timezone.utc).isoformat(),

        "brief": {
            "id":               brief_id,
            "rank":             fields.get("Rank"),
            "title":            fields.get("Title", ""),
            "hook":             fields.get("Hook", ""),
            "channel":          fields.get("Channel", ""),
            "type":             fields.get("Type", ""),
            "keyword":          fields.get("Keyword", ""),
            "score":            fields.get("Score"),
            "evidence":         fields.get("Evidence Strength", ""),
            "readiness":        fields.get("Readiness"),
            "freshness":        fields.get("Freshness", ""),
            "maya_segment":     maya_segment,
            "script_version":   "Content Brief",
            "brief_approved":   fields.get("Brief Approved?", ""),
            "content_approved": fields.get("Content Approved?", ""),
        },

        "script": parse_script(raw_script),

        # Scout Sources — research backing this brief
        "scout_sources":    fields.get("Scout Sources", ""),

        # Creative Brief — visual direction for image/carousel
        "creative_brief":   fields.get("Creative Brief", ""),

        # Business Case — why this topic matters for SimpleNursing
        "business_case":    fields.get("Business Case", ""),

        "chad_feedback":    feedback,
        "brand":            BRAND,

        "production_notes": {
            "channel_format":      fmt,
            "recommended_voice":   f"{BRAND['voice']} ({BRAND['voice_provider']} {BRAND['voice_id']})",
            "maya_target":         maya_segment,
            "script_version_used": "Content Brief",
            "feedback_rounds":     len(feedback),
            "cta_url":             BRAND["website"],
            "watermark":           f"{BRAND['website']}  •  {channel.upper()}",
        },
    }

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
        description="BriefForge — reads Airtable live, saves scripts locally",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Table 1 (Content Briefs Live):\n"
            "  python3 agent.py                     list approved\n"
            "  python3 agent.py --all               process all approved\n\n"
            "Table 2 (Version 2 Living):\n"
            "  python3 agent.py --v2                list all V2 briefs\n"
            "  python3 agent.py --v2 --all          process all V2 briefs\n\n"
            "Single brief:\n"
            "  python3 agent.py --brief-id recXXX   process one (Table 1)\n"
            "  python3 agent.py --v2 --brief-id recXXX  process one (Table 2)\n"
        ),
    )
    parser.add_argument("--all",      action="store_true", help="Process all briefs")
    parser.add_argument("--v2",       action="store_true", help="Use Version 2 (Living) table")
    parser.add_argument("--brief-id", metavar="ID",        help="Process one brief by record ID")
    parser.add_argument("--list",     action="store_true", help="List briefs without processing")
    args = parser.parse_args()

    _print_header()

    if args.v2:
        print(f"\n  Table: {TABLE2_NAME}  [{TABLE2_ID}]")
        print("  Fetching all rows from Airtable (real-time)...\n")

        if args.brief_id:
            records = [fetch_by_id(args.brief_id, TABLE2_ID)]
            print(f"  Fetched 1 V2 brief by ID: {args.brief_id}\n")
        else:
            records = fetch_v2_all()
            print(f"  Found {len(records)} Version 2 briefs with content\n")

        records.sort(key=lambda r: r["fields"].get("Rank") or 999)

        if args.list or (not args.all and not args.brief_id):
            print(f"  {'#':<4} {'ID':<22} {'Channel':<12} {'Maya':<8} {'Score':<7}  Title")
            print(f"  {'─' * 85}")
            for r in records:
                f = r["fields"]
                print(
                    f"  #{str(f.get('Rank','?')):<3} {r['id']:<22} {str(f.get('Channel','')):<12} "
                    f"{str(f.get('Maya Segment','')):<8} {str(f.get('Score','')):<7}  {str(f.get('Title',''))[:48]}"
                )
            print()
            if not args.all:
                print("  Pass --v2 --all to process all Version 2 briefs locally.\n")
                return

        results = []
        for record in records:
            if not record["fields"].get("Content Brief", "").strip():
                print(f"  ⚠  [{record['id']}] no Content Brief — skipping")
                continue
            result = transform_v2(record)
            _print_result(result)
            results.append(result)
            time.sleep(0.05)

        print(f"\n{'═' * 62}")
        print(f"  BriefForge V2 complete — {len(results)} of {len(records)} saved")
        print(f"  Output: agents/output/")
        print(f"{'═' * 62}\n")
        return results

    else:
        print(f"\n  Table: {TABLE1_NAME}  [{TABLE1_ID}]")
        print("  Fetching all rows from Airtable (real-time)...\n")

        if args.brief_id:
            records = [fetch_by_id(args.brief_id, TABLE1_ID)]
            print(f"  Fetched 1 brief by ID: {args.brief_id}\n")
        else:
            records = fetch_content_approved()
            print(f"  Found {len(records)} {APPROVAL_VALUE} briefs\n")

        records.sort(key=lambda r: r["fields"].get("Rank") or 999)

        if args.list or (not args.all and not args.brief_id):
            _print_list(records)
            if not args.all:
                print("  Pass --all to process all, or --v2 for Version 2 table.\n")
                return

        results = []
        for record in records:
            label, raw = pick_best_script(record["fields"])
            if not raw:
                print(f"  ⚠  [{record['id']}] no script found — skipping")
                continue
            result = transform(record)
            _print_result(result)
            results.append(result)
            time.sleep(0.1)

        print(f"\n{'═' * 62}")
        print(f"  BriefForge complete — {len(results)} of {len(records)} briefs processed")
        print(f"  Output: agents/output/")
        print(f"{'═' * 62}\n")
        return results


if __name__ == "__main__":
    main()
