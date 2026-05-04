"""
Agent Brain — Super Brain / Learning Loop

Every agent call goes through the brain:
  - Logs every run (input, output, timestamp, quality score)
  - Learns which prompts produce best results per channel/type
  - Updates model.json with aggregate stats
  - Next agent run gets brain context → better output

Storage:
  agents/brain/runs.jsonl     — append-only run log (ground truth)
  agents/brain/model.json     — current learned state (derived)
"""

import json, time, hashlib, os
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

BRAIN_DIR = Path(__file__).parent / "brain"
RUNS_LOG  = BRAIN_DIR / "runs.jsonl"
MODEL_FILE = BRAIN_DIR / "model.json"

BRAIN_DIR.mkdir(exist_ok=True)


# ── Logging ───────────────────────────────────────────────────────────────────

def log_run(agent_name: str, brief_id: str, input_data: dict, output_data: dict,
            quality_score: float = -1.0, notes: str = "") -> str:
    """Append one run record to runs.jsonl. Returns run_id."""
    run_id = hashlib.md5(f"{agent_name}{brief_id}{time.time()}".encode()).hexdigest()[:12]
    record = {
        "run_id":       run_id,
        "agent":        agent_name,
        "brief_id":     brief_id,
        "timestamp":    datetime.now(timezone.utc).isoformat(),
        "input_hash":   hashlib.md5(json.dumps(input_data, sort_keys=True).encode()).hexdigest()[:12],
        "output_keys":  list(output_data.keys()),
        "quality_score": quality_score,   # -1 = not yet scored, 0-1 = scored
        "notes":        notes,
    }
    with open(RUNS_LOG, "a") as f:
        f.write(json.dumps(record) + "\n")
    _update_model(record)
    return run_id


def score_run(run_id: str, score: float, notes: str = "") -> None:
    """Update quality score for a run (called after human review or auto-eval)."""
    lines = []
    if RUNS_LOG.exists():
        for line in RUNS_LOG.read_text().splitlines():
            r = json.loads(line)
            if r["run_id"] == run_id:
                r["quality_score"] = score
                r["notes"] = notes
            lines.append(json.dumps(r))
    RUNS_LOG.write_text("\n".join(lines) + "\n")
    _rebuild_model()


# ── Model update ──────────────────────────────────────────────────────────────

def _update_model(record: dict) -> None:
    """Incrementally update model.json with a new run."""
    model = load_model()
    agent = record["agent"]
    if agent not in model["agents"]:
        model["agents"][agent] = {"runs": 0, "scored": 0, "avg_quality": -1.0, "last_run": ""}
    m = model["agents"][agent]
    m["runs"] += 1
    m["last_run"] = record["timestamp"]
    if record["quality_score"] >= 0:
        prev_avg = m["avg_quality"] if m["avg_quality"] >= 0 else 0.0
        n = m["scored"]
        m["avg_quality"] = (prev_avg * n + record["quality_score"]) / (n + 1)
        m["scored"] += 1
    model["total_runs"] += 1
    model["last_updated"] = record["timestamp"]
    _save_model(model)


def _rebuild_model() -> None:
    """Full rebuild of model.json from runs.jsonl (called after scoring)."""
    model = _empty_model()
    if not RUNS_LOG.exists():
        _save_model(model)
        return
    for line in RUNS_LOG.read_text().splitlines():
        if not line.strip():
            continue
        _update_model(json.loads(line))


def load_model() -> dict:
    if MODEL_FILE.exists():
        return json.loads(MODEL_FILE.read_text())
    return _empty_model()


def _empty_model() -> dict:
    return {
        "version": 1,
        "total_runs": 0,
        "last_updated": "",
        "agents": {},
        "brief_performance": {},   # brief_id → avg quality across all agents
        "channel_insights": {},    # channel → what works
        "prompt_winners": [],      # top-scoring prompts for reuse
    }


def _save_model(model: dict) -> None:
    MODEL_FILE.write_text(json.dumps(model, indent=2))


# ── Context retrieval ─────────────────────────────────────────────────────────

def get_context(agent_name: str, channel: str, brief_id: str) -> dict:
    """
    Returns brain context for an agent before it runs.
    Agents use this to improve their output based on past performance.
    """
    model = load_model()
    agent_stats = model["agents"].get(agent_name, {})
    channel_insights = model["channel_insights"].get(channel.lower(), {})
    brief_perf = model["brief_performance"].get(brief_id, {})
    top_prompts = [p for p in model["prompt_winners"] if p.get("channel") == channel.lower()][:3]
    return {
        "agent_runs_so_far": agent_stats.get("runs", 0),
        "agent_avg_quality": agent_stats.get("avg_quality", -1.0),
        "channel_insights": channel_insights,
        "brief_past_performance": brief_perf,
        "top_prompts_for_channel": top_prompts,
        "note": "Use this context to improve output quality. Higher quality = more like approved examples.",
    }


def update_channel_insight(channel: str, key: str, value: Any) -> None:
    """Store a learned insight about a channel."""
    model = load_model()
    if channel not in model["channel_insights"]:
        model["channel_insights"][channel] = {}
    model["channel_insights"][channel][key] = value
    _save_model(model)


def register_prompt_winner(channel: str, prompt: str, score: float, context: str = "") -> None:
    """Register a high-scoring prompt for future reuse."""
    model = load_model()
    model["prompt_winners"].append({
        "channel": channel.lower(),
        "prompt": prompt[:300],
        "score": score,
        "context": context,
        "added": datetime.now(timezone.utc).isoformat(),
    })
    # Keep only top 50 winners
    model["prompt_winners"].sort(key=lambda x: x["score"], reverse=True)
    model["prompt_winners"] = model["prompt_winners"][:50]
    _save_model(model)


# ── Report ────────────────────────────────────────────────────────────────────

def print_brain_report() -> None:
    model = load_model()
    print(f"\n🧠  AGENT BRAIN — {model['total_runs']} total runs")
    print(f"    Last updated: {model['last_updated'] or 'never'}\n")
    for agent, stats in model["agents"].items():
        q = stats["avg_quality"]
        q_str = f"{q:.2f}" if q >= 0 else "unscored"
        print(f"  {agent}: {stats['runs']} runs  avg_quality={q_str}  last={stats.get('last_run','')[:10]}")
    if model["prompt_winners"]:
        print(f"\n  🏆 Top prompt winner (score {model['prompt_winners'][0]['score']}):")
        print(f"     {model['prompt_winners'][0]['prompt'][:100]}...")
    print()
