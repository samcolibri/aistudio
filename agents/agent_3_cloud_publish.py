"""
Agent 3 — CloudPublish
═══════════════════════════════════════════════════════════════════

INPUT:  agent2_output.json (selected images + metadata)
OUTPUT: Files uploaded to Microsoft OneDrive / SharePoint
          - Creates folder: AI Studio/{channel}/{brief_title}/
          - Uploads both selected images
          - Uploads agent1_output.json (script)
          - Writes agent3_urls.json with all share links

Authentication: Microsoft Graph API (OAuth2 client credentials)
Required env vars:
  MS_CLIENT_ID      — Azure app client ID
  MS_CLIENT_SECRET  — Azure app client secret
  MS_TENANT_ID      — Azure tenant ID
  MS_SHAREPOINT_SITE — e.g. colibrigroup.sharepoint.com (optional)
  MS_DRIVE_FOLDER    — root folder name (default: "AI Studio")

Run standalone:
    python3 agents/agent_3_cloud_publish.py
    python3 agents/agent_3_cloud_publish.py --brief-id rec0kxOAXZNsJvmwO
    python3 agents/agent_3_cloud_publish.py --all
"""

import json, sys, os, time, argparse
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID,
    MS_SHAREPOINT_SITE, MS_DRIVE_FOLDER,
    OUTPUT_DIR, BRAND
)
from agent_brain import log_run, get_context

try:
    import httpx
except ImportError:
    import subprocess; subprocess.run([sys.executable, "-m", "pip", "install", "httpx", "-q"])
    import httpx

AGENT_NAME   = "CloudPublish"
GRAPH_BASE   = "https://graph.microsoft.com/v1.0"
ROOT_DIR     = Path(__file__).parent.parent   # aistudio/


# ── Microsoft Graph Auth ──────────────────────────────────────────────────────

_token_cache: dict = {}

def get_access_token() -> str:
    """Get OAuth2 token using client credentials flow."""
    global _token_cache
    now = time.time()
    if _token_cache.get("expires_at", 0) > now + 60:
        return _token_cache["access_token"]

    tenant  = MS_TENANT_ID()
    url     = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    payload = {
        "grant_type":    "client_credentials",
        "client_id":     MS_CLIENT_ID(),
        "client_secret": MS_CLIENT_SECRET(),
        "scope":         "https://graph.microsoft.com/.default",
    }
    resp = httpx.post(url, data=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    _token_cache = {
        "access_token": data["access_token"],
        "expires_at":   now + data.get("expires_in", 3600),
    }
    return data["access_token"]


def graph(method: str, path: str, **kwargs) -> dict:
    """Make a Microsoft Graph API call."""
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}", **kwargs.pop("headers", {})}
    resp = httpx.request(
        method, f"{GRAPH_BASE}{path}",
        headers=headers, timeout=120, **kwargs
    )
    if not resp.is_success:
        raise Exception(f"Graph {method} {path} → {resp.status_code}: {resp.text[:300]}")
    return resp.json() if resp.content else {}


# ── Drive resolution ──────────────────────────────────────────────────────────

def get_drive_id() -> tuple[str, str]:
    """
    Returns (drive_id, base_path) depending on config:
      - If MS_SHAREPOINT_SITE is set → use that SharePoint site's drive
      - Otherwise → use the app's user OneDrive
    """
    site = MS_SHAREPOINT_SITE()
    if site:
        # SharePoint site drive
        resp = graph("GET", f"/sites/{site}")
        site_id = resp["id"]
        drives = graph("GET", f"/sites/{site_id}/drives")
        # Use "Documents" drive (default document library)
        doc_drive = next(
            (d for d in drives["value"] if d["name"] in ("Documents", "Shared Documents")),
            drives["value"][0]
        )
        return doc_drive["id"], MS_DRIVE_FOLDER()
    else:
        # App's OneDrive (requires "Files.ReadWrite" delegated scope — use for personal OneDrive)
        resp = graph("GET", "/me/drive")
        return resp["id"], MS_DRIVE_FOLDER()


def ensure_folder(drive_id: str, parent_path: str, folder_name: str) -> str:
    """Create folder if it doesn't exist. Returns item ID."""
    safe_name = "".join(c for c in folder_name if c not in r'\/:*?"<>|')[:128]
    try:
        item = graph("GET", f"/drives/{drive_id}/root:/{parent_path}/{safe_name}")
        return item["id"]
    except Exception:
        # Create it
        parent = graph("GET", f"/drives/{drive_id}/root:/{parent_path}")
        resp = graph("POST", f"/drives/{drive_id}/items/{parent['id']}/children",
                     json={"name": safe_name, "folder": {}, "@microsoft.graph.conflictBehavior": "replace"},
                     headers={"Content-Type": "application/json"})
        return resp["id"]


def upload_file(drive_id: str, parent_id: str, file_path: Path) -> dict:
    """Upload a file using the Graph upload API. Returns item dict with webUrl."""
    data = file_path.read_bytes()
    mime = {
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".json": "application/json",
        ".mp4":  "video/mp4",
        ".mp3":  "audio/mpeg",
    }.get(file_path.suffix.lower(), "application/octet-stream")

    resp = graph(
        "PUT",
        f"/drives/{drive_id}/items/{parent_id}:/{file_path.name}:/content",
        content=data,
        headers={"Content-Type": mime},
    )
    return resp


