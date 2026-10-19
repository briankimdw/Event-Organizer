"""Settings, read from environment variables (or services/ml/.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Only services/ml/.env: never pick up other .env files in the repo.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Hugging Face model id. Embedding size must match photo_embeddings.embedding (768).
MODEL_ID = os.getenv("SIGLIP_MODEL", "google/siglip-base-patch16-224")
# "cuda", "cpu", or empty for automatic (GPU if available).
DEVICE = os.getenv("ML_DEVICE") or None

# Supabase project + the SERVER-ONLY service role key (never put this in the frontend).
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
PORTFOLIO_BUCKET = os.getenv("PORTFOLIO_BUCKET", "portfolio")

# Shared secret callers must send (X-ML-Secret header) to trigger work over HTTP.
ML_WEBHOOK_SECRET = os.getenv("ML_WEBHOOK_SECRET", "")

# How many photos to embed per model call.
BATCH_SIZE = int(os.getenv("ML_BATCH_SIZE", "16"))

# --- AI planner (POST /plan) ---------------------------------------------------
# Claude is used when ANTHROPIC_API_KEY (or other Anthropic SDK credentials) is set;
# the SDK reads it from the environment itself. Without it the rules engine runs.
# PLANNER_ENGINE: "auto" (Claude if available, else rules), "rules" (never call Claude).
PLANNER_ENGINE = os.getenv("PLANNER_ENGINE", "auto").strip().lower()
# Public (anon/publishable) key, used only as the apikey header when verifying user
# tokens; falls back to the service role key.
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
# Browser origins allowed to call the API (comma-separated), plus a regex for
# http://<LAN IP>:5173 so the dev site works when opened on a phone.
PLANNER_ALLOWED_ORIGINS = [o.strip() for o in os.getenv("PLANNER_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
PLANNER_ALLOWED_ORIGIN_REGEX = os.getenv(
    "PLANNER_ALLOWED_ORIGIN_REGEX",
    r"^http://(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}):5173$",
)
# "nominatim" (known LA places, then OpenStreetMap) or "off" (known places only).
PLANNER_GEOCODER = os.getenv("PLANNER_GEOCODER", "nominatim").strip().lower()
# DEV ONLY: "1" lets /plan run without a signed-in user. Never set this in production:
# anyone could then spend your Claude credits.
PLANNER_DEV_ALLOW_ANON = os.getenv("PLANNER_DEV_ALLOW_ANON", "") == "1"
