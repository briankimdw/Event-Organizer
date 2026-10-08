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
