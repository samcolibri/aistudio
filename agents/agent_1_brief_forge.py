"""
Agent 1 — BriefForge
═══════════════════════════════════════════════════════════════════

INPUT:  Airtable Creative Approved brief (full row)
OUTPUT: Structured JSON with:
          - Clean script (hook / body / CTA sections)
          - Image prompts (per slide/scene, 2 variants each)
          - Brand context
          - Production notes for downstream agents

This agent reads the full Airtable row — including every version of
Chad's feedback — and transforms it into the exact production-ready
package that Agent 2 (ImageForge) and the Remotion compositor need.

Run standalone:
    python3 agents/agent_1_brief_forge.py
    python3 agents/agent_1_brief_forge.py --brief-id rec0kxOAXZNsJvmwO
    python3 agents/agent_1_brief_forge.py --all
"""

import json, sys, os, re, time, argparse
from pathlib import Path
from datetime import datetime, timezone

# ── Path setup ────────────────────────────────────────────────────────────────
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

# ── Airtable fetch ────────────────────────────────────────────────────────────

def fetch_approved_briefs() -> list[dict]:
    """Fetch all Creative Approved briefs from Airtable."""
    key = AIRTABLE_API_KEY()
    base = AIRTABLE_BASE_ID()
    url  = f"https://api.airtable.com/v0/{base}/{AIRTABLE_TABLE_ID}"
    params = {"filterByFormula": '{Creative Approved?}="Approved"', "maxRecords": 100}
    headers = {"Authorization": f"Bearer {key}"}
    resp = httpx.get(url, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json().get("records", [])

def fetch_brief_by_id(brief_id: str) -> dict:
    key = AIRTABLE_API_KEY()
    base = AIRTABLE_BASE_ID()
    url  = f"https://api.airtable.com/v0/{base}/{AIRTABLE_TABLE_ID}/{brief_id}"
    resp = httpx.get(url, headers={"Authorization": f"Bearer {key}"}, timeout=30)
    resp.raise_for_status()
    return resp.json()

# ── Script parser ─────────────────────────────────────────────────────────────

def extract_script_sections(raw: str) -> dict:
    """
    Parse the raw script text into hook / body / cta / visual_directions.
    Works with both the structured **HOOK** format and freeform text.
    """
    hook, body, cta, visuals = "", "", "", []

    # Try structured format first (**HOOK**, **BODY**, **CTA**)
    hook_match = re.search(r'\*\*HOOK.*?\*\*(.*?)(?=\*\*|$)', raw, re.DOTALL | re.IGNORECASE)
    body_match = re.search(r'\*\*BODY.*?\*\*(.*?)(?=\*\*CTA|\*\*OUTRO|$)', raw, re.DOTALL | re.IGNORECASE)
    cta_match  = re.search(r'\*\*(CTA|OUTRO|CALL TO ACTION).*?\*\*(.*?)(?=\*\*|$)', raw, re.DOTALL | re.IGNORECASE)

    if hook_match:
        hook = hook_match.group(1).strip()
    if body_match:
        body = body_match.group(1).strip()
    if cta_match:
        cta = cta_match.group(2).strip()

    # Extract [visual directions] in square brackets
    visuals = re.findall(r'\[([^\]]{10,200})\]', raw)

    # If no structured format found, use raw as body
    if not hook and not body:
        lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
        hook  = lines[0] if lines else ""
        body  = "\n".join(lines[1:-1]) if len(lines) > 2 else "\n".join(lines[1:])
        cta   = lines[-1] if len(lines) > 1 else ""

    return {
        "hook":              hook[:500],
        "body":              body[:2000],
        "cta":               cta[:300],
        "visual_directions": visuals[:10],
        "full_script":       raw,
    }


# ── Image prompt builder ──────────────────────────────────────────────────────

CHANNEL_FORMATS = {
    "tiktok":    {"ratio": "9:16", "size": "1080x1920", "style": "vertical short-form social"},
    "instagram": {"ratio": "1:1",  "size": "1080x1080", "style": "square carousel slide"},
    "pinterest": {"ratio": "2:3",  "size": "1000x1500", "style": "vertical educational pin"},
    "youtube":   {"ratio": "16:9", "size": "1920x1080", "style": "horizontal YouTube thumbnail"},
}

def build_image_prompts(brief: dict, script: dict) -> list[dict]:
    """
    Generate 2-3 image prompts per brief:
      - Prompt A: Photo-realistic / editorial style
      - Prompt B: Bold graphic / infographic style
      - Prompt C (carousels): cover slide + first content slide
    """
    title   = brief.get("title", "")
    hook    = brief.get("hook", "")
    keyword = brief.get("keyword", "")
    channel = brief.get("channel", "tiktok").lower()
    b_type  = brief.get("type", "").lower()
    fmt     = CHANNEL_FORMATS.get(channel, CHANNEL_FORMATS["tiktok"])
    colors  = BRAND["colors"]

    brand_style = (
        f"SimpleNursing brand colors: teal {colors['teal']}, pink {colors['pink']}, "
        f"yellow {colors['yellow']}, dark background {colors['dark']}. "
        f"Professional nursing education content. Gen Z audience, female 17-18."
    )

    prompts = []

    # ── Prompt A: Photorealistic ──────────────────────────────────────────────
    prompts.append({
        "variant": "A",
        "style":   "photorealistic",
        "format":  fmt["ratio"],
        "size":    fmt["size"],
        "prompt":  (
            f"Educational nursing content for {channel}. "
            f"Title overlay: \"{title}\". "
            f"Young female nursing student, 17-18, diverse, confident, direct eye contact. "
            f"Clean clinical setting or study environment. "
            f"Bold readable text: \"{hook[:80]}\". "
            f"{brand_style} "
            f"Format: {fmt['style']}, {fmt['ratio']} ratio. "
            f"High quality, mobile-optimized, no watermarks."
        ),
        "negative_prompt": "watermark, logo, blurry, low quality, nsfw, text errors, misspelling",
    })

    # ── Prompt B: Bold graphic / infographic ─────────────────────────────────
    prompts.append({
        "variant": "B",
        "style":   "graphic_design",
        "format":  fmt["ratio"],
        "size":    fmt["size"],
        "prompt":  (
            f"Bold educational infographic for SimpleNursing {channel}. "
            f"Headline: \"{title}\". "
            f"Hook text large and readable: \"{hook[:80]}\". "
            f"Dark background {colors['dark']}, accent {colors['teal']}, "
            f"highlight {colors['yellow']}, pop color {colors['pink']}. "
            f"Clean sans-serif typography, icon-driven layout. "
            f"Nursing education theme. {fmt['style']} format, {fmt['ratio']} ratio. "
            f"Save-worthy, shareable, professional."
        ),
        "negative_prompt": "watermark, blurry, crowded, text errors, low contrast",
    })

    # ── Prompt C: Carousel cover (Instagram only) ────────────────────────────
    if "carousel" in b_type or channel == "instagram":
        prompts.append({
            "variant": "C",
            "style":   "carousel_cover",
            "format":  "1:1",
            "size":    "1080x1080",
            "prompt":  (
                f"Instagram carousel cover slide. Hook text large: \"{hook[:60]}\". "
                f"Dark background {colors['dark']}, bold teal {colors['teal']} accent. "
                f"Swipe indicator arrow. SimpleNursing brand. Clean, minimal. "
                f"High contrast, mobile-first."
            ),
            "negative_prompt": "watermark, blurry, text errors",
        })

    return prompts


# ── Main transform ────────────────────────────────────────────────────────────

def transform_brief(record: dict) -> dict:
    """Full transform: Airtable row → production-ready package."""
    f       = record["fields"]
    brief_id = record["id"]
    channel = f.get("Channel", "TikTok").lower()

    # Get brain context to improve this run
    ctx = get_context(AGENT_NAME, channel, brief_id)

    # Best script version: V5 > Content Preview > empty
    raw_script = (
        f.get("V5 Content") or
        f.get("Content Preview") or
        f.get("V4 Content") or
        ""
    )

    brief_meta = {
        "id":       brief_id,
        "rank":     f.get("Rank"),
        "title":    f.get("Title", ""),
        "hook":     f.get("Hook", ""),
        "channel":  f.get("Channel", ""),
        "type":     f.get("Type", ""),
        "keyword":  f.get("Keyword", ""),
        "score":    f.get("Score"),
        "evidence": f.get("Evidence Strength", ""),
    }

    script   = extract_script_sections(raw_script)
    prompts  = build_image_prompts(brief_meta, script)

    # Chad's latest feedback for agent notes
    feedback_trail = []
    for key in ["Feedback", "V4 Chad Feedback", "V5 Chad Feedback"]:
        if f.get(key):
            feedback_trail.append({"version": key, "text": f[key][:400]})

    output = {
        "agent":          AGENT_NAME,
        "version":        "1.0",
        "processed_at":   datetime.now(timezone.utc).isoformat(),
        "brief":          brief_meta,
        "script":         script,
        "image_prompts":  prompts,
        "brand":          BRAND,
        "chad_feedback":  feedback_trail,
        "brain_context":  ctx,
        "production_notes": {
            "channel_format": CHANNEL_FORMATS.get(channel, {}),
            "recommended_voice": "Sarah (Fish Audio 933563129e564b19a115bedd57b7406a)",
            "caption_color":    BRAND["colors"]["blue"],
            "watermark_text":   f"simplenursing.com  •  {channel.upper()}",
            "cta_url":          "simplenursing.com",
        },
    }

    # Save to disk
    out_dir = OUTPUT_DIR / brief_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "agent1_output.json"
    out_path.write_text(json.dumps(output, indent=2))

    # Log to brain
    log_run(AGENT_NAME, brief_id, {"brief_id": brief_id, "channel": channel}, output)

    return output


# ── CLI entry point ───────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="BriefForge — Airtable → Script + Image Prompts")
    parser.add_argument("--all", action="store_true", help="Process all Creative Approved briefs")
    parser.add_argument("--brief-id", help="Process a specific brief ID")
    parser.add_argument("--list", action="store_true", help="List all Creative Approved briefs")
    args = parser.parse_args()

    print(f"\n🔬  {AGENT_NAME} — Airtable → Script + Image Prompts\n")

    if args.list or (not args.all and not args.brief_id):
        briefs = fetch_approved_briefs()
        print(f"Found {len(briefs)} Creative Approved briefs:\n")
        for r in briefs:
            f = r["fields"]
            v5 = "✅ V5" if f.get("V5 Content") else "📄 Content Preview"
            print(f"  #{f.get('Rank','?')}  [{r['id']}]  {f.get('Channel',''):<10}  {v5}  {f.get('Title','')[:60]}")
        print()
        if not args.all and not args.brief_id:
            return

    if args.all:
        records = fetch_approved_briefs()
    elif args.brief_id:
        records = [fetch_brief_by_id(args.brief_id)]
    else:
        records = fetch_approved_briefs()

    results = []
    for record in records:
        f = record["fields"]
        print(f"  Processing #{f.get('Rank','?')} — {f.get('Title','')[:55]}...")
        result = transform_brief(record)
        out_path = OUTPUT_DIR / record["id"] / "agent1_output.json"
        print(f"    ✅ Saved → {out_path.relative_to(Path(__file__).parent.parent)}")
        print(f"    📝 Script sections: hook({len(result['script']['hook'])}c) body({len(result['script']['body'])}c)")
        print(f"    🎨 Image prompts: {len(result['image_prompts'])} variants (A/B{'C' if len(result['image_prompts'])>2 else ''})")
        results.append(result)
        time.sleep(0.2)  # polite rate limit

    print(f"\n✅  BriefForge complete — {len(results)} briefs processed")
    print(f"   Output dir: agents/output/\n")
    return results


if __name__ == "__main__":
    main()
