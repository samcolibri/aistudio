"""
Agent 2 — ImageForge
═══════════════════════════════════════════════════════════════════

INPUT:  agent1_output.json (from BriefForge)
OUTPUT: Best 2 images per brief, one from each model:
          - OpenAI DALL-E 3 HD  (best photorealistic)
          - Ideogram v2         (best text-in-image / graphic)

Both models run in parallel for each prompt variant (A/B).
The brain scores and ranks results — best images saved to:
  agents/output/{brief_id}/images/
    dalle3_A.png
    dalle3_B.png
    ideogram_A.png
    ideogram_B.png
    selected.json   ← which 2 are the "best"

Run standalone:
    python3 agents/agent_2_image_forge.py
    python3 agents/agent_2_image_forge.py --brief-id rec0kxOAXZNsJvmwO
    python3 agents/agent_2_image_forge.py --all
"""

import json, sys, os, base64, time, asyncio, argparse
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(Path(__file__).parent))
from config import OPENAI_API_KEY, IDEOGRAM_API_KEY, OUTPUT_DIR, BRAND
from agent_brain import log_run, get_context, register_prompt_winner

try:
    import httpx
except ImportError:
    import subprocess; subprocess.run([sys.executable, "-m", "pip", "install", "httpx", "-q"])
    import httpx

AGENT_NAME = "ImageForge"


# ── OpenAI DALL-E 3 ───────────────────────────────────────────────────────────

def generate_dalle3(prompt: str, size: str = "1024x1792", quality: str = "hd") -> bytes | None:
    """Generate one image with DALL-E 3 HD. Returns PNG bytes or None on error."""
    # Normalize size to DALL-E 3 supported dimensions
    dalle_size = "1024x1792"  # portrait (closest to 9:16)
    if "1:1" in size or "1080x1080" in size:
        dalle_size = "1024x1024"
    elif "16:9" in size or "1920x1080" in size:
        dalle_size = "1792x1024"

    key = OPENAI_API_KEY()
    payload = {
        "model":   "dall-e-3",
        "prompt":  prompt[:4000],   # DALL-E 3 max prompt length
        "n":       1,
        "size":    dalle_size,
        "quality": quality,         # "hd" for best quality
        "response_format": "b64_json",
    }
    try:
        resp = httpx.post(
            "https://api.openai.com/v1/images/generations",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=90,
        )
        resp.raise_for_status()
        b64 = resp.json()["data"][0]["b64_json"]
        revised = resp.json()["data"][0].get("revised_prompt", "")
        return base64.b64decode(b64), revised
    except Exception as e:
        print(f"    ⚠ DALL-E 3 error: {e}")
        return None, ""


# ── Ideogram v2 ───────────────────────────────────────────────────────────────