def create_share_link(drive_id: str, item_id: str) -> str:
    """Create an anonymous view link for a file."""
    try:
        resp = graph("POST", f"/drives/{drive_id}/items/{item_id}/createLink",
                     json={"type": "view", "scope": "anonymous"},
                     headers={"Content-Type": "application/json"})
        return resp.get("link", {}).get("webUrl", "")
    except Exception:
        return ""


# ── Main publish ──────────────────────────────────────────────────────────────

def publish_brief(brief_dir: Path) -> dict:
    """Upload all agent outputs for one brief to OneDrive/SharePoint."""
    a1_file = brief_dir / "agent1_output.json"
    a2_file = brief_dir / "agent2_output.json"

    if not a1_file.exists():
        raise FileNotFoundError(f"agent1_output.json not found in {brief_dir}")

    a1 = json.loads(a1_file.read_text())
    brief = a1["brief"]
    brief_id  = brief["id"]
    channel   = brief["channel"]
    title     = brief["title"][:60]

    print(f"  ☁️  Publishing: [{brief_id}]  {channel}  {title[:45]}...")

    ctx = get_context(AGENT_NAME, channel, brief_id)

    try:
        drive_id, root_folder = get_drive_id()
    except Exception as e:
        print(f"    ❌ OneDrive auth failed: {e}")
        print(f"    ℹ️  Set MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID in .env")
        return {"error": str(e), "brief_id": brief_id}

    # Create folder structure: AI Studio / TikTok / {title}/
    base_folder_id  = ensure_folder(drive_id, "", root_folder)
    chan_folder_id   = ensure_folder(drive_id, root_folder, channel)
    brief_folder_id  = ensure_folder(drive_id, f"{root_folder}/{channel}", title)

    uploaded = []

    # Upload script JSON
    item = upload_file(drive_id, brief_folder_id, a1_file)
    link = create_share_link(drive_id, item["id"])
    uploaded.append({"file": "agent1_output.json", "type": "script", "item_id": item["id"], "url": link, "web_url": item.get("webUrl", "")})
    print(f"    ✅ script uploaded")

    # Upload selected images (from agent2)
    if a2_file.exists():
        a2 = json.loads(a2_file.read_text())
        for sel in a2.get("selected", []):
            if sel.get("file"):
                img_path = ROOT_DIR / sel["file"]
                if img_path.exists():
                    item = upload_file(drive_id, brief_folder_id, img_path)
                    link = create_share_link(drive_id, item["id"])
                    uploaded.append({
                        "file":    img_path.name,
                        "model":   sel["model"],
                        "variant": sel["variant"],
                        "type":    "image",
                        "item_id": item["id"],
                        "url":     link,
                        "web_url": item.get("webUrl", ""),
                        "quality_score": sel["quality_score"],
                    })
                    print(f"    ✅ {img_path.name} uploaded  ({sel['model']} {sel['variant']})")
    else:
        print(f"    ⚠ agent2_output.json not found — images not uploaded")

    output = {
        "agent":        AGENT_NAME,
        "version":      "1.0",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "brief_id":     brief_id,
        "brief_title":  title,
        "channel":      channel,
        "drive_id":     drive_id,
        "folder_path":  f"{root_folder}/{channel}/{title}",
        "uploaded":     uploaded,
        "total_files":  len(uploaded),
    }

    out_path = OUTPUT_DIR / brief_id / "agent3_output.json"
    out_path.write_text(json.dumps(output, indent=2))

    log_run(AGENT_NAME, brief_id,
            {"brief_id": brief_id},
            {"uploaded": len(uploaded), "files": [u["file"] for u in uploaded]},
            quality_score=1.0 if len(uploaded) > 0 else 0.0)

    return output


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="CloudPublish — Images → OneDrive/SharePoint")
    parser.add_argument("--all",      action="store_true")
    parser.add_argument("--brief-id", help="Specific brief ID")
    args = parser.parse_args()

    print(f"\n☁️   {AGENT_NAME} — OneDrive / SharePoint Publisher\n")

    if args.brief_id:
        brief_dirs = [OUTPUT_DIR / args.brief_id]
    else:
        brief_dirs = [d for d in OUTPUT_DIR.iterdir() if d.is_dir()]

    processed, errors = 0, 0
    for brief_dir in sorted(brief_dirs):
        if not (brief_dir / "agent1_output.json").exists():
            continue
        try:
            result = publish_brief(brief_dir)
            if "error" not in result:
                print(f"    📂 {result['folder_path']}  →  {result['total_files']} files")
                processed += 1
            else:
                errors += 1
        except Exception as e:
            print(f"    ❌ Error for {brief_dir.name}: {e}")
            errors += 1
        time.sleep(0.5)

    print(f"\n{'✅' if errors == 0 else '⚠'} CloudPublish done — {processed} published, {errors} errors\n")


if __name__ == "__main__":
    main()
