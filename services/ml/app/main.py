"""Small HTTP API around the model.

    uvicorn app.main:app --port 8000

GET  /health           model + device (no secret needed)
POST /analyze          upload an image, get its auto-tags (for trying the model)
POST /process-pending  analyse waiting photos now (for a database webhook or cron)
POST /embed-text       text -> embedding, for future "search by description"
These POSTs require the X-ML-Secret header to equal ML_WEBHOOK_SECRET.

GET  /plan/health      is the AI planner on, and is Claude configured (no auth)
POST /plan             AI event planner (needs a signed-in user's Supabase access token)
"""
from __future__ import annotations

import hmac
import logging
import threading
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from . import config
from .planner.auth import TokenVerifier
from .planner.claude import ClaudeEngine, make_client
from .planner.geocode import Nominatim, known_only
from .planner.schema import PlanRequest
from .planner.finders import SupabaseCatalog, build_finders
from .planner.service import Planner
from .siglip import SigLIP
from .store import Store
from .worker import run_once

log = logging.getLogger(__name__)

state: dict = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    state["engine"] = SigLIP()  # load once at startup (a few seconds)
    yield


app = FastAPI(title="photomatch ML", lifespan=lifespan)

# Browsers may call /plan from the web app (and from a phone on the same Wi-Fi in dev).
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.PLANNER_ALLOWED_ORIGINS,
    allow_origin_regex=config.PLANNER_ALLOWED_ORIGIN_REGEX or None,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


def require_secret(x_ml_secret: str = Header(default="")) -> None:
    if not config.ML_WEBHOOK_SECRET or not hmac.compare_digest(x_ml_secret, config.ML_WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Missing or wrong X-ML-Secret")


@app.get("/health")
def health() -> dict:
    engine: SigLIP = state["engine"]
    return {"ok": True, "model": engine.model_id, "device": engine.device}


@app.post("/analyze", dependencies=[Depends(require_secret)])
async def analyze(image: UploadFile = File(...)) -> dict:
    engine: SigLIP = state["engine"]
    try:
        img = Image.open(BytesIO(await image.read()))
    except Exception:
        raise HTTPException(status_code=400, detail="Not an image")
    embedding, tags = engine.analyze([img])[0]
    return {"tags": tags, "dimensions": len(embedding)}


@app.post("/process-pending", dependencies=[Depends(require_secret)])
def process_pending() -> dict:
    engine: SigLIP = state["engine"]
    store = state.setdefault("store", Store())
    total = 0
    while (n := run_once(engine, store)) > 0:
        total += n
    return {"analysed": total}


class TextIn(BaseModel):
    text: str


@app.post("/embed-text", dependencies=[Depends(require_secret)])
def embed_text(body: TextIn) -> dict:
    engine: SigLIP = state["engine"]
    return {"embedding": engine.embed_texts([body.text])[0].cpu().tolist()}


# ---------------------------------------------------------------------------
# AI planner
# ---------------------------------------------------------------------------
_planner_lock = threading.Lock()


def get_planner() -> Planner:
    """Built on first use (needs the Supabase service role key and the loaded model)."""
    with _planner_lock:
        if "planner" not in state:
            claude_client = make_client() if config.PLANNER_ENGINE != "rules" else None
            geocode = Nominatim() if config.PLANNER_GEOCODER == "nominatim" else known_only
            catalog = SupabaseCatalog(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
            state["planner"] = Planner(
                finders=build_finders(catalog, siglip=state.get("engine")),  # one per vertical
                geocode=geocode,
                claude=ClaudeEngine(claude_client) if claude_client is not None else None,
            )
            log.info("Planner ready (engine: %s)", "claude" if claude_client is not None else "rules")
        return state["planner"]


def require_user(authorization: str = Header(default="")) -> Optional[str]:
    """The caller's user id from 'Authorization: Bearer <Supabase access token>'."""
    if config.PLANNER_DEV_ALLOW_ANON:
        return None  # DEV ONLY (PLANNER_DEV_ALLOW_ANON=1): skips sign-in. Never enable in production.
    token = authorization[7:].strip() if authorization[:7].lower() == "bearer " else ""
    verifier: TokenVerifier = state.setdefault("verifier", TokenVerifier())
    user_id = verifier.user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to use the planner",
                            headers={"WWW-Authenticate": "Bearer"})
    return user_id


@app.get("/plan/health")
def plan_health() -> dict:
    if "claude_available" not in state:
        state["claude_available"] = config.PLANNER_ENGINE != "rules" and make_client() is not None
    return {"ok": True, "claude": state["claude_available"]}


@app.post("/plan")
def plan(body: PlanRequest, _user_id: Optional[str] = Depends(require_user)) -> dict:
    return get_planner().plan(body)