def generate_ideogram(prompt: str, negative_prompt: str = "", aspect_ratio: str = "ASPECT_9_16") -> bytes | None:
    """Generate one image with Ideogram v2 API. Returns PNG bytes or None."""
    # Map ratio string to Ideogram enum
    ratio_map = {
        "9:16": "ASPECT_9_16",
        "1:1":  "ASPECT_1_1",
        "16:9": "ASPECT_16_9",
        "2:3":  "ASPECT_2_3",
        "3:2":  "ASPECT_3_2",
    }
    # Accept either "9:16" or "ASPECT_9_16"
    if not aspect_ratio.startswith("ASPECT_"):
        aspect_ratio = ratio_map.get(aspect_ratio, "ASPECT_9_16")

    key = IDEOGRAM_API_KEY()
    payload = {
        "image_request": {
            "prompt":           prompt[:2000],
            "negative_prompt":  negative_prompt[:500],
            "model":            "V_2",
            "magic_prompt_option": "AUTO",
            "aspect_ratio":     aspect_ratio,
            "style_type":       "DESIGN",   # Best for text + graphics
        }
    }
    try:
        resp = httpx.post(
            "https://api.ideogram.ai/generate",
            headers={"Api-Key": key, "Content-Type": "application/json"},
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        img_url = data["data"][0]["url"]
        # Download the image
        img_resp = httpx.get(img_url, timeout=60)
        img_resp.raise_for_status()
        return img_resp.content, data["data"][0].get("prompt", "")
    except Exception as e:
        print(f"    ⚠ Ideogram error: {e}")
        return None, ""


# ── Quality auto-scorer ───────────────────────────────────────────────────────

def auto_score(model: str, variant: str, bytes_size: int, error: bool) -> float:
    """
    Simple heuristic quality score (0-1).
    Real scoring should be done by human review via brain.score_run().
    """
    if error or bytes_size < 10000:
        return 0.0
    base = 0.7
    if model == "dalle3" and variant == "A":   # Photo-realistic for photorealistic prompt
        base = 0.80
    elif model == "ideogram" and variant == "B":  # Graphic for graphic prompt
        base = 0.82
    elif model == "ideogram" and variant == "C":  # Ideogram shines on text-heavy
        base = 0.85
    # Larger file = more detail (rough proxy)
    if bytes_size > 500000:
        base += 0.05
    return min(base, 1.0)


# ── Main generation ───────────────────────────────────────────────────────────

def generate_for_brief(agent1_output: dict) -> dict:
    """Run both models on all prompts for one brief."""
    brief   = agent1_output["brief"]
    brief_id = brief["id"]
    channel  = brief["channel"].lower()
    prompts  = agent1_output["image_prompts"]

    # Brain context
    ctx = get_context(AGENT_NAME, channel, brief_id)
    if ctx["agent_avg_quality"] > 0:
        print(f"    🧠 Brain says avg quality for {AGENT_NAME}: {ctx['agent_avg_quality']:.2f}")

    img_dir = OUTPUT_DIR / brief_id / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    results = []

    for prompt_spec in prompts:
        variant  = prompt_spec["variant"]
        prompt   = prompt_spec["prompt"]
        neg      = prompt_spec.get("negative_prompt", "")
        ratio    = prompt_spec["format"]

        print(f"    🎨 Variant {variant}: DALL-E 3 + Ideogram running in parallel...")

        # Run both models (thread pool for parallel execution)
        dalle_result  = [None, ""]
        ideo_result   = [None, ""]

        def run_dalle():
            dalle_result[0], dalle_result[1] = generate_dalle3(prompt, size=prompt_spec["size"])

        def run_ideogram():
            ideo_result[0], ideo_result[1] = generate_ideogram(prompt, neg, ratio)

        with ThreadPoolExecutor(max_workers=2) as ex:
            f1 = ex.submit(run_dalle)
            f2 = ex.submit(run_ideogram)
            f1.result(); f2.result()

        # Save images
        for model_name, data, revised in [
            ("dalle3",   dalle_result[0],  dalle_result[1]),
            ("ideogram", ideo_result[0],   ideo_result[1]),
        ]:
            if data:
                fname = img_dir / f"{model_name}_{variant}.png"
                fname.write_bytes(data)
                score = auto_score(model_name, variant, len(data), False)
                results.append({
                    "model":          model_name,
                    "variant":        variant,
                    "file":           str(fname.relative_to(OUTPUT_DIR.parent.parent)),
                    "bytes":          len(data),
                    "quality_score":  score,
                    "revised_prompt": revised[:200] if revised else "",
                    "original_prompt": prompt[:200],
                })
                status = "✅" if data else "❌"
                print(f"      {status} {model_name}_{variant}.png  ({len(data)//1024}KB)  score={score:.2f}")
            else:
                results.append({
                    "model": model_name, "variant": variant,
                    "file": None, "bytes": 0, "quality_score": 0.0, "error": True,
                })

    # Select best 2 (one per model, highest scoring variant for each)
    dalle_best   = max([r for r in results if r["model"] == "dalle3"  and r.get("file")],
                       key=lambda x: x["quality_score"], default=None)
    ideogram_best = max([r for r in results if r["model"] == "ideogram" and r.get("file")],
                        key=lambda x: x["quality_score"], default=None)
    selected = [r for r in [dalle_best, ideogram_best] if r]

    # Register top-scoring prompts with brain
    for r in selected:
        if r["quality_score"] >= 0.8:
            original = next((p["prompt"] for p in prompts if p["variant"] == r["variant"]), "")
            register_prompt_winner(channel, original, r["quality_score"], brief["title"])

    output = {
        "agent":        AGENT_NAME,
        "version":      "1.0",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "brief_id":     brief_id,
        "brief_title":  brief["title"],
        "channel":      channel,
        "all_results":  results,
        "selected":     selected,
        "images_dir":   str(img_dir.relative_to(OUTPUT_DIR.parent.parent)),
    }

    # Save
    out_path = OUTPUT_DIR / brief_id / "agent2_output.json"
    out_path.write_text(json.dumps(output, indent=2))

    # Log to brain
    log_run(AGENT_NAME, brief_id,
            {"brief_id": brief_id, "prompts": len(prompts)},
            {"selected": len(selected), "results": len(results)},
            quality_score=max([r["quality_score"] for r in selected], default=0.0))

    return output


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ImageForge — Script+Prompts → DALL-E 3 + Ideogram")
    parser.add_argument("--all",      action="store_true", help="Process all agent1 outputs")
    parser.add_argument("--brief-id", help="Process a specific brief")
    args = parser.parse_args()

    print(f"\n🎨  {AGENT_NAME} — DALL-E 3 HD + Ideogram v2\n")

    # Find agent1 outputs
    if args.brief_id:
        brief_dirs = [OUTPUT_DIR / args.brief_id]
    else:
        brief_dirs = [d for d in OUTPUT_DIR.iterdir() if d.is_dir()]

    processed = 0
    for brief_dir in sorted(brief_dirs):
        a1_file = brief_dir / "agent1_output.json"
        if not a1_file.exists():
            continue
        a1 = json.loads(a1_file.read_text())
        brief = a1["brief"]
        print(f"  Brief #{brief.get('rank','?')} [{brief['id']}]  {brief['channel']}  {brief['title'][:50]}...")
        result = generate_for_brief(a1)
        print(f"    💾 {len(result['selected'])} images selected — {result['images_dir']}")
        processed += 1
        time.sleep(1)  # rate limit between briefs

    if processed == 0:
        print("  ⚠ No agent1_output.json found. Run agent_1_brief_forge.py first.")
    else:
        print(f"\n✅  ImageForge complete — {processed} briefs processed\n")


if __name__ == "__main__":
    main()
