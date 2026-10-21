"""Deploy this service to a Hugging Face Space (Docker, free CPU tier) and print its URL.

    hf auth login                                   # once: paste a token with "write" access
    .venv/Scripts/python scripts/deploy_hf_space.py --origins https://your-site.vercel.app
    .venv/Scripts/python scripts/deploy_hf_space.py --space someone/photomatch-ml --origins ...

What it does:
  1. creates the Space (public: the web app and phones call it directly) if it doesn't exist;
  2. sets the Space's secrets from services/ml/.env (service role key, webhook secret) and its
     variables (Supabase URL + publishable key, allowed browser origins, worker on);
  3. uploads Dockerfile, requirements.txt, app/ and scripts/ with a Space README (sdk: docker).
The Space then builds the image (about 10-15 minutes the first time) and starts.

Secrets go from your .env straight to Hugging Face: they are never printed or written to disk here.
The publishable key falls back to VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
from pathlib import Path

from dotenv import dotenv_values
from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
UPLOAD = ["Dockerfile", "requirements.txt", "app", "scripts"]

README = """---
title: photomatch ML
emoji: 📷
colorFrom: indigo
colorTo: gray
sdk: docker
app_port: 8000
pinned: false
short_description: Photo embeddings, auto-tags and AI photo tools for photomatch
---

The photomatch ML service (FastAPI): SigLIP photo embeddings and auto-tags for Discover, and the
AI photo tools (remove background, erase, upscale). Source: `services/ml` in the app's repository.
`GET /health` and `GET /ai/capabilities` show its state.
"""


def space_url(repo_id: str) -> str:
    owner, name = repo_id.split("/", 1)
    return "https://" + re.sub(r"[._]", "-", f"{owner}-{name}".lower()) + ".hf.space"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--space", help="owner/name (default: <your username>/photomatch-ml)")
    ap.add_argument("--origins", required=True, help="comma-separated browser origins, e.g. https://x.vercel.app")
    ap.add_argument("--no-upload", action="store_true", help="only create the Space and set its settings")
    args = ap.parse_args()

    api = HfApi()
    try:
        user = api.whoami()["name"]
    except Exception:
        print("Not logged in to Hugging Face. Run `hf auth login` (a token with write access) first.", file=sys.stderr)
        return 1
    repo_id = args.space or f"{user}/photomatch-ml"

    env = dotenv_values(ROOT / ".env")
    web = dotenv_values(REPO / "frontend" / ".env.local")
    secrets = {
        "SUPABASE_SERVICE_ROLE_KEY": env.get("SUPABASE_SERVICE_ROLE_KEY"),
        "ML_WEBHOOK_SECRET": env.get("ML_WEBHOOK_SECRET"),
    }
    variables = {
        "SUPABASE_URL": env.get("SUPABASE_URL") or web.get("VITE_SUPABASE_URL"),
        "SUPABASE_ANON_KEY": env.get("SUPABASE_ANON_KEY") or web.get("VITE_SUPABASE_PUBLISHABLE_KEY"),
        "ML_ALLOWED_ORIGINS": ",".join(o.strip().rstrip("/") for o in args.origins.split(",") if o.strip()),
        # No LAN dev origins on a public host (a pattern no browser origin matches).
        "ML_ALLOWED_ORIGIN_REGEX": "^$",
        "ML_WORKER_IN_API": "1",
        "ML_DEVICE": "cpu",
    }
    missing = [k for k, v in {**secrets, **variables}.items() if not v]
    if missing:
        print(f"Missing in services/ml/.env: {', '.join(missing)}", file=sys.stderr)
        return 1

    api.create_repo(repo_id, repo_type="space", space_sdk="docker", private=False, exist_ok=True)
    print(f"Space: https://huggingface.co/spaces/{repo_id}")
    for k, v in secrets.items():
        api.add_space_secret(repo_id, k, v)
    for k, v in variables.items():
        api.add_space_variable(repo_id, k, v)
    print(f"Set {len(secrets)} secrets and {len(variables)} variables.")

    if not args.no_upload:
        with tempfile.TemporaryDirectory() as tmp:
            stage = Path(tmp)
            for name in UPLOAD:
                src = ROOT / name
                if src.is_dir():
                    shutil.copytree(src, stage / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
                else:
                    shutil.copy2(src, stage / name)
            (stage / "README.md").write_text(README, encoding="utf-8")
            api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=stage,
                              commit_message="Deploy photomatch ML", delete_patterns=["app/**", "scripts/**"])
        print("Uploaded. The Space is building; watch the Logs tab on its page.")

    print(f"API URL (VITE_ML_URL / EXPO_PUBLIC_ML_URL): {space_url(repo_id)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
