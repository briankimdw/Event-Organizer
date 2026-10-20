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

# --- Browser access (CORS) -------------------------------------------------------
# Origins allowed to call the API from a browser (comma-separated), plus a regex for
# http://<LAN IP>:5173 so the dev site also works when opened on a phone on the same Wi-Fi.
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ML_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
ALLOWED_ORIGIN_REGEX = os.getenv(
    "ML_ALLOWED_ORIGIN_REGEX",
    r"^http://(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}):5173$",
)

# --- Signed-in users (AI photo tools) ----------------------------------------------
# Public (anon/publishable) key, used only as the apikey header when checking user tokens
# with Supabase Auth; falls back to the service role key.
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# --- AI photo tools (/ai/*) ------------------------------------------------------------
# Folder with the ONNX models (scripts/fetch_models.py downloads them there).
AI_MODELS_DIR = Path(os.getenv("AI_MODELS_DIR", "") or Path(__file__).resolve().parents[1] / "models")
AI_MAX_UPLOAD_BYTES = int(float(os.getenv("AI_MAX_UPLOAD_MB", "30")) * 1024 * 1024)  # per file
AI_MAX_PIXELS = int(os.getenv("AI_MAX_PIXELS", "50000000"))       # decoded size, any tool
AI_MAX_EDGE = int(os.getenv("AI_MAX_EDGE", "2048"))               # remove-background, erase: downscale to this
AI_UPSCALE_MAX_EDGE = int(os.getenv("AI_UPSCALE_MAX_EDGE", "1024"))  # upscale: larger input is rejected
AI_RATE_LIMIT = int(os.getenv("AI_RATE_LIMIT", "30"))             # requests per user per window
AI_RATE_WINDOW_S = int(os.getenv("AI_RATE_WINDOW_S", "600"))
AI_QUEUE_TIMEOUT_S = float(os.getenv("AI_QUEUE_TIMEOUT_S", "60"))  # wait for a busy tool, then 503
AI_ORT_THREADS = int(os.getenv("AI_ORT_THREADS", "0"))            # ONNX Runtime threads per model; 0 = all cores
AI_JPEG_QUALITY = int(os.getenv("AI_JPEG_QUALITY", "92"))
# Load the installed models in the background at startup (LaMa takes ~20 s to load on CPU).
AI_PRELOAD = os.getenv("AI_PRELOAD", "1") == "1"

