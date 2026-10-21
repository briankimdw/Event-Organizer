"""Small HTTP API around the model.

    uvicorn app.main:app --port 8000

GET  /health           model + device (no secret needed)
POST /analyze          upload an image, get its auto-tags (for trying the model)
POST /process-pending  analyse waiting photos now (for a database webhook or cron)
POST /embed-text       text -> embedding, for future "search by description"
These POSTs require the X-ML-Secret header to equal ML_WEBHOOK_SECRET.

AI photo tools (app/ai/, contract in docs/AI_TOOLS.md), for signed-in users
('Authorization: Bearer <Supabase access token>'):
GET  /ai/capabilities, POST /ai/remove-background, POST /ai/erase, POST /ai/upscale

(The AI event planner, POST /plan, was archived with the event platform:
archive/event-platform/services/ml-planner/.)
"""
from __future__ import annotations

import hmac
import logging
import threading
from contextlib import asynccontextmanager
from io import BytesIO

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from . import config
from .ai.router import EXPOSED_HEADERS, get_services
from .ai.router import router as ai_router
from .siglip import SigLIP
from .store import Store
from .worker import run_once

state: dict = {}
log = logging.getLogger("ml.api")


def _worker_loop(stop: threading.Event) -> None:
    """ML_WORKER_IN_API=1: analyse waiting photos every ML_WORKER_INTERVAL_S, like app.worker."""
    store = state.setdefault("store", Store())
    while not stop.is_set():
        try:
            while run_once(state["engine"], store) > 0 and not stop.is_set():
                pass
        except Exception as exc:  # network blip, Supabase down: try again next round
            log.warning("worker round failed: %s", exc)
        stop.wait(config.WORKER_INTERVAL_S)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if config.AI_PRELOAD:  # AI tool models: in the background, the API is usable meanwhile
        threading.Thread(target=get_services().registry.preload, name="ai-preload", daemon=True).start()
    state["engine"] = SigLIP()  # load once at startup (a few seconds)
    stop = threading.Event()
    if config.WORKER_IN_API:
        threading.Thread(target=_worker_loop, args=(stop,), name="ml-worker", daemon=True).start()
    yield
    stop.set()


app = FastAPI(title="photomatch ML", lifespan=lifespan)

# Browsers call /ai/* from the web app (and from a phone on the same Wi-Fi in dev).
# Only Authorization/Content-Type may be sent: X-ML-Secret routes stay server-to-server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_origin_regex=config.ALLOWED_ORIGIN_REGEX or None,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=EXPOSED_HEADERS,
    max_age=600,
)
app.include_router(ai_router)


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

