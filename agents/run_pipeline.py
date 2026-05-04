"""
Pipeline Runner — Runs all 3 agents in sequence for all approved briefs.

Usage:
    python3 agents/run_pipeline.py              # run all 3 agents on all approved briefs
    python3 agents/run_pipeline.py --brief-id rec0kxOAXZNsJvmwO
    python3 agents/run_pipeline.py --agent 1   # run only Agent 1
    python3 agents/run_pipeline.py --agent 2
    python3 agents/run_pipeline.py --agent 3
    python3 agents/run_pipeline.py --brain      # show brain report
"""

import sys, argparse, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from agent_brain import print_brain_report

def main():
    parser = argparse.ArgumentParser(description="Evolotion — 3-Agent Content Pipeline")
    parser.add_argument("--brief-id", help="Run for a specific brief ID only")
    parser.add_argument("--agent",    type=int, choices=[1,2,3], help="Run only this agent (1, 2, or 3)")
    parser.add_argument("--brain",    action="store_true", help="Show brain report and exit")
    parser.add_argument("--skip-publish", action="store_true", help="Skip Agent 3 (OneDrive upload)")
    args = parser.parse_args()

    if args.brain:
        print_brain_report()
        return

    print("\n" + "═"*60)
    print("  EVOLOTION — Autonomous Content Production Pipeline")
    print("  3 Agents: BriefForge → ImageForge → CloudPublish")
    print("═"*60 + "\n")

    kwargs = []
    if args.brief_id:
        kwargs = ["--brief-id", args.brief_id]
    else:
        kwargs = ["--all"]

    # ── Agent 1: BriefForge ───────────────────────────────────────────────────
    if not args.agent or args.agent == 1:
        print("▶  AGENT 1 — BriefForge  (Airtable → Script + Image Prompts)")
        print("─"*50)
        import agent_1_brief_forge as a1
        # Temporarily patch sys.argv for argparse inside a1
        import sys as _sys
        _orig = _sys.argv[:]
        _sys.argv = ["agent_1_brief_forge.py"] + kwargs
        a1.main()
        _sys.argv = _orig
        print()

    # ── Agent 2: ImageForge ───────────────────────────────────────────────────
    if not args.agent or args.agent == 2:
        print("▶  AGENT 2 — ImageForge  (Prompts → DALL-E 3 + Ideogram)")
        print("─"*50)
        import agent_2_image_forge as a2
        _orig = sys.argv[:]
        sys.argv = ["agent_2_image_forge.py"] + kwargs
        a2.main()
        sys.argv = _orig
        print()

    # ── Agent 3: CloudPublish ─────────────────────────────────────────────────
    if not args.skip_publish and (not args.agent or args.agent == 3):
        print("▶  AGENT 3 — CloudPublish  (Images → OneDrive/SharePoint)")
        print("─"*50)
        import agent_3_cloud_publish as a3
        _orig = sys.argv[:]
        sys.argv = ["agent_3_cloud_publish.py"] + kwargs
        a3.main()
        sys.argv = _orig
        print()

    print("═"*60)
    print("  Pipeline complete. Brain report:")
    print("─"*60)
    print_brain_report()


if __name__ == "__main__":
    main()
